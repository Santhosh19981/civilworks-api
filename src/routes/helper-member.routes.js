const express = require('express');
const router = express.Router();
const helperMemberController = require('../controllers/helper-member.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

// Public or Protected routes
router.use(protect);

router.get('/', helperMemberController.getAll);
router.get('/:id', helperMemberController.getById);

// Admin routes

router.post('/admin', protect, checkPermission('members'), helperMemberController.create);
router.put('/admin/:id', protect, checkPermission('members'), helperMemberController.update);
router.delete('/admin/:id', protect, checkPermission('members'), helperMemberController.delete);

module.exports = router;
