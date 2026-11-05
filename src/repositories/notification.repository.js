const { pool } = require('../config/db.config');

class NotificationRepository {
    async create(data) {
        const {
            user_id = null,
            vendor_id = null,
            target_type = 'customer',
            order_id = null,
            service_id = null,
            title,
            message,
            type = 'general'
        } = data;

        const [result] = await pool.execute(
            `INSERT INTO notifications (user_id, vendor_id, target_type, order_id, service_id, title, message, type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [user_id, vendor_id, target_type, order_id, service_id, title, message, type]
        );
        return result.insertId;
    }

    /**
     * Create or update a notification for a specific service on an order.
     * Preserves historical notifications for declined or previously processed requests.
     */
    async createOrUpdateForOrder(data) {
        const {
            user_id = null,
            vendor_id = null,
            target_type = 'vendor',
            order_id,
            service_id = null,
            title,
            message,
            type = 'general'
        } = data;

        if (order_id && (vendor_id || user_id)) {
            const condition = vendor_id ? 'vendor_id = ?' : 'user_id = ?';
            const targetId = vendor_id || user_id;

            if (service_id) {
                const [existing] = await pool.execute(
                    `SELECT id FROM notifications WHERE ${condition} AND target_type = ? AND order_id = ? AND service_id = ? ORDER BY id DESC LIMIT 1`,
                    [targetId, target_type, order_id, service_id]
                );

                if (existing.length > 0) {
                    const notifId = existing[0].id;
                    await pool.execute(
                        `UPDATE notifications SET title = ?, message = ?, type = ?, is_read = 0, created_at = NOW() WHERE id = ?`,
                        [title, message, type, notifId]
                    );
                    return notifId;
                }
            }
        }

        return this.create(data);
    }

    async findByUser(userId, limit = 50) {
        const [rows] = await pool.execute(
            `SELECT * FROM notifications 
             WHERE user_id = ? AND target_type = 'customer' AND type != 'chat_message'
             ORDER BY created_at DESC LIMIT ?`,
            [userId, limit.toString()]
        );
        return rows;
    }

    async findByVendor(vendorId, limit = 50) {
        const [rows] = await pool.execute(
            `SELECT * FROM notifications 
             WHERE vendor_id = ? AND target_type = 'vendor' AND type != 'chat_message'
             ORDER BY created_at DESC LIMIT ?`,
            [vendorId, limit.toString()]
        );
        return rows;
    }

    async markAsRead(id) {
        await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
    }

    async markAllAsReadForVendor(vendorId) {
        await pool.execute(
            'UPDATE notifications SET is_read = 1 WHERE vendor_id = ? AND target_type = "vendor"',
            [vendorId]
        );
    }
}

module.exports = new NotificationRepository();

