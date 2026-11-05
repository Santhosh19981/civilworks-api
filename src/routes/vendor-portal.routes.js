const express = require('express');
const vendorPortalController = require('../controllers/vendor-portal.controller');
const { protect } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

const router = express.Router();

// Public auth endpoints
router.post('/check-mobile', vendorPortalController.checkMobile);
router.post('/send-otp', vendorPortalController.sendOtp);
router.post('/verify-otp', vendorPortalController.verifyOtp);
router.post('/login', vendorPortalController.loginByMobile);
router.post('/signup', vendorPortalController.signup);
router.get('/subcategories', vendorPortalController.getServiceSubcategories);
router.post('/upload', upload.single('image'), vendorPortalController.uploadPhoto);

// Protected vendor portal actions
router.get('/me', protect, vendorPortalController.getProfile);
router.get('/requests', protect, vendorPortalController.getRequests);
router.get('/notifications', protect, vendorPortalController.getNotifications);
router.post('/notifications/mark-read', protect, vendorPortalController.markNotificationsRead);
router.get('/conversations', protect, vendorPortalController.getConversations);
router.post('/requests/:id/accept', protect, vendorPortalController.acceptRequest);
router.post('/requests/:id/reject', protect, vendorPortalController.rejectRequest);

module.exports = router;
