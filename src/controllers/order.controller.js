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
            const { address_id, payment_method, notes } = req.body;
            if (!address_id || !payment_method) {
                return next(new AppError('Address and payment method are required', 400));
            }

            // 1. Get Cart Items
            const cartItems = await cartRepository.findByUserId(req.user.id);
            if (cartItems.length === 0) {
                return next(new AppError('Cart is empty', 400));
            }

            // 2. Calculate Totals and Check Stock
            let subtotal = 0;
            for (const item of cartItems) {
                if (item.stock < item.quantity) {
                    throw new AppError(`Insufficient stock for ${item.name}`, 400);
                }
                subtotal += item.price * item.quantity;
            }

            // Placeholder for real tax/delivery logic from settings
            const tax_amount = subtotal * 0.18; // 18% tax
            const delivery_charge = subtotal > 1000 ? 0 : 50;
            const total_amount = subtotal + tax_amount + delivery_charge;

            const order_no = `ORD-${Date.now()}`;

            // 3. Create Order
            const orderId = await orderRepository.createOrder({
                order_no,
                user_id: req.user.id,
                address_id,
                subtotal,
                tax_amount,
                delivery_charge,
                total_amount,
                payment_method,
                notes
            }, connection);

            // 4. Create Order Items & Update Stock
            for (const item of cartItems) {
                await orderRepository.createOrderItem({
                    order_id: orderId,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: item.price
                }, connection);

                // Update Stock
                await connection.execute(
                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                    [item.quantity, item.product_id]
                );
            }

            // 5. Clear Cart
            await connection.execute('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);

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
            
            // Note: Updated OrderRepository.findByUserId to support pagination if needed, 
            // but for now I'll use findAll with user_id filter if I update the repository further.
            // Actually, let's update findByUserId in repository first or use findAll with filters.
            const orders = await orderRepository.findByUserId(req.user.id);
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
