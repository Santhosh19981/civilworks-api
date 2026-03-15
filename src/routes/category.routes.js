const express = require('express');
const categoryController = require('../controllers/category.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes
router.get('/', categoryController.getAll);
router.get('/:id', categoryController.getById);

// Admin routes
router.post('/admin', protect, checkPermission('categories'), categoryController.create);
router.put('/admin/:id', protect, checkPermission('categories'), categoryController.update);
router.delete('/admin/:id', protect, checkPermission('categories'), categoryController.delete);

module.exports = router;
