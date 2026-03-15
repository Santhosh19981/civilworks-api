const express = require('express');
const helperController = require('../controllers/helper.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes
router.get('/', helperController.getAll);
router.get('/:id', helperController.getById);

// Customer routes
router.post('/bookings', protect, restrictTo('customer'), helperController.createBooking);

// Admin routes
router.get('/admin', protect, checkPermission('helpers'), helperController.getAll);
router.post('/admin', protect, checkPermission('helpers'), helperController.createAdmin);
router.put('/admin/:id', protect, checkPermission('helpers'), helperController.updateAdmin);
router.delete('/admin/:id', protect, checkPermission('helpers'), helperController.deleteAdmin);

module.exports = router;
