const { pool } = require('../config/db.config');
const sopRepository = require('../repositories/sop.repository');
const notificationRepository = require('../repositories/notification.repository');
const chatRepository = require('../repositories/chat.repository');
const { sendSuccess, sendError } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class SOPController {
    /**
     * Get all eligible service orders for current user
     */
    getOrders = async (req, res, next) => {
        try {
            const orders = await sopRepository.getEligibleOrders(req.user);
            sendSuccess(res, 'SOP eligible orders retrieved successfully', orders);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get full SOP sequence for a specific order
     */
    getOrderSOP = async (req, res, next) => {
        try {
            const orderId = req.params.orderId;
            const sopData = await sopRepository.getOrderSOP(orderId, req.user);

            if (!sopData) {
                return next(new AppError('SOP order not found or you are not authorized to view it', 404));
            }

            sendSuccess(res, 'SOP details retrieved successfully', sopData);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Reorder services sequence
     */
    reorderServices = async (req, res, next) => {
        try {
            const orderId = req.params.orderId;
            const { services } = req.body;

            if (!Array.isArray(services) || services.length === 0) {
                return next(new AppError('Services list with sequence orders is required', 400));
            }

            // Verify order exists and user is authorized
            const sop = await sopRepository.getOrderSOP(orderId, req.user);
            if (!sop) {
                return next(new AppError('Order not found or unauthorized', 403));
            }

            await sopRepository.reorderServices(sop.id, services);

            // Fetch refreshed SOP
            const updatedSOP = await sopRepository.getOrderSOP(sop.id, req.user);

            // Emit real-time update
            const io = req.app.get('io');
            if (io) {
                io.emit('sop_sequence_updated', {
                    orderId: sop.id,
                    order_id: sop.id,
                    order_no: sop.order_no,
                    services: updatedSOP.services
                });
            }

            sendSuccess(res, 'Service sequence updated successfully', updatedSOP);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update service details (dates, description)
     */
    updateService = async (req, res, next) => {
        try {
            const serviceId = req.params.serviceId;
            const { start_date, end_date, description, sequence_order } = req.body;

            const service = await sopRepository.findServiceById(serviceId);
            if (!service) {
                return next(new AppError('Service not found', 404));
            }

            // Authorization: vendor assigned to service, customer owner, or admin
            const isVendor = req.user.vendor_id && req.user.vendor_id == service.vendor_id;
            const isCustomer = !req.user.vendor_id && req.user.id == service.customer_user_id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isVendor && !isCustomer && !isAdmin) {
                return next(new AppError('You are not authorized to edit this service', 403));
            }

            // Validate start_date <= end_date for the service
            const finalStart = start_date !== undefined ? start_date : service.start_date;
            const finalEnd = end_date !== undefined ? end_date : service.end_date;
            if (finalStart && finalEnd) {
                if (new Date(finalStart).getTime() > new Date(finalEnd).getTime()) {
                    return next(new AppError('Start date cannot be after end date', 400));
                }
            }

            await sopRepository.updateService(serviceId, {
                start_date,
                end_date,
                description,
                sequence_order
            });

            const updatedService = await sopRepository.findServiceById(serviceId);

            // Emit socket event
            const io = req.app.get('io');
            if (io) {
                io.emit('sop_service_updated', {
                    serviceId,
                    service_id: serviceId,
                    orderId: service.order_id,
                    order_id: service.order_id,
                    updatedService
                });
            }

            sendSuccess(res, 'Service updated successfully', updatedService);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Add subtask to a service
     */
    createSubtask = async (req, res, next) => {
        try {
            const serviceId = req.params.serviceId;
            const { title, description, start_date, end_date, next_order_service_id, next_vendor_id } = req.body;

            if (!title || !title.trim()) {
                return next(new AppError('Subtask title is required', 400));
            }
            if (start_date && end_date && new Date(start_date).getTime() > new Date(end_date).getTime()) {
                return next(new AppError('Subtask end date cannot be before the start date', 400));
            }

            const service = await sopRepository.findServiceById(serviceId);
            if (!service) {
                return next(new AppError('Service not found', 404));
            }

            // Authorization: assigned vendor or admin
            const isVendor = req.user.vendor_id && req.user.vendor_id == service.vendor_id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);
            // Allow customers if permitted by organization
            const isCustomer = !req.user.vendor_id && req.user.id == service.customer_user_id;

            if (!isVendor && !isAdmin && !isCustomer) {
                return next(new AppError('You are not authorized to create subtasks for this service', 403));
            }

            let resolvedNextVendorId = next_vendor_id || null;
            if (next_order_service_id && !resolvedNextVendorId) {
                const { pool } = require('../config/db.config');
                const [targetRows] = await pool.execute('SELECT vendor_id FROM order_services WHERE id = ?', [next_order_service_id]);
                if (targetRows.length > 0) {
                    resolvedNextVendorId = targetRows[0].vendor_id;
                }
            }

            const subtask = await sopRepository.createSubtask({
                order_service_id: service.id,
                order_id: service.order_id,
                vendor_id: service.vendor_id,
                next_order_service_id: next_order_service_id ? Number(next_order_service_id) : null,
                next_vendor_id: resolvedNextVendorId ? Number(resolvedNextVendorId) : null,
                title: title.trim(),
                description: description ? description.trim() : null,
                start_date: start_date || null,
                end_date: end_date || null
            });

            // Emit socket event
            const io = req.app.get('io');
            if (io) {
                io.emit('sop_subtask_created', {
                    serviceId: service.id,
                    service_id: service.id,
                    orderId: service.order_id,
                    order_id: service.order_id,
                    subtask
                });
            }

            // Trigger handover notification to next vendor immediately whenever next_vendor_id is provided
            if (resolvedNextVendorId) {
                try {
                    const [targetSvcRows] = next_order_service_id
                        ? await pool.execute('SELECT os.service_name, sc.name as subcat_name FROM order_services os LEFT JOIN subcategories sc ON os.subcategory_id = sc.id WHERE os.id = ?', [next_order_service_id])
                        : [[]];
                    const targetSvcName = targetSvcRows[0]?.service_name || targetSvcRows[0]?.subcat_name || 'your assigned trade';
                    const notifTitle = `Process Progress Alert: Order #${service.order_id}`;
                    const notifMsg = `the before process is completing soon , you order is on ${subtask.end_date ? new Date(subtask.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'the upcoming schedule'}`;

                    const notifId = await notificationRepository.create({
                        vendor_id: resolvedNextVendorId,
                        target_type: 'vendor',
                        order_id: service.order_id,
                        service_id: next_order_service_id || null,
                        title: notifTitle,
                        message: notifMsg,
                        type: 'order_progress_alert'
                    });

                    if (io) {
                        const notifPayload = {
                            id: notifId,
                            order_id: service.order_id,
                            service_id: next_order_service_id,
                            service_name: targetSvcName,
                            title: notifTitle,
                            message: notifMsg,
                            type: 'order_progress_alert',
                            vendor_id: resolvedNextVendorId,
                            is_read: false,
                            created_at: new Date()
                        };
                        io.to(`vendor_${resolvedNextVendorId}`).emit('notification_received', notifPayload);
                        io.emit('new_notification', notifPayload);
                        io.emit('vendor_notification_updated', { vendorId: resolvedNextVendorId });
                    }
                } catch (notifErr) {
                    console.error('Error creating next vendor notification on subtask creation:', notifErr);
                }
            }

            sendSuccess(res, 'Subtask created successfully', subtask, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update a subtask
     */
    updateSubtask = async (req, res, next) => {
        try {
            const subtaskId = req.params.subtaskId;
            const { title, description, start_date, end_date, sequence_order, next_order_service_id } = req.body;
            let { status } = req.body;

            const subtask = await sopRepository.findSubtaskById(subtaskId);
            if (!subtask) {
                return next(new AppError('Subtask not found', 404));
            }

            const { isVendor, isCustomer, isAdmin } = this.getSubtaskActor(req, subtask);

            if (!isVendor && !isCustomer && !isAdmin) {
                return next(new AppError('You are not authorized to update this subtask', 403));
            }

            // Only a customer review can approve. A vendor marking it completed asks for approval instead.
            const vendorWantsCompletion = status === 'completed' && isVendor && !isCustomer && !isAdmin;
            if (vendorWantsCompletion || status === 'approval_pending') {
                status = undefined;
            }

            // Optional next-service handover change from the edit form
            let nextFields = {};
            if (next_order_service_id !== undefined) {
                const nextId = next_order_service_id ? Number(next_order_service_id) : null;
                let nextVendorId = null;
                if (nextId) {
                    const [targetRows] = await pool.execute('SELECT vendor_id FROM order_services WHERE id = ?', [nextId]);
                    nextVendorId = targetRows.length > 0 ? targetRows[0].vendor_id : null;
                }
                nextFields = { next_order_service_id: nextId, next_vendor_id: nextVendorId };
            }

            // Validate start_date <= end_date for the subtask
            const finalStart = start_date !== undefined ? start_date : subtask.start_date;
            const finalEnd = end_date !== undefined ? end_date : subtask.end_date;
            if (finalStart && finalEnd) {
                if (new Date(finalStart).getTime() > new Date(finalEnd).getTime()) {
                    return next(new AppError('Subtask start date cannot be after end date', 400));
                }
            }

            await sopRepository.updateSubtask(subtaskId, {
                title,
                description,
                start_date,
                end_date,
                status,
                sequence_order,
                ...nextFields
            });

            if (vendorWantsCompletion) {
                const fresh = await sopRepository.findSubtaskById(subtaskId);
                const { updated: pending } = await this.requestSubtaskApproval(req, fresh);
                return sendSuccess(res, 'Submitted for customer approval', pending);
            }

            const updated = await sopRepository.findSubtaskById(subtaskId);

            const io = req.app.get('io');
            if (io) {
                io.emit('sop_subtask_updated', {
                    subtaskId,
                    subtask_id: subtaskId,
                    serviceId: subtask.order_service_id,
                    service_id: subtask.order_service_id,
                    orderId: subtask.order_id,
                    order_id: subtask.order_id,
                    updated
                });
            }

            if (status === 'completed' && subtask.status !== 'completed') {
                await this.checkAndNotifyNextVendor(subtaskId, io);
            }

            sendSuccess(res, 'Subtask updated successfully', updated);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Reorder subtasks within a service
     */
    reorderSubtasks = async (req, res, next) => {
        try {
            const serviceId = req.params.serviceId;
            const { subtasks } = req.body;

            if (!Array.isArray(subtasks)) {
                return next(new AppError('Subtasks array is required', 400));
            }

            const service = await sopRepository.findServiceById(serviceId);
            if (!service) {
                return next(new AppError('Service not found', 404));
            }

            const isVendor = req.user.vendor_id && req.user.vendor_id == service.vendor_id;
            const isCustomer = !req.user.vendor_id && req.user.id == service.customer_user_id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isVendor && !isCustomer && !isAdmin) {
                return next(new AppError('You are not authorized to reorder subtasks for this service', 403));
            }

            await sopRepository.reorderSubtasks(serviceId, subtasks);

            const io = req.app.get('io');
            if (io) {
                io.emit('sop_subtasks_reordered', {
                    serviceId,
                    service_id: serviceId,
                    orderId: service.order_id,
                    order_id: service.order_id,
                    subtasks
                });
            }

            sendSuccess(res, 'Subtasks reordered successfully');
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete subtask
     */
    deleteSubtask = async (req, res, next) => {
        try {
            const subtaskId = req.params.subtaskId;
            const subtask = await sopRepository.findSubtaskById(subtaskId);
            if (!subtask) {
                return next(new AppError('Subtask not found', 404));
            }

            const isVendor = req.user.vendor_id && req.user.vendor_id == subtask.vendor_id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isVendor && !isAdmin) {
                return next(new AppError('Only the assigned vendor can delete subtasks', 403));
            }

            await sopRepository.deleteSubtask(subtaskId);

            const io = req.app.get('io');
            if (io) {
                io.emit('sop_subtask_deleted', {
                    subtaskId,
                    subtask_id: subtaskId,
                    serviceId: subtask.order_service_id,
                    service_id: subtask.order_service_id,
                    orderId: subtask.order_id,
                    order_id: subtask.order_id
                });
            }

            sendSuccess(res, 'Subtask deleted successfully', { id: subtaskId });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Mark subtask as complete
     */
    completeSubtask = async (req, res, next) => {
        try {
            const subtaskId = req.params.subtaskId;
            const subtask = await sopRepository.findSubtaskById(subtaskId);
            if (!subtask) {
                return next(new AppError('Subtask not found', 404));
            }

            const isVendor = req.user.vendor_id && req.user.vendor_id == subtask.vendor_id;
            const isCustomer = !req.user.vendor_id && req.user.id == subtask.customer_user_id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isVendor && !isCustomer && !isAdmin) {
                return next(new AppError('Only the assigned vendor or project owner can mark a subtask as complete', 403));
            }

            if (isVendor && !isCustomer && !isAdmin) {
                if (subtask.status === 'completed') {
                    return next(new AppError('This subtask is already completed', 400));
                }
                const { updated: pending, alreadyPending } = await this.requestSubtaskApproval(req, subtask, req.body?.note);
                return sendSuccess(res, alreadyPending ? 'Already waiting for customer approval' : 'Submitted for customer approval', pending);
            }

            await sopRepository.updateSubtask(subtaskId, { status: 'completed' });

            const updated = await sopRepository.findSubtaskById(subtaskId);

            const io = req.app.get('io');
            if (io) {
                io.emit('sop_subtask_completed', {
                    subtaskId,
                    subtask_id: subtaskId,
                    updated,
                    serviceId: subtask.order_service_id,
                    service_id: subtask.order_service_id,
                    orderId: subtask.order_id,
                    order_id: subtask.order_id
                });
            }

            // Check if subtask is before next service in multi-vendor order and notify next vendor & customer
            await this.checkAndNotifyNextVendor(subtaskId, io);

            sendSuccess(res, 'Subtask marked as completed successfully', updated);
        } catch (error) {
            next(error);
        }
    };

    // ── Site Workflow approval helpers ──

    /** Who is acting on a subtask: the assigned vendor, the order's customer, or an admin. */
    getSubtaskActor(req, subtask) {
        const isVendor = !!(req.user.vendor_id && req.user.vendor_id == subtask.vendor_id);
        const isCustomer = !!(req.user.id && req.user.id == subtask.customer_user_id && !req.user.vendor_id);
        const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);
        return { isVendor, isCustomer, isAdmin };
    }

    subtaskLabel(subtask) {
        return `"${subtask.title}" (${subtask.service_name || subtask.subcategory_name || 'service'})`;
    }

    /** Post a system update into the order's Project Discussion so everyone in the group sees it. */
    async postProjectUpdate(orderId, content, io) {
        try {
            const conversation = await chatRepository.findByOrderId(orderId);
            if (!conversation) return;
            const saved = await chatRepository.saveMessage({
                conversation_id: conversation.id,
                sender_type: 'system',
                sender_name: 'InfraMart System',
                message_type: 'system',
                content,
                file_type: 'sop_update'
            });
            if (io) {
                const msg = { ...saved, conversation_id: Number(conversation.id) };
                io.to(`conversation_${conversation.id}`).to(`conversation_${Number(conversation.id)}`).emit('new_message', msg);
            }
        } catch (err) {
            console.error('Failed to post Site Workflow update to project discussion:', err.message);
        }
    }

    emitSubtaskChange(io, event, subtask, updated, extra = {}) {
        if (!io) return;
        const payload = {
            subtaskId: subtask.id,
            subtask_id: subtask.id,
            serviceId: subtask.order_service_id,
            service_id: subtask.order_service_id,
            orderId: subtask.order_id,
            order_id: subtask.order_id,
            updated,
            ...extra
        };
        io.emit(event, payload);
        // Existing clients refresh on this event, so they pick up the new status too.
        if (event !== 'sop_subtask_updated') io.emit('sop_subtask_updated', payload);
    }

    /**
     * A vendor finished a subtask: hold it for the customer's approval instead of completing it.
     * Calling it again while approval is pending changes nothing and sends no duplicate alerts.
     */
    async requestSubtaskApproval(req, subtask, note = null) {
        const io = req.app.get('io');
        if (subtask.status === 'approval_pending') {
            return { updated: subtask, alreadyPending: true };
        }

        try {
            await sopRepository.updateSubtask(subtask.id, { status: 'approval_pending' });
        } catch (err) {
            // The database has not been given the new status yet (migration 014)
            if (err.code === 'WARN_DATA_TRUNCATED' || err.code === 'ER_WARN_DATA_TRUNCATED' || err.errno === 1265) {
                throw new AppError('Sending work for customer approval is not enabled on this server yet (database update 014 pending). Please contact the admin.', 503);
            }
            throw err;
        }
        const updated = await sopRepository.findSubtaskById(subtask.id);
        const vendorName = req.user.name || 'Vendor';

        try {
            await sopRepository.addComment({
                order_id: subtask.order_id,
                order_service_id: subtask.order_service_id,
                subtask_id: subtask.id,
                author_type: 'vendor',
                author_id: req.user.vendor_id || null,
                author_name: vendorName,
                kind: 'approval_requested',
                comment: note && String(note).trim() ? String(note).trim() : null
            });
        } catch (err) {
            if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
        }

        if (subtask.customer_user_id) {
            await notificationRepository.create({
                user_id: subtask.customer_user_id,
                target_type: 'customer',
                order_id: subtask.order_id,
                service_id: subtask.order_service_id,
                title: `Approval needed: ${subtask.title}`,
                message: `${vendorName} has finished ${this.subtaskLabel(subtask)} and is waiting for your approval in Site Workflow.`,
                type: 'subtask_approval_requested'
            });
        }

        await this.postProjectUpdate(
            subtask.order_id,
            `Site Workflow: ${vendorName} finished ${this.subtaskLabel(subtask)}. Waiting for the customer's approval.`,
            io
        );
        this.emitSubtaskChange(io, 'sop_subtask_approval_requested', subtask, updated);
        return { updated, alreadyPending: false };
    }

    /**
     * Customer reviews a subtask that is waiting for approval: approve it, or send it back with comments.
     */
    reviewSubtask = async (req, res, next) => {
        try {
            const subtaskId = req.params.subtaskId;
            const { action } = req.body;
            const comment = req.body.comment ? String(req.body.comment).trim() : '';

            if (!['approve', 'request_changes'].includes(action)) {
                return next(new AppError('Action must be "approve" or "request_changes"', 400));
            }

            const subtask = await sopRepository.findSubtaskById(subtaskId);
            if (!subtask) {
                return next(new AppError('Subtask not found', 404));
            }

            const { isCustomer, isAdmin } = this.getSubtaskActor(req, subtask);
            if (!isCustomer && !isAdmin) {
                return next(new AppError('Only the project owner can approve or request changes', 403));
            }
            if (subtask.status !== 'approval_pending') {
                return next(new AppError('This subtask is not waiting for approval', 400));
            }
            if (action === 'request_changes' && !comment) {
                return next(new AppError('Please add a comment so the vendor knows what to change', 400));
            }

            const io = req.app.get('io');
            const customerName = req.user.name || 'Customer';
            const approved = action === 'approve';

            await sopRepository.updateSubtask(subtaskId, { status: approved ? 'completed' : 'in_progress' });
            const updated = await sopRepository.findSubtaskById(subtaskId);

            const saved = await sopRepository.addComment({
                order_id: subtask.order_id,
                order_service_id: subtask.order_service_id,
                subtask_id: subtask.id,
                author_type: isAdmin && !isCustomer ? 'admin' : 'customer',
                author_id: req.user.id,
                author_name: customerName,
                kind: approved ? 'approved' : 'changes_requested',
                comment: comment || null
            });

            if (subtask.vendor_id) {
                await notificationRepository.create({
                    vendor_id: subtask.vendor_id,
                    target_type: 'vendor',
                    order_id: subtask.order_id,
                    service_id: subtask.order_service_id,
                    title: approved ? `Approved: ${subtask.title}` : `Changes requested: ${subtask.title}`,
                    message: approved
                        ? `${customerName} approved ${this.subtaskLabel(subtask)}.${comment ? ' Comment: ' + comment : ''}`
                        : `${customerName} requested changes on ${this.subtaskLabel(subtask)}: ${comment}`,
                    type: approved ? 'subtask_approved' : 'subtask_changes_requested'
                });
            }

            await this.postProjectUpdate(
                subtask.order_id,
                approved
                    ? `Site Workflow: ${customerName} approved ${this.subtaskLabel(subtask)}.${comment ? ' Comment: ' + comment : ''}`
                    : `Site Workflow: ${customerName} requested changes on ${this.subtaskLabel(subtask)}. Comment: ${comment}`,
                io
            );

            this.emitSubtaskChange(io, approved ? 'sop_subtask_completed' : 'sop_subtask_changes_requested', subtask, updated, { comment: saved });

            if (approved) {
                await this.checkAndNotifyNextVendor(subtaskId, io);
            }

            sendSuccess(res, approved ? 'Subtask approved and completed' : 'Changes requested. The vendor has been notified.', updated);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Add a discussion comment to a subtask (customer, vendor or admin).
     */
    addSubtaskComment = async (req, res, next) => {
        try {
            const subtask = await sopRepository.findSubtaskById(req.params.subtaskId);
            if (!subtask) {
                return next(new AppError('Subtask not found', 404));
            }
            const comment = req.body.comment ? String(req.body.comment).trim() : '';
            if (!comment) {
                return next(new AppError('Comment cannot be empty', 400));
            }

            const { isVendor, isCustomer, isAdmin } = this.getSubtaskActor(req, subtask);
            if (!isVendor && !isCustomer && !isAdmin) {
                return next(new AppError('You are not part of this project', 403));
            }

            const authorType = isVendor ? 'vendor' : (isCustomer ? 'customer' : 'admin');
            const authorName = req.user.name || (isVendor ? 'Vendor' : 'Customer');
            const saved = await sopRepository.addComment({
                order_id: subtask.order_id,
                order_service_id: subtask.order_service_id,
                subtask_id: subtask.id,
                author_type: authorType,
                author_id: isVendor ? req.user.vendor_id : req.user.id,
                author_name: authorName,
                kind: 'comment',
                comment
            });

            if (isVendor && subtask.customer_user_id) {
                await notificationRepository.create({
                    user_id: subtask.customer_user_id,
                    target_type: 'customer',
                    order_id: subtask.order_id,
                    service_id: subtask.order_service_id,
                    title: `New comment: ${subtask.title}`,
                    message: `${authorName}: ${comment}`,
                    type: 'subtask_comment'
                });
            } else if (!isVendor && subtask.vendor_id) {
                await notificationRepository.create({
                    vendor_id: subtask.vendor_id,
                    target_type: 'vendor',
                    order_id: subtask.order_id,
                    service_id: subtask.order_service_id,
                    title: `New comment: ${subtask.title}`,
                    message: `${authorName}: ${comment}`,
                    type: 'subtask_comment'
                });
            }

            const io = req.app.get('io');
            await this.postProjectUpdate(subtask.order_id, `Site Workflow comment on ${this.subtaskLabel(subtask)} from ${authorName}: ${comment}`, io);
            this.emitSubtaskChange(io, 'sop_subtask_comment_added', subtask, subtask, { comment: saved });

            sendSuccess(res, 'Comment added', saved, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Upload proof image for subtask
     */
    uploadProof = async (req, res, next) => {
        try {
            const subtaskId = req.params.subtaskId;
            const subtask = await sopRepository.findSubtaskById(subtaskId);
            if (!subtask) {
                return next(new AppError('Subtask not found', 404));
            }

            if (!req.file) {
                return next(new AppError('No proof image file provided', 400));
            }

            const fileUrl = `/uploads/sop/${req.file.filename}`;
            const uploadedByType = req.user.vendor_id ? 'vendor' : 'customer';
            const uploadedById = req.user.vendor_id || req.user.id;

            await sopRepository.addProofImage(subtaskId, {
                image_url: fileUrl,
                original_name: req.file.originalname,
                file_size: req.file.size,
                uploaded_by_type: uploadedByType,
                uploaded_by_id: uploadedById,
                notes: req.body.notes || null
            });

            const io = req.app.get('io');

            // If auto_complete is requested with proof
            if (req.body.mark_completed === 'true' || req.body.mark_completed === true) {
                const { isVendor, isCustomer, isAdmin } = this.getSubtaskActor(req, subtask);
                if (isVendor && !isCustomer && !isAdmin) {
                    if (subtask.status !== 'completed') {
                        await this.requestSubtaskApproval(req, subtask, req.body.notes);
                    }
                } else {
                    await sopRepository.updateSubtask(subtaskId, { status: 'completed' });
                    await this.checkAndNotifyNextVendor(subtaskId, io);
                }
            }

            const updatedSubtask = await sopRepository.findSubtaskById(subtaskId);

            if (io) {
                io.emit('sop_proof_uploaded', {
                    subtaskId,
                    subtask_id: subtaskId,
                    updatedSubtask,
                    serviceId: subtask.order_service_id,
                    service_id: subtask.order_service_id,
                    orderId: subtask.order_id,
                    order_id: subtask.order_id
                });
            }

            sendSuccess(res, 'Completion proof uploaded successfully', {
                file_url: fileUrl,
                proof_image_url: fileUrl,
                original_name: req.file.originalname,
                subtask: updatedSubtask
            });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Vendor raises completion request for a service
     */
    raiseCompletionRequest = async (req, res, next) => {
        try {
            const serviceId = req.params.serviceId;
            const { note } = req.body;

            const service = await sopRepository.findServiceById(serviceId);
            if (!service) {
                return next(new AppError('Service not found', 404));
            }

            const isVendor = req.user.vendor_id && req.user.vendor_id == service.vendor_id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isVendor && !isAdmin) {
                return next(new AppError('Only the assigned vendor can raise a completion request', 403));
            }

            if (service.service_status === 'completed') {
                return next(new AppError('Service is already marked as completed', 400));
            }

            const request = await sopRepository.createCompletionRequest(
                service.id,
                service.order_id,
                service.vendor_id,
                note
            );

            // Notify Customer
            if (service.customer_user_id) {
                await notificationRepository.create({
                    user_id: service.customer_user_id,
                    target_type: 'customer',
                    order_id: service.order_id,
                    service_id: service.id,
                    title: `Approval needed: ${service.service_name || service.subcategory_name}`,
                    message: `${service.vendor_name || 'Vendor'} has completed all subtasks for ${service.service_name || service.subcategory_name} and requested your approval.`,
                    type: 'completion_request'
                });
            }

            // Real-time broadcast
            const io = req.app.get('io');
            if (io) {
                io.emit('sop_completion_requested', {
                    serviceId: service.id,
                    service_id: service.id,
                    orderId: service.order_id,
                    order_id: service.order_id,
                    request
                });
            }

            try {
                await sopRepository.addComment({
                    order_id: service.order_id,
                    order_service_id: service.id,
                    author_type: 'vendor',
                    author_id: service.vendor_id,
                    author_name: service.vendor_name || req.user.name || 'Vendor',
                    kind: 'approval_requested',
                    comment: note && String(note).trim() ? String(note).trim() : null
                });
            } catch (err) {
                if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
            }
            await this.postProjectUpdate(
                service.order_id,
                `Site Workflow: ${service.vendor_name || 'Vendor'} finished all work for ${service.service_name || service.subcategory_name}. Waiting for the customer's approval.`,
                io
            );

            sendSuccess(res, 'Completion request submitted to customer successfully', request, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Customer responds to completion request (accept / reject)
     */
    respondCompletionRequest = async (req, res, next) => {
        try {
            const requestId = req.params.requestId;
            const { action, reason } = req.body;

            if (!['approve', 'reject'].includes(action)) {
                return next(new AppError('Action must be either "approve" or "reject"', 400));
            }

            const request = await sopRepository.findCompletionRequestById(requestId);
            if (!request) {
                return next(new AppError('Completion request not found', 404));
            }

            // Authorization: customer owner of order or admin
            const isCustomer = !req.user.vendor_id && req.user.id == request.customer_user_id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isCustomer && !isAdmin) {
                return next(new AppError('Only the order customer or administrator can review this completion request', 403));
            }

            const updatedRequest = await sopRepository.respondToCompletionRequest(
                requestId,
                req.user.id,
                action,
                reason
            );

            const serviceName = request.service_name || request.subcategory_name;
            const reviewerName = req.user.name || 'Customer';
            if (action === 'reject') {
                await pool.execute(
                    "UPDATE order_services SET service_status = 'in_progress', updated_at = NOW() WHERE id = ? AND service_status <> 'completed'",
                    [request.order_service_id]
                );
            }
            try {
                await sopRepository.addComment({
                    order_id: request.order_id,
                    order_service_id: request.order_service_id,
                    author_type: isAdmin && !isCustomer ? 'admin' : 'customer',
                    author_id: req.user.id,
                    author_name: reviewerName,
                    kind: action === 'approve' ? 'approved' : 'changes_requested',
                    comment: reason && String(reason).trim() ? String(reason).trim() : null
                });
            } catch (err) {
                if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
            }
            await this.postProjectUpdate(
                request.order_id,
                action === 'approve'
                    ? `Site Workflow: ${reviewerName} approved all work for ${serviceName}.`
                    : `Site Workflow: ${reviewerName} requested changes on ${serviceName}. Comment: ${reason || 'Please review the subtasks.'}`,
                req.app.get('io')
            );

            // Notify Vendor
            if (request.vendor_id) {
                await notificationRepository.create({
                    vendor_id: request.vendor_id,
                    target_type: 'vendor',
                    order_id: request.order_id,
                    service_id: request.order_service_id,
                    title: action === 'approve'
                        ? `Completion Approved: ${request.service_name || request.subcategory_name}`
                        : `Changes requested: ${request.service_name || request.subcategory_name}`,
                    message: action === 'approve'
                        ? `Customer approved work completion for ${request.service_name || request.subcategory_name}. Status is now Completed!`
                        : `Customer requested corrections: ${reason || 'Please inspect subtasks.'}`,
                    type: action === 'approve' ? 'work_completed' : 'completion_rejected'
                });
            }

            // Real-time broadcast
            const io = req.app.get('io');
            if (io) {
                io.emit('sop_completion_responded', {
                    requestId,
                    request_id: requestId,
                    orderId: request.order_id,
                    order_id: request.order_id,
                    serviceId: request.order_service_id,
                    service_id: request.order_service_id,
                    action,
                    updatedRequest
                });
            }

            sendSuccess(
                res,
                action === 'approve' ? 'Service completion approved and marked as Completed!' : 'Completion request rejected',
                updatedRequest
            );
        } catch (error) {
            next(error);
        }
    };

    /**
     * Check if the completed subtask is before a subsequent service in a multi-vendor project order.
     * When there are two or more vendors tagged to that order, notify the next vendor:
     * "the before process is completing soon , you order is on [date]"
     * And dispatch order notifications to both vendor and customer portals.
     */
    checkAndNotifyNextVendor = async (subtaskId, io) => {
        try {
            const subtask = await sopRepository.findSubtaskById(subtaskId);
            if (!subtask) return;

            const orderId = subtask.order_id;
            const currentServiceId = subtask.order_service_id;

            // Fetch order details
            const [orders] = await pool.execute(
                `SELECT o.*, u.name as customer_name, u.mobile as customer_mobile 
                 FROM orders o 
                 JOIN users u ON o.user_id = u.id 
                 WHERE o.id = ?`,
                [orderId]
            );
            if (orders.length === 0) return;
            const order = orders[0];

            // Fetch all active services for this order sorted by sequence_order ASC, id ASC
            const [services] = await pool.execute(
                `SELECT os.*, v.name as vendor_name, v.mobile as vendor_mobile, sc.name as subcategory_name
                 FROM order_services os
                 LEFT JOIN vendors v ON os.vendor_id = v.id
                 LEFT JOIN subcategories sc ON os.subcategory_id = sc.id
                 WHERE os.order_id = ? AND os.service_status != 'removed'
                 ORDER BY os.sequence_order ASC, os.id ASC`,
                [orderId]
            );

            // Fetch all subtasks for the current service
            const [currentSubtasks] = await pool.execute(
                `SELECT * FROM order_service_subtasks 
                 WHERE order_service_id = ? 
                 ORDER BY sequence_order ASC, id ASC`,
                [currentServiceId]
            );

            // Find current service index
            const currentServiceIndex = services.findIndex(s => s.id === currentServiceId);
            const currentService = currentServiceIndex >= 0 ? services[currentServiceIndex] : null;

            // Check if there are 2 or more distinct vendors tagged to that order
            const distinctVendorIds = [...new Set(services.map(s => s.vendor_id).filter(Boolean))];
            const hasMultipleVendors = distinctVendorIds.length >= 2;

            // Check if this subtask is the one "before the service"
            // (i.e. last subtask of current service by sequence order, or all subtasks in current service are now completed)
            let isSubtaskBeforeNextService = false;
            if (currentSubtasks.length > 0) {
                const maxSeq = Math.max(...currentSubtasks.map(st => st.sequence_order || 0));
                const isLastInSeq = (subtask.sequence_order === maxSeq) || 
                                    (subtask.id === currentSubtasks[currentSubtasks.length - 1].id);
                const pendingOtherSubtasks = currentSubtasks.filter(
                    st => st.id !== subtask.id && st.status !== 'completed'
                );
                isSubtaskBeforeNextService = isLastInSeq || pendingOtherSubtasks.length === 0;
            }

            // Helper to get service start date
            const getServiceStartDate = async (srv) => {
                if (srv.start_date) return srv.start_date;
                const [nextSubtasks] = await pool.execute(
                    `SELECT start_date FROM order_service_subtasks 
                     WHERE order_service_id = ? AND start_date IS NOT NULL 
                     ORDER BY sequence_order ASC, id ASC LIMIT 1`,
                    [srv.id]
                );
                if (nextSubtasks.length > 0 && nextSubtasks[0].start_date) {
                    return nextSubtasks[0].start_date;
                }
                return null;
            };

            // Helper to format date string
            const formatDateString = (dateVal) => {
                if (!dateVal) return 'the upcoming schedule';
                try {
                    const d = new Date(dateVal);
                    if (!isNaN(d.getTime())) {
                        return d.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                        });
                    }
                    return String(dateVal);
                } catch (e) {
                    return String(dateVal);
                }
            };

            // Find next service in sequence
            const nextService = (currentServiceIndex >= 0 && currentServiceIndex < services.length - 1)
                ? services[currentServiceIndex + 1]
                : null;

            let nextFormattedDate = 'the upcoming schedule';
            if (nextService) {
                const targetDateStr = await getServiceStartDate(nextService);
                nextFormattedDate = formatDateString(targetDateStr);
            }

            // If this is the subtask completing the before service, and there are 2 or more vendors tagged:
            if (hasMultipleVendors && isSubtaskBeforeNextService) {
                // Find all upcoming services in sequence that belong to different vendors
                const upcomingServices = services.slice(currentServiceIndex + 1);
                const notifiedVendors = new Set();

                for (const targetService of upcomingServices) {
                    const targetVendorId = targetService.vendor_id;
                    if (!targetVendorId || targetVendorId === currentService?.vendor_id || notifiedVendors.has(targetVendorId)) {
                        continue;
                    }
                    notifiedVendors.add(targetVendorId);

                    const targetDateStr = await getServiceStartDate(targetService);
                    const formattedDate = formatDateString(targetDateStr);

                    // Message format matching user's exact specification:
                    // "the before process is completing soon , you order is on "date"  "
                    const vendorMessage = `the before process is completing soon , you order is on ${formattedDate}`;
                    const vendorTitle = `Process Progress Alert: Order #${order.order_no || order.id}`;

                    // Insert into notifications table (main notification) with idempotency check
                    const notifId = await notificationRepository.createOrUpdateForOrder({
                        vendor_id: targetVendorId,
                        target_type: 'vendor',
                        order_id: order.id,
                        service_id: targetService.id,
                        title: vendorTitle,
                        message: vendorMessage,
                        type: 'order_progress_alert'
                    });

                    // Socket real-time notification push
                    if (io) {
                        const notifPayload = {
                            id: notifId,
                            order_id: order.id,
                            order_no: order.order_no,
                            service_id: targetService.id,
                            service_name: targetService.service_name || targetService.subcategory_name,
                            title: vendorTitle,
                            message: vendorMessage,
                            type: 'order_progress_alert',
                            vendor_id: targetVendorId,
                            is_read: false,
                            created_at: new Date()
                        };

                        io.to(`vendor_${targetVendorId}`).emit('notification_received', notifPayload);
                        io.emit('notification_received', notifPayload);
                        io.emit('new_notification', notifPayload);
                        io.emit('vendor_notification_updated', { vendorId: targetVendorId });
                    }
                }
            }

            // Mandatory Customer Notification for Order-Related Action
            await this.notifyCustomerSubtaskDone(order, subtask, currentService, nextService, nextFormattedDate, io);

        } catch (error) {
            console.error('[SOPController] checkAndNotifyNextVendor error:', error);
        }
    };

    /**
     * Dispatch order notification to the customer portal
     */
    notifyCustomerSubtaskDone = async (order, subtask, currentService, nextService, nextDate, io) => {
        try {
            const currentPhaseName = currentService?.service_name || currentService?.subcategory_name || 'Service Phase';
            const title = `Subtask Done: ${subtask.title}`;
            let message = `Subtask "${subtask.title}" has been completed for phase "${currentPhaseName}" on Order #${order.order_no || order.id}.`;
            if (nextService && nextDate) {
                const nextPhaseName = nextService.service_name || nextService.subcategory_name || 'Next Service';
                message += ` The before process is completing soon, next phase "${nextPhaseName}" is scheduled on ${nextDate}.`;
            }

            const notifId = await notificationRepository.create({
                user_id: order.user_id,
                target_type: 'customer',
                order_id: order.id,
                service_id: subtask.order_service_id,
                title: title,
                message: message,
                type: 'order_update'
            });

            if (io) {
                const customerPayload = {
                    id: notifId,
                    user_id: order.user_id,
                    order_id: order.id,
                    order_no: order.order_no,
                    title,
                    message,
                    type: 'order_update',
                    created_at: new Date()
                };

                io.to(`customer_${order.user_id}`).emit('notification_received', customerPayload);
                io.emit('notification_received', customerPayload);
                io.emit('new_notification', customerPayload);
                io.emit('order_status_updated', { order_id: order.id });
            }
        } catch (error) {
            console.error('[SOPController] notifyCustomerSubtaskDone error:', error);
        }
    };
}

module.exports = new SOPController();
