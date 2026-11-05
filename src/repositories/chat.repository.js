const { pool } = require('../config/db.config');

class ChatRepository {
    /**
     * Find eligible conversations for a customer
     * Rule: Order must be 'service' type AND have at least one subcategory where is_editable_order = 1.
     * Ongoing orders appear first, then completed; within status sorted by last_message_at DESC.
     */
    async findConversationsForCustomer(userId) {
        const query = `
            SELECT 
                pc.id,
                pc.order_id,
                pc.title,
                pc.status as conversation_status,
                pc.last_message_at,
                pc.created_at,
                o.order_no,
                o.order_status,
                o.order_type,
                o.total_amount,
                CASE 
                    WHEN o.order_status IN ('delivered', 'cancelled') THEN 2
                    ELSE 1
                END as status_priority,
                (
                    SELECT pm.content 
                    FROM project_messages pm 
                    WHERE pm.conversation_id = pc.id 
                    ORDER BY pm.created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT pm.message_type 
                    FROM project_messages pm 
                    WHERE pm.conversation_id = pc.id 
                    ORDER BY pm.created_at DESC 
                    LIMIT 1
                ) as last_message_type,
                (
                    SELECT pm.sender_name 
                    FROM project_messages pm 
                    WHERE pm.conversation_id = pc.id 
                    ORDER BY pm.created_at DESC 
                    LIMIT 1
                ) as last_sender_name,
                (
                    SELECT COUNT(*) 
                    FROM project_messages pm 
                    WHERE pm.conversation_id = pc.id 
                      AND pm.sender_type != 'customer'
                      AND pm.created_at > COALESCE((
                          SELECT cp.last_read_at 
                          FROM conversation_participants cp 
                          WHERE cp.conversation_id = pc.id 
                            AND cp.user_id = ?
                          LIMIT 1
                      ), '1970-01-01')
                ) as unread_count
            FROM project_conversations pc
            JOIN orders o ON pc.order_id = o.id
            WHERE o.user_id = ?
              AND o.order_type = 'service'
              AND EXISTS (
                  SELECT 1 
                  FROM order_services os
                  JOIN subcategories sc ON os.subcategory_id = sc.id
                  WHERE os.order_id = o.id AND (sc.is_editable_order = 1 OR sc.type IN ('services', 'service'))
              )
            ORDER BY status_priority ASC, pc.last_message_at DESC
        `;

        const [conversations] = await pool.execute(query, [userId, userId]);

        for (const conv of conversations) {
            conv.participants = await this.getParticipants(conv.id);
            conv.services = await this.getOrderServices(conv.order_id);
        }

        return conversations;
    }

