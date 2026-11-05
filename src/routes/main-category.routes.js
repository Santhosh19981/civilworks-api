const express = require('express');
const mainCategoryController = require('../controllers/main-category.controller');
const { protect, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes (used by customer app)
router.get('/', mainCategoryController.getAll);
router.get('/:id', mainCategoryController.getById);

// Admin routes (used by admin portal)
router.post('/admin', protect, checkPermission('categories'), mainCategoryController.create);
router.put('/admin/:id', protect, checkPermission('categories'), mainCategoryController.update);
router.delete('/admin/:id', protect, checkPermission('categories'), mainCategoryController.delete);

module.exports = router;
