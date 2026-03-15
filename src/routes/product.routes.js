const express = require('express');
const productController = require('../controllers/product.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes
router.get('/', productController.getAll);
router.get('/:id', productController.getById);

// Admin routes
router.post('/admin', protect, checkPermission('products'), productController.create);
router.put('/admin/:id', protect, checkPermission('products'), productController.update);
router.delete('/admin/:id', protect, checkPermission('products'), productController.delete);

module.exports = router;
