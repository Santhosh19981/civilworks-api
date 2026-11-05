const express = require('express');
const bannerController = require('../controllers/banner.controller');
const { protect, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes (used by customer app & admin listing)
router.get('/', bannerController.getAll);
router.get('/:id', bannerController.getById);

// Admin routes (used by admin portal CoreService conventions)
router.post('/admin', protect, checkPermission('categories'), bannerController.create);
router.put('/admin/:id', protect, checkPermission('categories'), bannerController.update);
router.delete('/admin/:id', protect, checkPermission('categories'), bannerController.delete);

// Direct admin routes
router.post('/', protect, checkPermission('categories'), bannerController.create);
router.put('/:id', protect, checkPermission('categories'), bannerController.update);
router.delete('/:id', protect, checkPermission('categories'), bannerController.delete);

module.exports = router;