    /**
     * Find eligible conversations for a vendor
     */
    async findConversationsForVendor(vendorId) {
        const query = `
            SELECT 
                pc.id,
                pc.order_id,
                pc.title,
                pc.status as conversation_status,
                COALESCE(
                    (
                        SELECT pm.created_at 
                        FROM project_messages pm 
                        WHERE pm.conversation_id = pc.id 
                          AND (cp_v.completed_at IS NULL OR pm.created_at <= cp_v.completed_at)
                        ORDER BY pm.created_at DESC 
                        LIMIT 1
                    ),
                    pc.created_at
                ) as last_message_at,
                pc.created_at,
                cp_v.completed_at,
                o.order_no,
                o.order_status,
                o.order_type,
                o.user_id as customer_user_id,
                u.name as customer_name,
                u.mobile as customer_mobile,
                CASE 
                    WHEN o.order_status IN ('delivered', 'cancelled') THEN 2
                    ELSE 1
                END as status_priority,
                (
                    SELECT pm.content 
                    FROM project_messages pm 
                    WHERE pm.conversation_id = pc.id 
                      AND (cp_v.completed_at IS NULL OR pm.created_at <= cp_v.completed_at)
                    ORDER BY pm.created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT pm.message_type 
                    FROM project_messages pm 
                    WHERE pm.conversation_id = pc.id 
                      AND (cp_v.completed_at IS NULL OR pm.created_at <= cp_v.completed_at)
                    ORDER BY pm.created_at DESC 
                    LIMIT 1
                ) as last_message_type,
                (
                    SELECT COUNT(*) 
                    FROM project_messages pm 
                    WHERE pm.conversation_id = pc.id 
                      AND (pm.sender_type != 'vendor' OR pm.sender_id != ?)
                      AND (cp_v.completed_at IS NULL OR pm.created_at <= cp_v.completed_at)
                      AND pm.created_at > COALESCE(cp_v.last_read_at, '1970-01-01')
                ) as unread_count
            FROM project_conversations pc
            JOIN orders o ON pc.order_id = o.id
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN conversation_participants cp_v ON cp_v.conversation_id = pc.id AND cp_v.vendor_id = ?
            WHERE o.order_type = 'service'
              AND (
                  (cp_v.id IS NOT NULL AND cp_v.status = 'active')
                  OR EXISTS (
                      SELECT 1 FROM order_services os
                      WHERE os.order_id = o.id AND os.vendor_id = ? AND os.vendor_status = 'accepted' AND os.service_status != 'removed'
                  )
              )
              AND EXISTS (
                  SELECT 1 
                  FROM order_services os
                  JOIN subcategories sc ON os.subcategory_id = sc.id
                  WHERE os.order_id = o.id AND (sc.is_editable_order = 1 OR sc.type IN ('services', 'service'))
              )
            ORDER BY status_priority ASC, last_message_at DESC
        `;

        const [conversations] = await pool.execute(query, [vendorId, vendorId, vendorId]);

        for (const conv of conversations) {
            // Self-heal: ensure active vendor participant record exists
            try {
                await this.addParticipant(conv.id, {
                    vendorId: vendorId,
                    participantType: 'vendor',
                    status: 'active'
                });
            } catch (e) {
                // Ignore silent duplicate/update failure
            }

            conv.participants = await this.getParticipants(conv.id);
            conv.services = await this.getOrderServices(conv.order_id);

            // Self-heal: check if all active non-removed services for this vendor are completed,
            // but completed_at was not yet recorded in conversation_participants
            if (!conv.completed_at) {
                const myServices = (conv.services || []).filter(
                    s => s.vendor_id == vendorId && s.service_status !== 'removed'
                );
                const isAllCompleted = myServices.length > 0 && myServices.every(s => s.service_status === 'completed');
                if (isAllCompleted) {
                    const [compRows] = await pool.execute(
                        `SELECT created_at FROM project_messages 
                         WHERE conversation_id = ? AND (file_type = 'work_completed' OR message_type = 'work_completed')
                         ORDER BY created_at DESC LIMIT 1`,
                        [conv.id]
                    );
                    const compTime = compRows[0]?.created_at || new Date();
                    await this.markVendorCompleted(conv.id, vendorId, compTime);
                    conv.completed_at = compTime;
                }
            }
        }

        return conversations;
    }

    async findById(id) {
        const [rows] = await pool.execute(
            `SELECT pc.*, o.order_no, o.order_status, o.order_type, o.user_id as customer_user_id, u.name as customer_name, u.mobile as customer_mobile
             FROM project_conversations pc
             JOIN orders o ON pc.order_id = o.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE pc.id = ?`,
            [id]
        );
        if (rows.length === 0) return null;
        const conv = rows[0];
        conv.participants = await this.getParticipants(conv.id);
        conv.services = await this.getOrderServices(conv.order_id);
        return conv;
    }

    async findByOrderId(orderId) {
        const [rows] = await pool.execute(
            'SELECT * FROM project_conversations WHERE order_id = ?',
            [orderId]
        );
        return rows[0] || null;
    }

    async createConversation(orderId, title = null) {
        const [result] = await pool.execute(
            'INSERT INTO project_conversations (order_id, title) VALUES (?, ?)',
            [orderId, title]
        );
        return result.insertId;
    }

    async addParticipant(conversationId, { userId = null, vendorId = null, participantType, status = 'active' }) {
        // Check if participant already exists
        const [existing] = await pool.execute(
            'SELECT * FROM conversation_participants WHERE conversation_id = ? AND participant_type = ? AND (user_id = ? OR vendor_id = ?)',
            [conversationId, participantType, userId, vendorId]
        );

        if (existing.length > 0) {
            await pool.execute(
                'UPDATE conversation_participants SET status = ? WHERE id = ?',
                [status, existing[0].id]
            );
            return existing[0].id;
        }

        const [result] = await pool.execute(
            'INSERT INTO conversation_participants (conversation_id, user_id, vendor_id, participant_type, status) VALUES (?, ?, ?, ?, ?)',
            [conversationId, userId, vendorId, participantType, status]
        );
        return result.insertId;
    }

    async removeParticipant(conversationId, vendorId) {
        await pool.execute(
            'UPDATE conversation_participants SET status = "inactive" WHERE conversation_id = ? AND vendor_id = ?',
            [conversationId, vendorId]
        );
    }

