const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', protect, notificationController.getMyNotifications);
router.put('/:id/read', protect, notificationController.markRead);

module.exports = router;
