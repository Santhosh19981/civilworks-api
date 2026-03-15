const express = require('express');
const rentalCategoryController = require('../controllers/rental-category.controller');
const { protect, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', rentalCategoryController.getAllCategories);
router.get('/:id', rentalCategoryController.getCategory);

// Admin routes
router.post('/admin', protect, checkPermission('categories'), rentalCategoryController.createCategory);
router.put('/admin/:id', protect, checkPermission('categories'), rentalCategoryController.updateCategory);
router.delete('/admin/:id', protect, checkPermission('categories'), rentalCategoryController.deleteCategory);

module.exports = router;
