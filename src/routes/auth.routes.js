const express = require('express');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/admin-login', authController.adminLogin);
router.post('/logout', authController.logout);

// Protected routes
router.get('/me', protect, authController.getMe);

module.exports = router;
