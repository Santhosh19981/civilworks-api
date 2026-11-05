const { pool } = require('../config/db.config');

class SOPRepository {
    /**
     * Get all eligible service orders for the authenticated user
     */
    async getEligibleOrders(user) {
        if (user.vendor_id || user.role === 'vendor') {
            const vendorId = user.vendor_id || user.id;
            const [orders] = await pool.execute(
                `SELECT DISTINCT o.id, o.order_no, o.project_name, o.order_status, o.total_amount, o.created_at,
                        u.id as customer_id, u.name as customer_name, u.organization as customer_organization,
                        u.mobile as customer_mobile
                 FROM orders o
                 JOIN order_services os ON o.id = os.order_id
                 JOIN users u ON o.user_id = u.id
                 WHERE os.vendor_id = ? AND os.service_status != 'removed'
                 ORDER BY o.id DESC`,
                [vendorId]
            );
            return orders;
        }

        const isAdmin = ['super_admin', 'admin', 'manager'].includes(user.role) || [1, 2, 3].includes(user.role_id) || [1, 2, 3].includes(Number(user.role_id));
        if (isAdmin) {
            const [orders] = await pool.execute(
                `SELECT o.id, o.order_no, o.project_name, o.order_status, o.total_amount, o.created_at,
                        u.id as customer_id, u.name as customer_name, u.organization as customer_organization,
                        u.mobile as customer_mobile
                 FROM orders o
                 JOIN users u ON o.user_id = u.id
                 WHERE o.order_type = 'service' OR EXISTS (SELECT 1 FROM order_services os WHERE os.order_id = o.id)
                 ORDER BY o.id DESC`
            );
            return orders;
        }

        // All customer accounts default strictly to user-isolated orders
        const [orders] = await pool.execute(
            `SELECT o.id, o.order_no, o.project_name, o.order_status, o.total_amount, o.created_at,
                    u.id as customer_id, u.name as customer_name, u.organization as customer_organization,
                    u.mobile as customer_mobile
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.user_id = ? AND (o.order_type = 'service' OR EXISTS (SELECT 1 FROM order_services os WHERE os.order_id = o.id))
             ORDER BY o.id DESC`,
            [user.id]
        );
        return orders;
    }

