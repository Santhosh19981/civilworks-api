const orderRepository = require('../repositories/order.repository');
const cartRepository = require('../repositories/cart.repository');
const productRepository = require('../repositories/product.repository');
const addressRepository = require('../repositories/address.repository');
const { pool } = require('../config/db.config');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class OrderController {
    /**
     * Place Order (Customer)
     */
    placeOrder = async (req, res, next) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            let { address_id, address, payment_method, notes, order_type = 'product', item_id, quantity = 1, price = 0 } = req.body;
            if (!payment_method) {
                return next(new AppError('Payment method is required', 400));
            }

            // Handle address object
            if (!address_id && address && typeof address === 'object') {
                const addressData = {
                    user_id: req.user.id,
                    full_name: address.name || req.user.name,
                    mobile: address.phone,
                    address_line_1: address.addressLine1,
                    address_line_2: address.addressLine2,
                    city: address.city,
                    state: address.state,
                    pincode: address.pincode,
                    is_default: false
                };
                
                const [result] = await connection.execute(
                    'INSERT INTO addresses (user_id, full_name, mobile, address_line_1, address_line_2, city, state, pincode, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [addressData.user_id, addressData.full_name, addressData.mobile, addressData.address_line_1, addressData.address_line_2, addressData.city, addressData.state, addressData.pincode, 0]
                );
                address_id = result.insertId;
            }

            let itemsToOrder = [];
            let subtotal = 0;

            if (order_type === 'product') {
                if (!address_id) return next(new AppError('Address is required for product orders', 400));
                
                const cartItems = await cartRepository.findByUserId(req.user.id);
                if (cartItems.length === 0) return next(new AppError('Cart is empty', 400));

                for (const item of cartItems) {
                    if (item.stock < item.quantity) {
                        throw new AppError(`Insufficient stock for ${item.name}`, 400);
                    }
                    subtotal += item.price * item.quantity;
                    itemsToOrder.push({ product_id: item.product_id, quantity: item.quantity, price: item.price });
                }
            } else {
                if (!item_id) return next(new AppError('Item ID is required', 400));
                subtotal = price * quantity;
                let itemData = { quantity, price };
                if (order_type === 'service') itemData.service_id = item_id;
                else if (order_type === 'rental') itemData.rental_id = item_id;
                else if (order_type === 'helper') itemData.helper_id = item_id;
                itemsToOrder.push(itemData);
            }

            const tax_amount = subtotal * 0.18; // 18% tax
            const delivery_charge = subtotal > 1000 ? 0 : 50;
            const total_amount = subtotal + tax_amount + delivery_charge;
            const order_no = `ORD-${Date.now()}`;

            const orderId = await orderRepository.createOrder({
                order_no, user_id: req.user.id, address_id: address_id || null, order_type,
                subtotal, tax_amount, delivery_charge, total_amount, payment_method, notes: notes || null
            }, connection);

            for (const item of itemsToOrder) {
                await orderRepository.createOrderItem({ order_id: orderId, ...item }, connection);
                
                if (order_type === 'product' && item.product_id) {
                    await connection.execute('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
                }
            }

            if (order_type === 'product') {
                await connection.execute('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
            }

            await connection.commit();

            const order = await orderRepository.findById(orderId);
            const items = await orderRepository.findItemsByOrderId(orderId);

            sendSuccess(res, 'Order placed successfully', { order, items }, 201);
        } catch (error) {
            await connection.rollback();
            next(error);
        } finally {
            connection.release();
        }
    };

    /**
     * Get Customer Orders
     */
    getMyOrders = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            
            const orders = await orderRepository.findByUserId(req.user.id);
            for (let order of orders) {
                order.items = await orderRepository.findItemsByOrderId(order.id);
            }
            sendSuccess(res, 'Orders retrieved successfully', orders);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Order Details
     */
    getOrderDetails = async (req, res, next) => {
        try {
            const order = await orderRepository.findById(req.params.id);
            if (!order) return next(new AppError('Order not found', 404));

            // Check if user owns order or is admin
            if (order.user_id !== req.user.id && !['super_admin', 'admin', 'manager'].includes(req.user.role)) {
                return next(new AppError('Unauthorized', 403));
            }

            const items = await orderRepository.findItemsByOrderId(req.params.id);
            sendSuccess(res, 'Order details retrieved', { order, items });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Get All Orders
     */
    getAllOrdersAdmin = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const filters = { ...req.query };
            delete filters.page;
            delete filters.limit;

            const result = await orderRepository.findAll(filters, page, limit);
            sendSuccess(res, 'All orders retrieved', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Update Order Status
     */
    updateStatusAdmin = async (req, res, next) => {
        try {
            const { status } = req.body;
            if (!status) return next(new AppError('Status is required', 400));

            const success = await orderRepository.updateStatus(req.params.id, status);
            if (!success) return next(new AppError('Order not found', 404));

            sendSuccess(res, 'Order status updated successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new OrderController();
