const express = require('express');
const vendorController = require('../controllers/vendor.controller');
const { protect, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes (used by customer application to view vendors mapped to a subcategory)
router.get('/', vendorController.getAll);
router.get('/:id', vendorController.getById);

// Admin routes (used by Admin Vendors module)
router.post('/admin', protect, checkPermission('vendors', 'helpers'), vendorController.create);
router.put('/admin/:id', protect, checkPermission('vendors', 'helpers'), vendorController.update);
router.delete('/admin/:id', protect, checkPermission('vendors', 'helpers'), vendorController.delete);

module.exports = router;