    /**
     * Get complete SOP details for a specific order
     */
    async getOrderSOP(orderIdentifier, user) {
        // Fetch order header
        const isNumeric = Number.isInteger(Number(orderIdentifier)) && !String(orderIdentifier).includes('ORD');
        let orderQuery = `
            SELECT o.id, o.order_no, o.project_name, o.user_id, o.order_status, o.total_amount, o.created_at,
                    u.id as customer_id, u.name as customer_name, u.organization as customer_organization,
                    u.mobile as customer_mobile, u.email as customer_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
        `;
        let orderParams = [];
        if (isNumeric) {
            orderQuery += ` WHERE o.id = ? OR o.order_no = ?`;
            orderParams = [Number(orderIdentifier), String(orderIdentifier)];
        } else {
            orderQuery += ` WHERE o.order_no = ?`;
            orderParams = [String(orderIdentifier).trim()];
        }
        const [orders] = await pool.execute(orderQuery, orderParams);

        if (orders.length === 0) return null;
        const order = orders[0];

        const isVendor = !!(user.vendor_id || user.role === 'vendor');
        const vendorId = isVendor ? (user.vendor_id || user.id) : null;
        const isAdmin = ['super_admin', 'admin', 'manager'].includes(user.role) || [1, 2, 3].includes(user.role_id) || [1, 2, 3].includes(Number(user.role_id));
        const isCustomer = order.user_id === user.id;

        // Security check
        if (!isAdmin && !isCustomer && !isVendor) {
            return null;
        }

        // Fetch services
        let serviceQuery = `
            SELECT os.id, os.order_id, os.subcategory_id, os.service_name, os.vendor_id,
                   os.vendor_status, os.service_status, os.price, os.sequence_order,
                   os.description, os.start_date, os.end_date, os.progress_percent,
                   os.created_at, os.updated_at,
                   s.name as subcategory_name,
                   v.name as vendor_name, v.mobile as vendor_mobile, v.email as vendor_email
            FROM order_services os
            LEFT JOIN subcategories s ON os.subcategory_id = s.id
            LEFT JOIN vendors v ON os.vendor_id = v.id
            WHERE os.order_id = ? AND os.service_status != 'removed'
        `;
        const serviceParams = [order.id];

        // VENDOR ISOLATION: A vendor only sees services assigned to their vendor_id
        if (isVendor && !isAdmin) {
            serviceQuery += ` AND os.vendor_id = ?`;
            serviceParams.push(vendorId);
        }

        serviceQuery += ` ORDER BY os.sequence_order ASC, os.id ASC`;

        const [services] = await pool.execute(serviceQuery, serviceParams);

        if (isVendor && !isAdmin && services.length === 0) {
            // Vendor has no assigned services in this order
            return null;
        }

        // Fetch subtasks, proof images, and completion requests for all retrieved services
        for (const service of services) {
            // Fetch subtasks
            let subtaskQuery = `
                SELECT st.*,
                       nos.service_name as next_service_name,
                       nv.name as next_vendor_name
                FROM order_service_subtasks st
                LEFT JOIN order_services nos ON st.next_order_service_id = nos.id
                LEFT JOIN vendors nv ON st.next_vendor_id = nv.id
                WHERE st.order_service_id = ?
            `;
            const subtaskParams = [service.id];
            if (isVendor && !isAdmin) {
                subtaskQuery += ` AND st.vendor_id = ?`;
                subtaskParams.push(vendorId);
            }
            subtaskQuery += ` ORDER BY st.sequence_order ASC, st.id ASC`;

            const [subtasks] = await pool.execute(subtaskQuery, subtaskParams);

            // Fetch proof images for each subtask
            for (const st of subtasks) {
                const [proofs] = await pool.execute(
                    `SELECT id, subtask_id, image_url, original_name, file_size, uploaded_by_type, uploaded_by_id, created_at
                     FROM subtask_proof_images
                     WHERE subtask_id = ?
                     ORDER BY id ASC`,
                    [st.id]
                );
                st.proof_images = proofs || [];
                st.proof_image_url = (proofs && proofs.length > 0) ? proofs[proofs.length - 1].image_url : null;
            }

            service.subtasks = subtasks;

            // Fetch active completion request if any
            const [reqs] = await pool.execute(
                `SELECT scr.id, scr.order_service_id, scr.order_id, scr.vendor_id, scr.status,
                        scr.request_note, scr.rejection_reason, scr.reviewed_by_user_id, scr.reviewed_at, scr.created_at,
                        v.name as vendor_name
                 FROM service_completion_requests scr
                 LEFT JOIN vendors v ON scr.vendor_id = v.id
                 WHERE scr.order_service_id = ?
                 ORDER BY scr.id DESC LIMIT 1`,
                [service.id]
            );
            service.completion_request = reqs.length > 0 ? reqs[0] : null;

            // Auto-compute real-time progress if subtasks exist
            if (subtasks.length > 0) {
                const completedCount = subtasks.filter(st => st.status === 'completed').length;
                service.calculated_progress = Math.round((completedCount / subtasks.length) * 100);
            } else {
                service.calculated_progress = service.service_status === 'completed' ? 100 : 0;
            }
        }

        // Determine vendor display info
        let vendorInfo = { name: 'XYZ Civil Works', mobile: '', email: '' };
        if (services.length > 0 && services[0].vendor_name) {
            vendorInfo = {
                id: services[0].vendor_id,
                name: services[0].vendor_name,
                mobile: services[0].vendor_mobile,
                email: services[0].vendor_email
            };
        } else {
            // Check if there is an accepted vendor in the order
            const [allV] = await pool.execute(
                `SELECT v.id, v.name, v.mobile, v.email 
                 FROM order_services os 
                 JOIN vendors v ON os.vendor_id = v.id 
                 WHERE os.order_id = ? LIMIT 1`,
                [order.id]
            );
            if (allV.length > 0) {
                vendorInfo = allV[0];
            }
        }

        return {
            ...order,
            vendor: vendorInfo,
            services
        };
    }

