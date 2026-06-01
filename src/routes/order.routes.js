const express = require('express');
const orderController = require('../controllers/order.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// General protected routes (Auth required)
router.use(protect);

// Customer: place order
router.post('/', restrictTo('customer'), orderController.placeOrder);

// Customer: my orders
router.get('/my-orders', restrictTo('customer'), orderController.getMyOrders);

// Admin: list all orders (GET /orders and GET /orders/admin/all both work)
router.get('/admin/all', checkPermission('orders'), orderController.getAllOrdersAdmin);
router.get('/', checkPermission('orders'), orderController.getAllOrdersAdmin);

// Admin: update order status (PUT /orders/:id/status and PUT /orders/admin/:id/status both work)
router.put('/admin/:id/status', checkPermission('orders'), orderController.updateStatusAdmin);
router.put('/:id/status', checkPermission('orders'), orderController.updateStatusAdmin);

// Detailed view - must be LAST to avoid swallowing other GET routes
router.get('/:id', orderController.getOrderDetails);

module.exports = router;
