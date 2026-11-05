const notificationRepository = require('../repositories/notification.repository');
const { sendSuccess } = require('../utils/response.helper');

class NotificationController {
    getMyNotifications = async (req, res, next) => {
        try {
            let notifications = [];
            if (req.user.vendor_id) {
                notifications = await notificationRepository.findByVendor(req.user.vendor_id);
            } else {
                notifications = await notificationRepository.findByUser(req.user.id);
            }
            sendSuccess(res, 'Notifications retrieved successfully', notifications);
        } catch (error) {
            next(error);
        }
    };

    markRead = async (req, res, next) => {
        try {
            await notificationRepository.markAsRead(req.params.id);
            sendSuccess(res, 'Notification marked as read');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new NotificationController();
