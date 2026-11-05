const express = require('express');
const orderController = require('../controllers/order.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

// Customer: place order
router.post('/', restrictTo('customer'), orderController.placeOrder);

// Customer: my orders (supports ?order_type=product|service|rental)
router.get('/my-orders', restrictTo('customer'), orderController.getMyOrders);

// Customer: Edit Order actions (eligible orders only)
router.post('/:id/services', restrictTo('customer', 'super_admin', 'admin'), orderController.addServiceToOrder);
router.delete('/:id/services/:serviceId', restrictTo('customer', 'super_admin', 'admin'), orderController.removeServiceFromOrder);
router.put('/:id/services/:serviceId/reselect-vendor', restrictTo('customer'), orderController.reselectVendorForService);

// Admin: list all orders; Customer: list own orders
router.get('/admin/all', checkPermission('orders'), orderController.getAllOrdersAdmin);
router.get('/', (req, res, next) => {
    if (req.user.role === 'customer' || req.user.role_id === 4) {
        return orderController.getMyOrders(req, res, next);
    }
    return checkPermission('orders')(req, res, () => orderController.getAllOrdersAdmin(req, res, next));
});

// Admin: update order status
router.put('/admin/:id/status', checkPermission('orders'), orderController.updateStatusAdmin);
router.put('/:id/status', checkPermission('orders'), orderController.updateStatusAdmin);

// Detailed view - must be LAST
router.get('/:id', orderController.getOrderDetails);

module.exports = router;