    /**
     * Reorder services in an order
     */
    async reorderServices(orderId, serviceOrderList) {
        for (const item of serviceOrderList) {
            await pool.execute(
                `UPDATE order_services SET sequence_order = ? WHERE id = ? AND (order_id = ? OR order_id = (SELECT id FROM orders WHERE order_no = ? LIMIT 1))`,
                [item.sequence_order, item.id, orderId, orderId]
            );
        }
    }

    /**
     * Reorder subtasks within a service
     */
    async reorderSubtasks(orderServiceId, subtaskList) {
        for (const item of subtaskList) {
            await pool.execute(
                `UPDATE order_service_subtasks SET sequence_order = ? WHERE id = ? AND order_service_id = ?`,
                [item.sequence_order, item.id, orderServiceId]
            );
        }
    }

    /**
     * Update service details (dates, description)
     */
    async updateService(serviceId, updateData) {
        const fields = [];
        const params = [];

        if (updateData.start_date !== undefined) {
            fields.push('start_date = ?');
            params.push(updateData.start_date);
        }
        if (updateData.end_date !== undefined) {
            fields.push('end_date = ?');
            params.push(updateData.end_date);
        }
        if (updateData.description !== undefined) {
            fields.push('description = ?');
            params.push(updateData.description);
        }
        if (updateData.sequence_order !== undefined) {
            fields.push('sequence_order = ?');
            params.push(updateData.sequence_order);
        }

        if (fields.length === 0) return;

        params.push(serviceId);
        await pool.execute(
            `UPDATE order_services SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
            params
        );
    }

    /**
     * Find order service by id
     */
    async findServiceById(serviceId) {
        const [rows] = await pool.execute(
            `SELECT os.*, o.user_id as customer_user_id, o.order_no, o.project_name,
                    s.name as subcategory_name, v.name as vendor_name
             FROM order_services os
             JOIN orders o ON os.order_id = o.id
             LEFT JOIN subcategories s ON os.subcategory_id = s.id
             LEFT JOIN vendors v ON os.vendor_id = v.id
             WHERE os.id = ?`,
            [serviceId]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Get all services for an order sorted by sequence_order
     */
    async getServicesByOrderId(orderId) {
        const [rows] = await pool.execute(
            `SELECT os.*, s.name as subcategory_name
             FROM order_services os
             LEFT JOIN subcategories s ON os.subcategory_id = s.id
             WHERE os.order_id = ? AND os.service_status != 'removed'
             ORDER BY os.sequence_order ASC, os.id ASC`,
            [orderId]
        );
        return rows;
    }

    /**
     * Add a subtask to an order service
     */
    async createSubtask(data) {
        // Find max sequence order
        const [maxSeq] = await pool.execute(
            `SELECT MAX(sequence_order) as maxSeq FROM order_service_subtasks WHERE order_service_id = ?`,
            [data.order_service_id]
        );
        const nextSeq = (maxSeq[0]?.maxSeq || 0) + 1;

        const [res] = await pool.execute(
            `INSERT INTO order_service_subtasks (
                order_service_id, order_id, vendor_id, next_order_service_id, next_vendor_id, title, description,
                start_date, end_date, status, sequence_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [
                data.order_service_id,
                data.order_id,
                data.vendor_id,
                data.next_order_service_id || null,
                data.next_vendor_id || null,
                data.title,
                data.description || null,
                data.start_date || null,
                data.end_date || null,
                nextSeq
            ]
        );

        return this.findSubtaskById(res.insertId);
    }

    /**
     * Find subtask by id
     */
    async findSubtaskById(subtaskId) {
        const [rows] = await pool.execute(
            `SELECT st.*, os.service_name, os.order_id, os.vendor_id as service_vendor_id,
                    s.name as subcategory_name, o.user_id as customer_user_id,
                    nos.service_name as next_service_name, nv.name as next_vendor_name
             FROM order_service_subtasks st
             JOIN order_services os ON st.order_service_id = os.id
             JOIN orders o ON st.order_id = o.id
             LEFT JOIN subcategories s ON os.subcategory_id = s.id
             LEFT JOIN order_services nos ON st.next_order_service_id = nos.id
             LEFT JOIN vendors nv ON st.next_vendor_id = nv.id
             WHERE st.id = ?`,
            [subtaskId]
        );
        if (rows.length === 0) return null;

        const subtask = rows[0];
        const [proofs] = await pool.execute(
            `SELECT * FROM subtask_proof_images WHERE subtask_id = ? ORDER BY id ASC`,
            [subtaskId]
        );
        subtask.proof_images = proofs || [];
        subtask.proof_image_url = (proofs && proofs.length > 0) ? proofs[proofs.length - 1].image_url : null;
        return subtask;
    }

    /**
     * Update subtask
     */
    async updateSubtask(subtaskId, updateData) {
        const fields = [];
        const params = [];

        if (updateData.title !== undefined) {
            fields.push('title = ?');
            params.push(updateData.title);
        }
        if (updateData.description !== undefined) {
            fields.push('description = ?');
            params.push(updateData.description);
        }
        if (updateData.start_date !== undefined) {
            fields.push('start_date = ?');
            params.push(updateData.start_date);
        }
        if (updateData.end_date !== undefined) {
            fields.push('end_date = ?');
            params.push(updateData.end_date);
        }
        if (updateData.status !== undefined) {
            fields.push('status = ?');
            params.push(updateData.status);
            if (updateData.status === 'completed') {
                fields.push('completed_at = NOW()');
            }
        }
        if (updateData.sequence_order !== undefined) {
            fields.push('sequence_order = ?');
            params.push(updateData.sequence_order);
        }

        if (fields.length === 0) return;

        params.push(subtaskId);
        await pool.execute(
            `UPDATE order_service_subtasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
            params
        );

        // Recalculate parent service progress
        const subtask = await this.findSubtaskById(subtaskId);
        if (subtask) {
            await this.recalculateServiceProgress(subtask.order_service_id);
        }
    }

    /**
     * Delete subtask
     */
    async deleteSubtask(subtaskId) {
        const subtask = await this.findSubtaskById(subtaskId);
        if (!subtask) return;

        await pool.execute(`DELETE FROM subtask_proof_images WHERE subtask_id = ?`, [subtaskId]);
        await pool.execute(`DELETE FROM order_service_subtasks WHERE id = ?`, [subtaskId]);

        await this.recalculateServiceProgress(subtask.order_service_id);
    }

    /**
     * Add proof image to subtask
     */
    async addProofImage(subtaskId, { image_url, original_name, file_size, uploaded_by_type, uploaded_by_id, notes }) {
        const [res] = await pool.execute(
            `INSERT INTO subtask_proof_images (
                subtask_id, image_url, original_name, file_size, uploaded_by_type, uploaded_by_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                subtaskId,
                image_url,
                original_name || null,
                file_size || null,
                uploaded_by_type || 'vendor',
                uploaded_by_id || null,
                notes || null
            ]
        );
        return res.insertId;
    }

    /**
     * Recalculate and update service progress percent based on subtasks
     */
    async recalculateServiceProgress(serviceId) {
        const [subtasks] = await pool.execute(
            `SELECT status FROM order_service_subtasks WHERE order_service_id = ?`,
            [serviceId]
        );

        if (subtasks.length === 0) return;

        const completedCount = subtasks.filter(st => st.status === 'completed').length;
        const progress = Math.round((completedCount / subtasks.length) * 100);

        // Check current service status
        const [svc] = await pool.execute(`SELECT service_status FROM order_services WHERE id = ?`, [serviceId]);
        let newStatus = svc[0]?.service_status || 'pending';

        // Auto move to in_progress if progress started and currently pending
        if (progress > 0 && newStatus === 'pending') {
            newStatus = 'in_progress';
        }

        await pool.execute(
            `UPDATE order_services SET progress_percent = ?, service_status = ?, updated_at = NOW() WHERE id = ?`,
            [progress, newStatus, serviceId]
        );
    }

    /**
     * Raise a service completion request
     */
    async createCompletionRequest(orderServiceId, orderId, vendorId, note) {
        // If already pending, return existing
        const [existing] = await pool.execute(
            `SELECT * FROM service_completion_requests 
             WHERE order_service_id = ? AND status = 'pending'`,
            [orderServiceId]
        );
        if (existing.length > 0) {
            return existing[0];
        }

        const [res] = await pool.execute(
            `INSERT INTO service_completion_requests (
                order_service_id, order_id, vendor_id, status, request_note
            ) VALUES (?, ?, ?, 'pending', ?)`,
            [orderServiceId, orderId, vendorId, note || null]
        );

        const [created] = await pool.execute(
            `SELECT * FROM service_completion_requests WHERE id = ?`,
            [res.insertId]
        );
        return created[0];
    }

    /**
     * Find completion request by id
     */
    async findCompletionRequestById(requestId) {
        const [rows] = await pool.execute(
            `SELECT scr.*, os.service_name, os.order_id, o.user_id as customer_user_id,
                    s.name as subcategory_name, v.name as vendor_name
             FROM service_completion_requests scr
             JOIN order_services os ON scr.order_service_id = os.id
             JOIN orders o ON scr.order_id = o.id
             LEFT JOIN subcategories s ON os.subcategory_id = s.id
             LEFT JOIN vendors v ON scr.vendor_id = v.id
             WHERE scr.id = ?`,
            [requestId]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Customer responds to completion request (accept / reject)
     */
    async respondToCompletionRequest(requestId, customerUserId, action, reason) {
        const req = await this.findCompletionRequestById(requestId);
        if (!req) return null;

        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        await pool.execute(
            `UPDATE service_completion_requests SET 
                status = ?,
                rejection_reason = ?,
                reviewed_by_user_id = ?,
                reviewed_at = NOW(),
                updated_at = NOW()
             WHERE id = ?`,
            [newStatus, action === 'reject' ? reason : null, customerUserId, requestId]
        );

        if (action === 'approve') {
            // Service is marked completed and progress is 100
            await pool.execute(
                `UPDATE order_services SET 
                    service_status = 'completed',
                    progress_percent = 100,
                    updated_at = NOW()
                 WHERE id = ?`,
                [req.order_service_id]
            );
        }

        return this.findCompletionRequestById(requestId);
    }

    /**
     * Check and notify vendors whose assigned next service is due because a subtask is ending today
     */
    async notifyDueSubtaskVendors(io) {
        try {
            const [dueSubtasks] = await pool.execute(`
                SELECT st.id, st.order_id, st.order_service_id, st.title, st.end_date, st.next_order_service_id, st.next_vendor_id,
                       os.service_name as current_service_name,
                       nos.service_name as next_service_name,
                       nv.name as next_vendor_name
                FROM order_service_subtasks st
                JOIN order_services os ON st.order_service_id = os.id
                LEFT JOIN order_services nos ON st.next_order_service_id = nos.id
                LEFT JOIN vendors nv ON st.next_vendor_id = nv.id
                WHERE DATE(st.end_date) = CURDATE()
                  AND st.next_vendor_id IS NOT NULL
                  AND st.status != 'cancelled'
            `);

            const notificationRepository = require('./notification.repository');

            for (const st of dueSubtasks) {
                const [existing] = await pool.execute(`
                    SELECT id FROM notifications 
                    WHERE vendor_id = ? AND order_id = ? AND type = 'sop_next_service_due' AND DATE(created_at) = CURDATE()
                    LIMIT 1
                `, [st.next_vendor_id, st.order_id]);

                if (existing.length === 0) {
                    const title = 'Work Update: Handover Ready';
                    const targetSvcName = st.next_service_name || 'your assigned service';
                    const message = `Subtask "${st.title}" (${st.current_service_name || 'Preceding service'}) is completing today for Order #${st.order_id}. It is your turn to begin ${targetSvcName} next.`;

                    await notificationRepository.create({
                        vendor_id: st.next_vendor_id,
                        target_type: 'vendor',
                        order_id: st.order_id,
                        service_id: st.next_order_service_id,
                        title,
                        message,
                        type: 'sop_next_service_due'
                    });

                    if (io) {
                        io.to(`vendor_${st.next_vendor_id}`).emit('new_notification', {
                            title,
                            message,
                            order_id: st.order_id,
                            service_id: st.next_order_service_id,
                            type: 'sop_next_service_due'
                        });
                    }
                }
            }
        } catch (err) {
            console.error('Error in notifyDueSubtaskVendors:', err);
        }
    }
}

module.exports = new SOPRepository();
