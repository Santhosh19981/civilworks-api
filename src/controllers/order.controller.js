const orderRepository = require('../repositories/order.repository');
const cartRepository = require('../repositories/cart.repository');
const productRepository = require('../repositories/product.repository');
const subcategoryRepository = require('../repositories/subcategory.repository');
const chatRepository = require('../repositories/chat.repository');
const notificationRepository = require('../repositories/notification.repository');
const { pool } = require('../config/db.config');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class OrderController {
    /**
     * Place Order (Customer)
     * Compulsory Rule: Customer can EITHER buy products, book a rental, or book a service at a single time.
     * Different order types cannot be mixed.
     */
    placeOrder = async (req, res, next) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            let { 
                address_id, 
                address, 
                payment_method, 
                notes, 
                order_type = 'product', 
                item_id, 
                quantity = 1, 
                price = 0, 
                rental_duration = null, 
                unit_name = null,
                services = [], // Array for multi-service order: [{ subcategory_id, vendor_id, price, notes }]
                subcategory_id = null,
                vendor_id = null
            } = req.body;

            if (!payment_method) {
                if (order_type === 'helper') {
                    payment_method = 'direct_booking';
                } else {
                    return next(new AppError('Payment method is required', 400));
                }
            }

            if (!['product', 'service', 'rental', 'helper'].includes(order_type)) {
                return next(new AppError('Invalid order type', 400));
            }

            // Handle inline address object
            if (!address_id && address && typeof address === 'object') {
                const addressData = {
                    user_id: req.user.id,
                    full_name: address.name || req.user.name,
                    mobile: address.phone || req.user.mobile,
                    address_line_1: address.addressLine1 || address.flatNo || address.flat_no || address.address || '',
                    address_line_2: address.addressLine2 || address.areaLocality || address.area_locality || '',
                    landmark: address.landmark || '',
                    city: address.city || 'Hyderabad',
                    state: address.state || 'Telangana',
                    pincode: address.pincode || '500001',
                    is_default: false
                };
                
                const [result] = await connection.execute(
                    'INSERT INTO addresses (user_id, full_name, mobile, address_line_1, address_line_2, landmark, city, state, pincode, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [addressData.user_id, addressData.full_name, addressData.mobile, addressData.address_line_1, addressData.address_line_2, addressData.landmark, addressData.city, addressData.state, addressData.pincode, 0]
                );
                address_id = result.insertId;
            }

            let itemsToOrder = [];
            let servicesToOrder = [];
            let subtotal = 0;
            let hasEditableSubcategory = false;

            if (order_type === 'product') {
                let cartItems = await cartRepository.findByUserId(req.user.id);
                if (cartItems.length === 0 && Array.isArray(req.body.items) && req.body.items.length > 0) {
                    cartItems = req.body.items.map(item => ({
                        product_id: item.product_id || item.product?.id || item.id,
                        name: item.name || item.product?.name || 'Product',
                        price: Number(item.price || item.product?.price || 0),
                        quantity: Number(item.quantity || 1),
                        stock: 99999,
                        subcategory_type: 'selling',
                        unit_name: item.unit_name || item.product?.unit_name || 'Unit',
                        rental_duration: 1
                    }));
                }
                if (cartItems.length === 0) return next(new AppError('Cart is empty', 400));

                for (const item of cartItems) {
                    if (item.subcategory_type && item.subcategory_type !== 'selling') {
                        return next(new AppError('Cannot mix rental or service items in a product selling order', 400));
                    }
                    const isNonSelling = item.subcategory_type === 'renting' || item.subcategory_type === 'services';
                    if (!isNonSelling && item.stock < item.quantity) {
                        throw new AppError(`Insufficient stock for ${item.name}`, 400);
                    }

                    const qty = item.quantity || 1;
                    const lineTotal = item.price * qty;
                    subtotal += lineTotal;

                    itemsToOrder.push({
                        product_id: item.product_id,
                        quantity: qty,
                        price: item.price,
                        unit_name: item.unit_name || 'Piece',
                        rental_duration: null,
                        product_type: 'selling'
                    });
                }
            } else if (order_type === 'rental') {
                if (!item_id) return next(new AppError('Rental item ID is required', 400));
                const duration = rental_duration ? parseInt(rental_duration) : 1;
                const qty = quantity || 1;
                subtotal = price * duration * qty;

                itemsToOrder.push({
                    product_id: item_id,
                    quantity: qty,
                    price: price,
                    unit_name: unit_name || 'Days',
                    rental_duration: duration,
                    product_type: 'renting'
                });
            } else if (order_type === 'service') {
                // Multi-service or single service support
                const rawServices = Array.isArray(services) && services.length > 0 
                    ? services 
                    : (subcategory_id && vendor_id ? [{ subcategory_id, vendor_id, price, notes }] : []);

                if (rawServices.length === 0) {
                    return next(new AppError('Please select at least one service and vendor for this service order', 400));
                }

                for (const s of rawServices) {
                    const subId = s.subcategory_id;
                    const vId = s.vendor_id;
                    const sPrice = Number(s.price || price || 0);

                    if (!subId) return next(new AppError('Subcategory ID is required for each service', 400));
                    if (!vId) return next(new AppError('Vendor selection is required for each service', 400));

                    const subcategory = await subcategoryRepository.findById(subId);
                    if (!subcategory) return next(new AppError('Selected service subcategory does not exist', 400));

                    // Rule: Verify that the vendor exists and is active
                    const [vendorRows] = await connection.execute(
                        'SELECT id, name, status FROM vendors WHERE id = ?',
                        [vId]
                    );
                    if (vendorRows.length === 0) {
                        return next(new AppError('The selected vendor does not exist. An order cannot be placed without a valid vendor.', 400));
                    }
                    if (vendorRows[0].status !== 'active') {
                        return next(new AppError(`Vendor "${vendorRows[0].name}" is currently inactive. Please select an active vendor.`, 400));
                    }

                    // Rule: Verify that this vendor is connected to this specific service subcategory
                    const [mappingRows] = await connection.execute(
                        'SELECT id FROM vendor_subcategories WHERE vendor_id = ? AND subcategory_id = ?',
                        [vId, subId]
                    );
                    if (mappingRows.length === 0) {
                        return next(new AppError(`Vendor "${vendorRows[0].name}" is not connected to service "${subcategory.name}". An order cannot be placed if there are no vendors connected to this service.`, 400));
                    }

                    if (subcategory.is_editable_order || subcategory.type === 'services' || subcategory.type === 'service') {
                        hasEditableSubcategory = true;
                    }

                    subtotal += sPrice;
                    servicesToOrder.push({
                        subcategory_id: subId,
                        vendor_id: vId,
                        price: sPrice,
                        notes: s.notes || notes || null,
                        subcategory_name: subcategory.name
                    });

                    itemsToOrder.push({
                        service_id: subId,
                        quantity: 1,
                        price: sPrice,
                        unit_name: 'Service',
                        product_type: 'selling'
                    });
                }
            } else if (order_type === 'helper') {
                // Helpers order: Direct line item deployment (acting as selling workflow, categorized under services)
                if (item_id) {
                    const qty = Number(quantity || 1);
                    const pPrice = Number(price || 0);
                    subtotal += pPrice * qty;

                    itemsToOrder.push({
                        product_id: item_id,
                        quantity: qty,
                        price: pPrice,
                        unit_name: unit_name || 'Worker',
                        rental_duration: null,
                        product_type: 'selling'
                    });
                } else if (Array.isArray(req.body.items) && req.body.items.length > 0) {
                    for (const item of req.body.items) {
                        const qty = Number(item.quantity || 1);
                        const pPrice = Number(item.price || item.product?.price || 0);
                        subtotal += pPrice * qty;

                        itemsToOrder.push({
                            product_id: item.product_id || item.product?.id || item.id,
                            quantity: qty,
                            price: pPrice,
                            unit_name: item.unit_name || item.product?.unit_name || 'Worker',
                            rental_duration: null,
                            product_type: 'selling'
                        });
                    }
                } else {
                    return next(new AppError('Helper item ID or items list is required', 400));
                }
            }

            const tax_amount = Math.round(subtotal * 0.18 * 100) / 100;
            const delivery_charge = (order_type === 'service' || order_type === 'helper') ? 0 : (subtotal > 1000 ? 0 : 50);
            const total_amount = Math.round((subtotal + tax_amount + delivery_charge) * 100) / 100;
            
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            const order_no = 'ORD-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

            const orderId = await orderRepository.createOrder({
                order_no,
                user_id: req.user.id,
                address_id: address_id || null,
                order_type,
                subtotal,
                tax_amount,
                delivery_charge,
                total_amount,
                payment_method,
                notes: notes || null
            }, connection);

            // Insert standard order items
            for (const item of itemsToOrder) {
                await orderRepository.createOrderItem({ order_id: orderId, ...item }, connection);
                if (item.product_id && item.product_type === 'selling') {
                    await connection.execute('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [item.quantity, item.product_id]);
                }
            }

            // Insert services into order_services table
            for (const s of servicesToOrder) {
                const insertedServiceId = await orderRepository.addOrderService({
                    order_id: orderId,
                    subcategory_id: s.subcategory_id,
                    vendor_id: s.vendor_id,
                    service_name: s.service_name || s.name || s.subcategory_name || null,
                    vendor_status: 'pending',
                    service_status: 'pending',
                    price: s.price,
                    notes: s.notes
                }, connection);
                s.id = insertedServiceId;
            }

            // If order_type is product or helper, clear cart
            if (order_type === 'product' || order_type === 'helper') {
                await connection.execute('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
            }

            // Communication group logic: ONLY if service order AND is_editable_order = true
            let conversationId = null;
            if (order_type === 'service' && hasEditableSubcategory) {
                const [convRes] = await connection.execute(
                    'INSERT INTO project_conversations (order_id, title, status) VALUES (?, ?, "active")',
                    [orderId, `Project Order #${order_no}`]
                );
                conversationId = convRes.insertId;

                // Add customer as active participant
                await connection.execute(
                    'INSERT INTO conversation_participants (conversation_id, user_id, participant_type, status) VALUES (?, ?, "customer", "active")',
                    [conversationId, req.user.id]
                );
            }

            await connection.commit();
            connection.release();

            // Notify vendors
            for (const s of servicesToOrder) {
                await notificationRepository.createOrUpdateForOrder({
                    vendor_id: s.vendor_id,
                    target_type: 'vendor',
                    order_id: orderId,
                    service_id: s.id,
                    title: 'New Service Request',
                    message: `${req.user.name || 'A customer'} requested ${s.subcategory_name} for Order #${order_no}. Please accept or reject.`,
                    type: 'service_request'
                });
            }

            const order = await orderRepository.findById(orderId);
            const items = await orderRepository.findItemsByOrderId(orderId);
            const servicesResult = await orderRepository.findServicesByOrderId(orderId);

            // Broadcast real-time order creation and vendor service requests
            const io = req.app.get('io');
            if (io) {
                io.emit('order_created', {
                    order_id: orderId,
                    user_id: req.user.id,
                    order_no,
                    order_type,
                    conversation_id: conversationId,
                    services: servicesResult
                });
                for (const s of servicesToOrder) {
                    if (s.vendor_id) {
                        io.emit('new_service_request', {
                            vendor_id: s.vendor_id,
                            order_id: orderId,
                            order_no,
                            service_id: s.id,
                            service_name: s.subcategory_name || s.service_name
                        });
                        io.to(`vendor_${s.vendor_id}`).emit('new_service_request', {
                            vendor_id: s.vendor_id,
                            order_id: orderId,
                            order_no,
                            service_id: s.id,
                            service_name: s.subcategory_name || s.service_name
                        });
                    }
                }
            }

            sendSuccess(res, 'Order placed successfully', {
                order,
                items,
                services: servicesResult,
                conversation_id: conversationId,
                is_editable_order: hasEditableSubcategory
            }, 201);
        } catch (error) {
            await connection.rollback();
            connection.release();
            next(error);
        }
    };

    /**
     * Get Customer Orders
     * Supports ?order_type=product|service|rental
     */
    getMyOrders = async (req, res, next) => {
        try {
            const orderType = req.query.order_type || req.query.type || null;
            const orders = await orderRepository.findByUserId(req.user.id, orderType);

            for (const order of orders) {
                order.items = await orderRepository.findItemsByOrderId(order.id);
                order.services = await orderRepository.findServicesByOrderId(order.id);
                order.main_category_name = order.items?.[0]?.main_category_name || 'Construction';
                order.main_category_id = order.items?.[0]?.main_category_id || 1;

                // Determine if order is editable and has chat (all service orders are editable projects)
                order.is_editable_order = order.order_type === 'service';

                if (order.is_editable_order) {
                    const conv = await chatRepository.findByOrderId(order.id);
                    order.conversation_id = conv?.id || null;
                }

                if (order.address_line_1 || order.address_name) {
                    order.address = {
                        full_name: order.address_name,
                        mobile: order.address_mobile,
                        address_line_1: order.address_line_1,
                        address_line_2: order.address_line_2,
                        city: order.city,
                        state: order.state,
                        pincode: order.pincode
                    };
                }
            }

            sendSuccess(res, 'Orders retrieved successfully', orders);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Order Details
     */
    getById = async (req, res, next) => {
        try {
            const order = await orderRepository.findById(req.params.id);
            if (!order) return next(new AppError('Order not found', 404));

            const isCustomer = req.user.role === 'customer' || req.user.role_id === 4;
            if (isCustomer && order.user_id !== req.user.id) {
                return next(new AppError('Unauthorized access to this order', 403));
            }

            order.items = await orderRepository.findItemsByOrderId(order.id);
            order.services = await orderRepository.findServicesByOrderId(order.id);
            order.is_editable_order = order.order_type === 'service';

            if (order.is_editable_order) {
                const conv = await chatRepository.findByOrderId(order.id);
                order.conversation_id = conv?.id || null;
                if (conv) {
                    order.participants = await chatRepository.getParticipants(conv.id);
                }
            }

            if (order.address_line_1 || order.full_name) {
                order.address = {
                    full_name: order.full_name,
                    mobile: order.address_mobile,
                    address_line_1: order.address_line_1,
                    address_line_2: order.address_line_2,
                    city: order.city,
                    state: order.state,
                    pincode: order.pincode
                };
            }

            sendSuccess(res, 'Order retrieved successfully', order);
        } catch (error) {
            next(error);
        }
    };

    getOrderDetails = this.getById;

    /**
     * Add Service to Existing Eligible Order (Edit Order Flow)
     */
    addServiceToOrder = async (req, res, next) => {
        try {
            const orderId = req.params.id;
            const { subcategory_id, vendor_id, service_name = null, price = 0, notes = null } = req.body;

            const order = await orderRepository.findById(orderId);
            if (!order) return next(new AppError('Order not found', 404));

            const targetOrderId = order.id;

            if (order.user_id !== req.user.id && !['super_admin', 'admin', 'manager'].includes(req.user.role)) {
                return next(new AppError('Unauthorized access to this order', 403));
            }

            if (order.order_type !== 'service') {
                return next(new AppError('Only service orders can be edited', 400));
            }

            // Check existing services
            const existingServices = await orderRepository.findServicesByOrderId(targetOrderId);

            if (!subcategory_id || !vendor_id) {
                return next(new AppError('Subcategory and Vendor are required', 400));
            }

            // RULE: If a vendor is added to that order with one service, they should NOT be added a 2nd time (twice) for that same service
            const isAlreadyAssigned = existingServices.some(
                s => Number(s.subcategory_id) === Number(subcategory_id) &&
                     Number(s.vendor_id) === Number(vendor_id) &&
                     s.service_status !== 'removed'
            );
            if (isAlreadyAssigned) {
                return next(new AppError('This vendor is already assigned to this service on this project order. A vendor cannot be added twice for the same service.', 400));
            }

            const subcategory = await subcategoryRepository.findById(subcategory_id);
            if (!subcategory) return next(new AppError('Selected subcategory not found', 400));

            // Rule: Verify that vendor exists and is active
            const [vendorRows] = await pool.execute(
                'SELECT id, name, status FROM vendors WHERE id = ?',
                [vendor_id]
            );
            if (vendorRows.length === 0) {
                return next(new AppError('The selected vendor does not exist. Cannot add service without a valid vendor.', 400));
            }
            if (vendorRows[0].status !== 'active') {
                return next(new AppError(`Vendor "${vendorRows[0].name}" is currently inactive.`, 400));
            }

            // Rule: Verify that vendor is connected to this specific subcategory
            const [mappingRows] = await pool.execute(
                'SELECT id FROM vendor_subcategories WHERE vendor_id = ? AND subcategory_id = ?',
                [vendor_id, subcategory_id]
            );
            if (mappingRows.length === 0) {
                return next(new AppError(`Vendor "${vendorRows[0].name}" is not connected to service "${subcategory.name}". Cannot add service to order.`, 400));
            }

            // Resolve service_name if not provided
            let finalServiceName = service_name;
            if (!finalServiceName) {
                const [prods] = await pool.execute('SELECT name FROM products WHERE subcategory_id = ? LIMIT 1', [subcategory_id]);
                finalServiceName = prods?.[0]?.name || subcategory.name;
            }

            const serviceId = await orderRepository.addOrderService({
                order_id: targetOrderId,
                subcategory_id,
                vendor_id,
                service_name: finalServiceName,
                vendor_status: 'pending',
                service_status: 'pending',
                price: Number(price || 0),
                notes
            });

            // Ensure project conversation exists
            let conversation = await chatRepository.findByOrderId(targetOrderId);
            if (!conversation) {
                const convId = await chatRepository.createConversation(targetOrderId, `Project Order #${order.order_no}`);
                conversation = { id: convId };
                await chatRepository.addParticipant(convId, {
                    userId: order.user_id,
                    participantType: 'customer',
                    status: 'active'
                });
            }

            // Post system update in existing conversation
            await chatRepository.saveMessage({
                conversation_id: conversation.id,
                sender_type: 'system',
                sender_name: 'CivilWorks System',
                message_type: 'system',
                content: `Customer added a new service: ${subcategory.name}. Vendor request sent.`
            });

            // Notify vendor
            await notificationRepository.createOrUpdateForOrder({
                vendor_id,
                target_type: 'vendor',
                order_id: targetOrderId,
                service_id: serviceId,
                title: 'New Service Request (Added to Project)',
                message: `${req.user.name || 'Customer'} added ${subcategory.name} to Project Order #${order.order_no}. Please accept or reject.`,
                type: 'service_request'
            });

            const updatedServices = await orderRepository.findServicesByOrderId(targetOrderId);

            const io = req.app.get('io');
            if (io) {
                io.emit('order_service_added', {
                    order_id: targetOrderId,
                    service_id: serviceId,
                    vendor_id,
                    services: updatedServices
                });
                io.emit('new_service_request', {
                    vendor_id,
                    order_id: targetOrderId,
                    order_no: order.order_no,
                    service_id: serviceId,
                    service_name: subcategory.name
                });
            }

            sendSuccess(res, 'Service added successfully. Request sent to vendor.', {
                service_id: serviceId,
                order: order,
                services: updatedServices
            }, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Remove Service from Existing Eligible Order
     */
    removeServiceFromOrder = async (req, res, next) => {
        try {
            const orderId = req.params.id;
            const serviceId = req.params.serviceId;

            const order = await orderRepository.findById(orderId);
            if (!order) return next(new AppError('Order not found', 404));

            const targetOrderId = order.id;

            if (order.user_id !== req.user.id && !['super_admin', 'admin', 'manager'].includes(req.user.role)) {
                return next(new AppError('Unauthorized access to this order', 403));
            }

            if (order.order_type !== 'service') {
                return next(new AppError('Only service orders can be edited', 400));
            }

            const existingServices = await orderRepository.findServicesByOrderId(targetOrderId);

            const targetService = existingServices.find(s => s.id == serviceId);
            if (!targetService) {
                return next(new AppError('Service not found on this order', 404));
            }

            if (targetService.service_status === 'completed') {
                return next(new AppError('Cannot remove a service that is already completed', 400));
            }

            // Soft remove: update service_status to 'removed'
            await orderRepository.updateOrderService(serviceId, {
                service_status: 'removed',
                vendor_status: 'rejected'
            });

            // If conversation exists, post system message and mark vendor inactive if no other active services
            const conversation = await chatRepository.findByOrderId(targetOrderId);
            if (conversation) {
                const remainingServicesForVendor = existingServices.filter(
                    s => s.vendor_id == targetService.vendor_id && s.id != serviceId && s.service_status !== 'removed'
                );
                if (remainingServicesForVendor.length === 0) {
                    await chatRepository.removeParticipant(conversation.id, targetService.vendor_id);
                }

                const systemMsg = `${targetService.vendor_name} / ${targetService.subcategory_name} service was removed from this project.`;
                const savedMsg = await chatRepository.saveMessage({
                    conversation_id: conversation.id,
                    sender_type: 'system',
                    sender_name: 'CivilWorks System',
                    message_type: 'system',
                    content: systemMsg
                });

                const io = req.app.get('io');
                if (io) {
                    io.to(`conversation_${conversation.id}`).emit('new_message', savedMsg);
                    io.to(`conversation_${conversation.id}`).emit('service_removed', {
                        service_id: serviceId,
                        vendor_id: targetService.vendor_id,
                        conversation_id: conversation.id
                    });
                    io.to(`conversation_${conversation.id}`).emit('participant_removed', {
                        vendor_id: targetService.vendor_id,
                        conversation_id: conversation.id
                    });
                    io.emit('service_removed', {
                        order_id: targetOrderId,
                        service_id: serviceId,
                        vendor_id: targetService.vendor_id
                    });
                }
            }

            // Notify vendor
            await notificationRepository.createOrUpdateForOrder({
                vendor_id: targetService.vendor_id,
                target_type: 'vendor',
                order_id: targetOrderId,
                service_id: serviceId,
                title: 'Service Removed from Order',
                message: `The ${targetService.subcategory_name} service on Order #${order.order_no} has been removed by the customer.`,
                type: 'service_removed'
            });

            const updatedServices = await orderRepository.findServicesByOrderId(targetOrderId);
            sendSuccess(res, 'Service removed successfully. Project history preserved.', updatedServices);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Reselect Vendor for a Rejected Service
     */
    reselectVendorForService = async (req, res, next) => {
        try {
            const orderId = req.params.id;
            const serviceId = req.params.serviceId;
            const new_vendor_id = req.body.new_vendor_id || req.body.vendor_id;

            if (!new_vendor_id) return next(new AppError('New vendor ID is required', 400));

            const order = await orderRepository.findById(orderId);
            if (!order) return next(new AppError('Order not found', 404));

            const targetOrderId = order.id;

            if (order.user_id !== req.user.id) {
                return next(new AppError('Unauthorized access to this order', 403));
            }

            const existingServices = await orderRepository.findServicesByOrderId(targetOrderId);
            const targetService = existingServices.find(s => s.id == serviceId);
            if (!targetService) return next(new AppError('Service not found on this order', 404));

            // Prevent assigning a vendor who is already assigned to this same service on this order
            const isAlreadyAssigned = existingServices.some(
                s => Number(s.id) !== Number(serviceId) &&
                     Number(s.subcategory_id) === Number(targetService.subcategory_id) &&
                     Number(s.vendor_id) === Number(new_vendor_id) &&
                     s.service_status !== 'removed'
            );
            if (isAlreadyAssigned) {
                return next(new AppError('This vendor is already assigned to this service on this project order.', 400));
            }

            // Rule: Verify that new vendor exists and is active
            const [vendorRows] = await pool.execute(
                'SELECT id, name, status FROM vendors WHERE id = ?',
                [new_vendor_id]
            );
            if (vendorRows.length === 0) {
                return next(new AppError('The selected vendor does not exist.', 400));
            }
            if (vendorRows[0].status !== 'active') {
                return next(new AppError(`Vendor "${vendorRows[0].name}" is currently inactive.`, 400));
            }

            // Rule: Verify that new vendor is connected to this service
            const [mappingRows] = await pool.execute(
                'SELECT id FROM vendor_subcategories WHERE vendor_id = ? AND subcategory_id = ?',
                [new_vendor_id, targetService.subcategory_id]
            );
            if (mappingRows.length === 0) {
                return next(new AppError(`Vendor "${vendorRows[0].name}" is not connected to service "${targetService.subcategory_name}".`, 400));
            }

            await orderRepository.updateOrderService(serviceId, {
                vendor_id: new_vendor_id,
                vendor_status: 'pending',
                service_status: 'pending'
            });

            // Notify new vendor
            await notificationRepository.create({
                vendor_id: new_vendor_id,
                target_type: 'vendor',
                order_id: targetOrderId,
                service_id: serviceId,
                title: 'New Service Request',
                message: `${req.user.name || 'A customer'} selected you for ${targetService.subcategory_name} on Order #${order.order_no}. Please accept or reject.`,
                type: 'service_request'
            });

            const updatedServices = await orderRepository.findServicesByOrderId(targetOrderId);

            const io = req.app.get('io');
            if (io) {
                const reselectPayload = {
                    order_id: targetOrderId,
                    service_id: serviceId,
                    vendor_id: new_vendor_id,
                    vendor_status: 'pending',
                    service_status: 'pending',
                    services: updatedServices
                };
                io.emit('vendor_status_updated', reselectPayload);
                io.emit('order_service_updated', reselectPayload);
                io.emit('new_service_request', {
                    vendor_id: new_vendor_id,
                    order_id: targetOrderId,
                    order_no: order.order_no,
                    service_id: serviceId,
                    service_name: targetService.subcategory_name
                });
            }

            sendSuccess(res, 'New vendor selected successfully. Request dispatched.', updatedServices);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get All Orders (Admin)
     */
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const filters = {
                status: req.query.status,
                search: req.query.search
            };

            const result = await orderRepository.findAll(filters, page, limit);
            for (const order of result.data) {
                order.items = await orderRepository.findItemsByOrderId(order.id);
                order.services = await orderRepository.findServicesByOrderId(order.id);
            }
            sendSuccess(res, 'Orders retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Order Status (Admin)
     */
    updateStatus = async (req, res, next) => {
        try {
            const { status } = req.body;
            if (!status) return next(new AppError('Status is required', 400));

            const success = await orderRepository.updateStatus(req.params.id, status);
            if (!success) return next(new AppError('Order not found', 404));

            const order = await orderRepository.findById(req.params.id);
            sendSuccess(res, 'Order status updated successfully', order);
        } catch (error) {
            next(error);
        }
    };

    getAllOrdersAdmin = this.getAll;
    updateStatusAdmin = this.updateStatus;
    getOrderDetails = this.getById;
}

module.exports = new OrderController();