    async getParticipants(conversationId) {
        const query = `
            SELECT 
                cp.id,
                cp.conversation_id,
                cp.participant_type,
                cp.status,
                cp.joined_at,
                cp.last_read_at,
                cp.completed_at,
                cp.user_id,
                cp.vendor_id,
                CASE 
                    WHEN cp.participant_type = 'customer' THEN u.name
                    WHEN cp.participant_type = 'vendor' THEN v.name
                    ELSE 'Administrator'
                END as name,
                CASE 
                    WHEN cp.participant_type = 'customer' THEN u.mobile
                    WHEN cp.participant_type = 'vendor' THEN v.mobile
                    ELSE ''
                END as mobile
            FROM conversation_participants cp
            LEFT JOIN users u ON cp.user_id = u.id AND cp.participant_type = 'customer'
            LEFT JOIN vendors v ON cp.vendor_id = v.id AND cp.participant_type = 'vendor'
            WHERE cp.conversation_id = ?
            ORDER BY cp.participant_type ASC, cp.joined_at ASC
        `;
        const [rows] = await pool.execute(query, [conversationId]);
        return rows;
    }

    async markVendorCompleted(conversationId, vendorId, completedAt = null) {
        const time = completedAt || new Date();
        await pool.execute(
            'UPDATE conversation_participants SET completed_at = ? WHERE conversation_id = ? AND vendor_id = ?',
            [time, conversationId, vendorId]
        );
    }

    async getOrderServices(orderId) {
        const query = `
            SELECT 
                os.*,
                sc.name as subcategory_name,
                sc.image as subcategory_image,
                sc.is_editable_order,
                v.name as vendor_name,
                v.mobile as vendor_mobile
            FROM order_services os
            JOIN subcategories sc ON os.subcategory_id = sc.id
            LEFT JOIN vendors v ON os.vendor_id = v.id
            WHERE os.order_id = ? AND (os.service_status IS NULL OR os.service_status != 'removed')
            ORDER BY os.id ASC
        `;
        const [rows] = await pool.execute(query, [orderId]);
        return rows;
    }

    async getMessages(conversationId, limit = 100, offset = 0, completedAt = null) {
        let query = `
            SELECT * FROM project_messages 
            WHERE conversation_id = ? 
        `;
        const params = [conversationId];

        if (completedAt) {
            query += ` AND created_at <= ? `;
            params.push(completedAt);
        }

        query += ` ORDER BY created_at ASC LIMIT ? OFFSET ? `;
        params.push(limit.toString(), offset.toString());

        const [rows] = await pool.execute(query, params);
        return rows;
    }

    async saveMessage(data) {
        const conversation_id = data.conversation_id;
        const sender_type = data.sender_type || 'system';
        const sender_id = data.sender_id !== undefined ? data.sender_id : null;
        const sender_name = data.sender_name || 'CivilWorks System';
        const message_type = data.message_type || 'system';
        const content = data.content !== undefined ? data.content : null;
        const file_url = data.file_url !== undefined ? data.file_url : (data.attachment_url || null);
        const file_name = data.file_name !== undefined ? data.file_name : (data.attachment_name || null);
        const file_size = data.file_size !== undefined ? data.file_size : (data.attachment_size || null);
        const file_type = data.file_type !== undefined ? data.file_type : (data.attachment_mime || null);

        const [result] = await pool.execute(
            `INSERT INTO project_messages 
             (conversation_id, sender_type, sender_id, sender_name, message_type, content, file_url, file_name, file_size, file_type) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [conversation_id, sender_type, sender_id, sender_name, message_type, content, file_url, file_name, file_size, file_type]
        );

        // Update conversation last_message_at
        await pool.execute(
            'UPDATE project_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
            [conversation_id]
        );

        const messageId = result.insertId;
        const [rows] = await pool.execute('SELECT * FROM project_messages WHERE id = ?', [messageId]);
        return rows[0];
    }

    async markAsRead(conversationId, participantType, identifier) {
        if (participantType === 'customer') {
            await pool.execute(
                'UPDATE conversation_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ? AND participant_type = "customer"',
                [conversationId, identifier]
            );
        } else if (participantType === 'vendor') {
            await pool.execute(
                'UPDATE conversation_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND vendor_id = ? AND participant_type = "vendor"',
                [conversationId, identifier]
            );
        }
    }
}

module.exports = new ChatRepository();
