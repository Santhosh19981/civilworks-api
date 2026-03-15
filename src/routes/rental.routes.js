const express = require('express');
const rentalController = require('../controllers/rental.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes
router.get('/', rentalController.getAll);
router.get('/:id', rentalController.getById);

// Customer routes
router.post('/bookings', protect, restrictTo('customer'), rentalController.createBooking);

// Admin routes
router.get('/admin', protect, checkPermission('rentals'), rentalController.getAll);
router.post('/admin', protect, checkPermission('rentals'), rentalController.createAdmin);
router.put('/admin/:id', protect, checkPermission('rentals'), rentalController.updateAdmin);
router.delete('/admin/:id', protect, checkPermission('rentals'), rentalController.deleteAdmin);

module.exports = router;
