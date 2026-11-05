const express = require('express');
const unitController = require('../controllers/unit.controller');
const { protect, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes (used by Product form and customer view)
router.get('/', unitController.getAll);
router.get('/:id', unitController.getById);

// Admin routes (used by Units module)
router.post('/admin', protect, checkPermission('products'), unitController.create);
router.put('/admin/:id', protect, checkPermission('products'), unitController.update);
router.delete('/admin/:id', protect, checkPermission('products'), unitController.delete);

module.exports = router;
