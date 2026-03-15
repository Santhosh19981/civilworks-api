const express = require('express');
const paymentController = require('../controllers/payment.controller');
const bannerController = require('../controllers/banner.controller');
const settingsController = require('../controllers/settings.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes
router.get('/banners', bannerController.getAll);
router.get('/settings', settingsController.getSettings);

// Protected routes (Customer)
router.post('/payments/initiate', protect, paymentController.initiate);
router.post('/payments/verify', protect, paymentController.verify);

// Admin routes
router.get('/admin/payments', protect, restrictTo('super_admin', 'admin'), paymentController.getAllAdmin);
router.post('/admin/banners', protect, restrictTo('super_admin', 'admin'), bannerController.create);
router.put('/admin/banners/:id', protect, restrictTo('super_admin', 'admin'), bannerController.update);
router.delete('/admin/banners/:id', protect, restrictTo('super_admin', 'admin'), bannerController.delete);
router.put('/admin/settings', protect, restrictTo('super_admin', 'admin'), settingsController.updateSettings);

module.exports = router;
