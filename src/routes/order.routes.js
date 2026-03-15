const express = require('express');
const orderController = require('../controllers/order.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// General protected routes (Auth required)
router.use(protect);

// Customer routes
router.post('/', restrictTo('customer'), orderController.placeOrder);
router.get('/my-orders', restrictTo('customer'), orderController.getMyOrders);

// Detailed view (Customer/Admin)
router.get('/:id', orderController.getOrderDetails);

// Admin routes
router.get('/admin/all', checkPermission('orders'), orderController.getAllOrdersAdmin);
router.put('/admin/:id/status', checkPermission('orders'), orderController.updateStatusAdmin);

module.exports = router;
