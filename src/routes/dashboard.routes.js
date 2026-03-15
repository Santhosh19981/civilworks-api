const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { protect, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/stats', protect, checkPermission('dashboard'), dashboardController.getStats);
router.get('/payments/stats', protect, checkPermission('payments'), dashboardController.getPaymentStats);
router.get('/reports/revenue', protect, checkPermission('reports'), dashboardController.getRevenueReport);

module.exports = router;
