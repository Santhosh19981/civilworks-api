const express = require('express');
const skillController = require('../controllers/skill.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public routes
router.get('/', skillController.getAll);
router.get('/:id', skillController.getById);

// Admin routes
router.post('/admin', protect, restrictTo('super_admin', 'admin', 'manager'), skillController.create);
router.put('/admin/:id', protect, restrictTo('super_admin', 'admin', 'manager'), skillController.update);
router.delete('/admin/:id', protect, restrictTo('super_admin', 'admin', 'manager'), skillController.delete);

module.exports = router;
