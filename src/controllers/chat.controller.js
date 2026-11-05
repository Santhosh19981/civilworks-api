const chatRepository = require('../repositories/chat.repository');
const orderRepository = require('../repositories/order.repository');
const notificationRepository = require('../repositories/notification.repository');
const { pool } = require('../config/db.config');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class ChatController {
    /**
     * Get all eligible conversations for authenticated user
     */
    getConversations = async (req, res, next) => {
        try {
            let conversations = [];

            if (req.user.vendor_id) {
                conversations = await chatRepository.findConversationsForVendor(req.user.vendor_id);
            } else if (req.user.role === 'customer' || req.user.role_id === 4) {
                conversations = await chatRepository.findConversationsForCustomer(req.user.id);
            } else if (['super_admin', 'admin', 'manager'].includes(req.user.role)) {
                // Admin can see all project conversations
                conversations = await chatRepository.findConversationsForCustomer(req.user.id);
            } else {
                conversations = await chatRepository.findConversationsForCustomer(req.user.id);
            }

            sendSuccess(res, 'Conversations retrieved successfully', conversations);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get messages for a specific conversation
     */
    getMessages = async (req, res, next) => {
        try {
            const conversationId = req.params.id;
            const conversation = await chatRepository.findById(conversationId);
            if (!conversation) {
                return next(new AppError('Conversation not found or not eligible for project chat', 404));
            }

            // Authorization check
            const participants = conversation.participants || [];
            const isCustomerOwner = conversation.customer_user_id === req.user.id;
            const isVendorParticipant = req.user.vendor_id && (
                participants.some(p => p.vendor_id == req.user.vendor_id && p.status === 'active') ||
                conversation.services?.some(s => s.vendor_id == req.user.vendor_id && s.vendor_status === 'accepted' && s.service_status !== 'removed')
            );
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isCustomerOwner && !isVendorParticipant && !isAdmin) {
                return next(new AppError('You are not authorized to view messages in this project conversation', 403));
            }

            // If requesting user is a vendor whose work is completed, only return messages up to completion
            let vendorCompletedAt = null;
            if (req.user.vendor_id) {
                const vendorPart = participants.find(p => p.vendor_id == req.user.vendor_id);
                if (vendorPart?.completed_at) {
                    vendorCompletedAt = vendorPart.completed_at;
                } else {
                    const vendorServices = (conversation.services || []).filter(
                        s => s.vendor_id == req.user.vendor_id && s.service_status !== 'removed'
                    );
                    const isAllCompleted = vendorServices.length > 0 && vendorServices.every(s => s.service_status === 'completed');
                    if (isAllCompleted) {
                        const [compRows] = await pool.execute(
                            `SELECT created_at FROM project_messages 
                             WHERE conversation_id = ? AND (file_type = 'work_completed' OR message_type = 'work_completed')
                             ORDER BY created_at DESC LIMIT 1`,
                            [conversationId]
                        );
                        if (compRows.length > 0) {
                            vendorCompletedAt = compRows[0].created_at;
                            await chatRepository.markVendorCompleted(conversationId, req.user.vendor_id, vendorCompletedAt);
                        }
                    }
                }
            }

            const messages = await chatRepository.getMessages(conversationId, 100, 0, vendorCompletedAt);

            // Format each message so both file_url and attachment_url are always present
            const formattedMessages = (messages || []).map(m => ({
                ...m,
                file_url: m.file_url || m.attachment_url || null,
                attachment_url: m.file_url || m.attachment_url || null,
                file_name: m.file_name || m.attachment_name || m.content || null,
                attachment_name: m.file_name || m.attachment_name || m.content || null,
                file_size: m.file_size || m.attachment_size || null,
                attachment_size: m.file_size || m.attachment_size || null,
                file_type: m.file_type || m.attachment_mime || null,
                attachment_mime: m.file_type || m.attachment_mime || null
            }));

            // Mark as read for this participant
            if (isCustomerOwner) {
                await chatRepository.markAsRead(conversationId, 'customer', req.user.id);
            } else if (isVendorParticipant) {
                await chatRepository.markAsRead(conversationId, 'vendor', req.user.vendor_id);
            }

            sendSuccess(res, 'Messages retrieved successfully', {
                conversation,
                messages: formattedMessages
            });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Send message in a project conversation
     */
    sendMessage = async (req, res, next) => {
        try {
            const conversationId = req.params.id;
            const {
                content,
                message_type = 'text',
                file_url,
                file_name,
                file_size,
                file_type,
                attachment_url,
                attachment_name,
                attachment_size,
                attachment_mime
            } = req.body;

            const conversation = await chatRepository.findById(conversationId);
            if (!conversation) {
                return next(new AppError('Conversation not found', 404));
            }

            // Authorization check
            const participants = conversation.participants || [];
            const isCustomerOwner = conversation.customer_user_id === req.user.id;
            const isVendorParticipant = req.user.vendor_id && (
                participants.some(p => p.vendor_id == req.user.vendor_id && p.status === 'active') ||
                conversation.services?.some(s => s.vendor_id == req.user.vendor_id && s.vendor_status === 'accepted' && s.service_status !== 'removed')
            );
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isCustomerOwner && !isVendorParticipant && !isAdmin) {
                return next(new AppError('You are not authorized to send messages in this project conversation', 403));
            }

            // If project order is marked completed, restrict all participants (customer and vendors) from messaging!
            const allServicesCompleted = (conversation.services || []).length > 0 && (conversation.services || []).every(s => s.service_status === 'completed');
            const isOrderClosed = conversation.order_status === 'delivered' || conversation.order_status === 'completed' || conversation.status === 'completed' || conversation.conversation_status === 'closed' || conversation.conversation_status === 'completed' || allServicesCompleted;
            if (isOrderClosed) {
                return next(new AppError('This project order has been completed. Messaging is closed for all participants, but message history is viewable.', 403));
            }

            let senderType = 'customer';
            let senderId = req.user.id;
            let senderName = req.user.name || 'Site Customer';

            if (req.user.vendor_id) {
                // Check if vendor's work is marked as completed
                const vendorServices = (conversation.services || []).filter(
                    s => s.vendor_id == req.user.vendor_id && s.service_status !== 'removed'
                );
                const isAllCompleted = vendorServices.length > 0 && vendorServices.every(s => s.service_status === 'completed');
                if (isAllCompleted) {
                    return next(new AppError('Your work on this project has been marked as completed. Messaging is closed for this service, but you can view message history.', 403));
                }

                senderType = 'vendor';
                senderId = req.user.vendor_id;
                const v = participants.find(p => p.vendor_id == req.user.vendor_id);
                senderName = v?.name || req.user.name || 'Vendor Partner';
            } else if (isAdmin) {
                senderType = 'admin';
                senderName = 'CivilWorks Support';
            }

            const resolvedFileUrl = file_url || attachment_url || null;
            const resolvedFileName = file_name || attachment_name || content || null;
            const resolvedFileSize = file_size || attachment_size || null;
            const resolvedFileType = file_type || attachment_mime || null;

            if (!content && !resolvedFileUrl) {
                return next(new AppError('Message content or file attachment is required', 400));
            }

            const savedMessage = await chatRepository.saveMessage({
                conversation_id: conversationId,
                sender_type: senderType,
                sender_id: senderId,
                sender_name: senderName,
                message_type,
                content: content ? content.trim() : (resolvedFileName || 'Attachment'),
                file_url: resolvedFileUrl,
                file_name: resolvedFileName,
                file_size: resolvedFileSize,
                file_type: resolvedFileType
            });

            const formattedMsg = {
                ...savedMessage,
                conversation_id: Number(conversationId),
                file_url: savedMessage.file_url || resolvedFileUrl,
                attachment_url: savedMessage.file_url || resolvedFileUrl,
                file_name: savedMessage.file_name || resolvedFileName,
                attachment_name: savedMessage.file_name || resolvedFileName,
                file_size: savedMessage.file_size || resolvedFileSize,
                attachment_size: savedMessage.file_size || resolvedFileSize,
                file_type: savedMessage.file_type || resolvedFileType,
                attachment_mime: savedMessage.file_type || resolvedFileType
            };

            // Emit real-time message via Socket.IO if available
            const io = req.app.get('io');
            if (io) {
                io.to(`conversation_${conversationId}`).to(`conversation_${Number(conversationId)}`).emit('new_message', formattedMsg);
                if (conversation.order_id) {
                    io.to(`order_${conversation.order_id}`).to(`order_${Number(conversation.order_id)}`).emit('new_message', formattedMsg);
                }
                io.emit('conversation_message_received', {
                    conversation_id: Number(conversationId),
                    order_id: Number(conversation.order_id),
                    message: formattedMsg
                });
            }

            // Dispatch notification to other participants
            for (const p of participants) {
                if (p.participant_type === 'customer' && senderType !== 'customer' && p.user_id) {
                    await notificationRepository.create({
                        user_id: p.user_id,
                        target_type: 'customer',
                        order_id: conversation.order_id,
                        title: `New update from ${senderName}`,
                        message: content ? (content.length > 80 ? content.slice(0, 77) + '...' : content) : `Shared a ${message_type}`,
                        type: 'chat_message'
                    });
                } else if (p.participant_type === 'vendor' && (senderType !== 'vendor' || senderId != p.vendor_id) && p.vendor_id) {
                    // Do not send notifications to vendors whose work is completed on this conversation
                    if (p.completed_at) {
                        continue;
                    }
                    await notificationRepository.create({
                        vendor_id: p.vendor_id,
                        target_type: 'vendor',
                        order_id: conversation.order_id,
                        title: `New update from ${senderName}`,
                        message: content ? (content.length > 80 ? content.slice(0, 77) + '...' : content) : `Shared a ${message_type}`,
                        type: 'chat_message'
                    });
                }
            }

            sendSuccess(res, 'Message sent successfully', savedMessage, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Vendor sends work completion acceptance request to customer
     */
    requestCompletion = async (req, res, next) => {
        try {
            const conversationId = req.params.id;
            const vendorId = req.user.vendor_id || (req.user.role === 'vendor' ? req.user.id : null);
            if (!vendorId) {
                return next(new AppError('Only assigned vendors can send work completion requests', 403));
            }

            const conversation = await chatRepository.findById(conversationId);
            if (!conversation) {
                return next(new AppError('Conversation not found', 404));
            }

            const reqServiceId = req.body?.service_id;
            const vendorServices = (conversation.services || []).filter(
                s => s.vendor_id == vendorId && s.service_status !== 'removed'
            );

            if (vendorServices.length === 0) {
                return next(new AppError('You have no active services on this project order', 404));
            }

            let targetService = null;
            if (reqServiceId) {
                targetService = vendorServices.find(s => s.id == reqServiceId);
            } else {
                targetService = vendorServices.find(s => s.service_status !== 'completed') || vendorServices[0];
            }

            if (!targetService) {
                return next(new AppError('Selected service not found or not assigned to you', 404));
            }

            if (targetService.service_status === 'completed') {
                return next(new AppError('This service work is already marked as completed', 400));
            }

            const vendorName = req.user.name || targetService.vendor_name || 'Vendor Partner';
            const serviceName = targetService.subcategory_name || targetService.service_name || 'Assigned Service';

            const metadata = {
                action: 'completion_request',
                service_id: targetService.id,
                order_id: conversation.order_id,
                vendor_id: vendorId,
                vendor_name: vendorName,
                service_name: serviceName
            };

            const content = `${vendorName} has completed work for ${serviceName} and sent a completion acceptance request to the customer.`;

            const savedMsg = await chatRepository.saveMessage({
                conversation_id: conversationId,
                sender_type: 'vendor',
                sender_id: vendorId,
                sender_name: vendorName,
                message_type: 'system',
                content: content,
                file_name: JSON.stringify(metadata),
                file_type: 'completion_request'
            });

            const formattedMsg = {
                ...savedMsg,
                conversation_id: Number(conversationId),
                file_name: JSON.stringify(metadata),
                file_type: 'completion_request'
            };

            // Emit via socket
            const io = req.app.get('io');
            if (io) {
                io.to(`conversation_${conversationId}`).to(`conversation_${Number(conversationId)}`).emit('new_message', formattedMsg);
                io.to(`conversation_${conversationId}`).to(`conversation_${Number(conversationId)}`).emit('completion_requested', metadata);
                io.emit('conversation_message_received', {
                    conversation_id: Number(conversationId),
                    order_id: Number(conversation.order_id),
                    message: formattedMsg
                });
                io.emit('sop_completion_requested', {
                    serviceId: targetService.id,
                    service_id: targetService.id,
                    orderId: Number(conversation.order_id),
                    order_id: Number(conversation.order_id),
                    request: metadata
                });
            }

            // Notify customer
            if (conversation.customer_user_id) {
                await notificationRepository.create({
                    user_id: conversation.customer_user_id,
                    target_type: 'customer',
                    order_id: conversation.order_id,
                    title: `Work Completion Request from ${vendorName}`,
                    message: `${vendorName} has finished work for ${serviceName}. Please open chat and confirm completion.`,
                    type: 'completion_request'
                });
            }

            sendSuccess(res, 'Completion request sent to customer successfully', formattedMsg, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Customer (or admin) marks vendor's work status as completed
     */
    completeWork = async (req, res, next) => {
        try {
            const conversationId = req.params.id;
            const conversation = await chatRepository.findById(conversationId);
            if (!conversation) {
                return next(new AppError('Conversation not found', 404));
            }

            const isCustomerOwner = conversation.customer_user_id === req.user.id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isCustomerOwner && !isAdmin) {
                return next(new AppError('Only the customer or administrator can update vendor work status to completed', 403));
            }

            const { service_id, vendor_id } = req.body;
            if (!service_id && !vendor_id) {
                return next(new AppError('Service ID or Vendor ID is required', 400));
            }

            const existingServices = await orderRepository.findServicesByOrderId(conversation.order_id);
            let targetService = service_id ? existingServices.find(s => s.id == service_id) : null;

            if (!targetService && (vendor_id || req.body.vendor_id)) {
                const targetVid = vendor_id || req.body.vendor_id;
                targetService = existingServices.find(s => s.vendor_id == targetVid && s.service_status !== 'removed');
            }

            if (!targetService) {
                return next(new AppError('Service not found on this project order', 404));
            }

            if (targetService.service_status === 'completed') {
                return sendSuccess(res, 'Service is already marked as completed', {
                    service_id: targetService.id,
                    service_status: 'completed'
                });
            }

            // Update service status to completed
            await orderRepository.updateOrderService(targetService.id, {
                service_status: 'completed'
            });

            const vendorName = targetService.vendor_name || 'Vendor Partner';
            const serviceName = targetService.subcategory_name || targetService.service_name || 'Service';
            const customerName = req.user.name || conversation.customer_name || 'Site Customer';

            const metadata = {
                action: 'work_completed',
                service_id: targetService.id,
                order_id: conversation.order_id,
                vendor_id: targetService.vendor_id,
                vendor_name: vendorName,
                service_name: serviceName,
                completed_by: customerName
            };

            const content = `Work completed: ${customerName} accepted and marked ${vendorName}'s work for ${serviceName} as Completed. Messaging is now closed for this service.`;

            const savedMsg = await chatRepository.saveMessage({
                conversation_id: conversationId,
                sender_type: 'system',
                sender_id: req.user.id,
                sender_name: 'CivilWorks System',
                message_type: 'system',
                content: content,
                file_name: JSON.stringify(metadata),
                file_type: 'work_completed'
            });

            const formattedMsg = {
                ...savedMsg,
                conversation_id: Number(conversationId),
                file_name: JSON.stringify(metadata),
                file_type: 'work_completed'
            };

            // Notify vendor
            if (targetService.vendor_id) {
                await notificationRepository.create({
                    vendor_id: targetService.vendor_id,
                    target_type: 'vendor',
                    order_id: conversation.order_id,
                    service_id: targetService.id,
                    title: `Work Completed & Accepted: ${serviceName}`,
                    message: `Customer marked your work for ${serviceName} on Order #${conversation.order_no} as Completed. Thank you!`,
                    type: 'work_completed'
                });
            }

            // Fetch fresh services
            const updatedServices = await chatRepository.getOrderServices(conversation.order_id);

            // If all active services for this vendor are now completed, record completed_at on participant record
            if (targetService.vendor_id) {
                const myServices = (updatedServices || []).filter(
                    s => s.vendor_id == targetService.vendor_id && s.service_status !== 'removed'
                );
                const isAllCompleted = myServices.length > 0 && myServices.every(s => s.service_status === 'completed');
                if (isAllCompleted) {
                    try {
                        const compTime = savedMsg.created_at || new Date();
                        await chatRepository.markVendorCompleted(conversationId, targetService.vendor_id, compTime);
                    } catch (e) {
                        console.error('Failed to mark vendor completed_at:', e);
                    }
                }
            }

            // Real-time broadcast
            const io = req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
            if (io) {
                const updatePayload = {
                    conversation_id: Number(conversationId),
                    order_id: conversation.order_id,
                    service_id: targetService.id,
                    vendor_id: targetService.vendor_id,
                    service_status: 'completed',
                    services: updatedServices
                };
                io.to(`conversation_${conversationId}`).to(`conversation_${Number(conversationId)}`).emit('new_message', formattedMsg);
                io.to(`conversation_${conversationId}`).to(`conversation_${Number(conversationId)}`).emit('work_status_updated', updatePayload);
                io.emit('conversation_message_received', {
                    conversation_id: Number(conversationId),
                    order_id: Number(conversation.order_id),
                    message: formattedMsg
                });
                io.emit('work_status_updated', updatePayload);
                io.emit('order_service_updated', {
                    order_id: conversation.order_id,
                    service_id: targetService.id,
                    service_status: 'completed',
                    services: updatedServices
                });
                io.emit('sop_subtask_completed', {
                    service_id: targetService.id,
                    order_id: conversation.order_id,
                    serviceId: targetService.id,
                    orderId: conversation.order_id
                });
            }

            sendSuccess(res, 'Vendor work marked as completed successfully', {
                service_id: targetService.id,
                service_status: 'completed',
                services: updatedServices,
                message: formattedMsg
            });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Customer marks entire project order as completed
     */
    completeOrder = async (req, res, next) => {
        try {
            const conversationId = req.params.id;
            const conversation = await chatRepository.findById(conversationId);
            if (!conversation) {
                return next(new AppError('Conversation not found', 404));
            }

            const isCustomerOwner = conversation.customer_user_id === req.user.id;
            const isAdmin = ['super_admin', 'admin', 'manager'].includes(req.user.role);

            if (!isCustomerOwner && !isAdmin) {
                return next(new AppError('Only the customer or administrator can mark the project order as completed', 403));
            }

            // 1. Update order status in orders table
            await pool.execute(
                `UPDATE orders SET order_status = 'delivered', updated_at = NOW() WHERE id = ?`,
                [conversation.order_id]
            );

            // 2. Mark all active services for this order as completed
            await pool.execute(
                `UPDATE order_services SET service_status = 'completed', updated_at = NOW() 
                 WHERE order_id = ? AND service_status != 'removed'`,
                [conversation.order_id]
            );

            // 3. Close the conversation
            await pool.execute(
                `UPDATE project_conversations 
                 SET status = 'completed', updated_at = NOW() 
                 WHERE id = ?`,
                [conversationId]
            );

            // 4. Mark all vendor participants as completed
            await pool.execute(
                `UPDATE conversation_participants 
                 SET completed_at = NOW() 
                 WHERE conversation_id = ? AND participant_type = 'vendor'`,
                [conversationId]
            );

            const customerName = req.user.name || conversation.customer_name || 'Customer';
            const content = `Project Order #${conversation.order_no} has been confirmed as completed by ${customerName}. All services are now finalized, and messaging is closed for all participants.`;

            const metadata = {
                action: 'order_completed',
                order_id: conversation.order_id,
                order_no: conversation.order_no,
                completed_by: customerName
            };

            const savedMsg = await chatRepository.saveMessage({
                conversation_id: conversationId,
                sender_type: 'system',
                sender_id: req.user.id,
                sender_name: 'CivilWorks System',
                message_type: 'system',
                content: content,
                file_name: JSON.stringify(metadata),
                file_type: 'order_completed'
            });

            const formattedMsg = {
                ...savedMsg,
                conversation_id: Number(conversationId),
                file_name: JSON.stringify(metadata),
                file_type: 'order_completed'
            };

            const updatedServices = await chatRepository.getOrderServices(conversation.order_id);

            // Create main notifications for all assigned vendors
            const [assignedVendors] = await pool.execute(
                `SELECT DISTINCT vendor_id FROM order_services 
                 WHERE order_id = ? AND vendor_id IS NOT NULL AND service_status != 'removed'`,
                [conversation.order_id]
            );
            for (const vRow of assignedVendors) {
                await notificationRepository.create({
                    vendor_id: vRow.vendor_id,
                    target_type: 'vendor',
                    order_id: conversation.order_id,
                    title: `Project Order Completed: #${conversation.order_no}`,
                    message: `Project Order #${conversation.order_no} has been confirmed as completed by ${customerName}. All services finalized.`,
                    type: 'work_completed'
                });
            }

            // Create main notification for customer
            await notificationRepository.create({
                user_id: conversation.customer_user_id,
                target_type: 'customer',
                order_id: conversation.order_id,
                title: `Project Order Completed: #${conversation.order_no}`,
                message: `You marked Project Order #${conversation.order_no} as completed. All services are finalized.`,
                type: 'work_completed'
            });

            // Emit via socket
            const io = req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
            if (io) {
                const completePayload = {
                    conversation_id: Number(conversationId),
                    order_id: Number(conversation.order_id),
                    order_status: 'delivered',
                    conversation_status: 'closed',
                    services: updatedServices
                };
                io.to(`conversation_${conversationId}`).to(`conversation_${Number(conversationId)}`).emit('new_message', formattedMsg);
                io.to(`conversation_${conversationId}`).to(`conversation_${Number(conversationId)}`).emit('order_completed', completePayload);
                io.emit('conversation_message_received', {
                    conversation_id: Number(conversationId),
                    order_id: Number(conversation.order_id),
                    message: formattedMsg
                });
                io.emit('order_completed', completePayload);
                io.emit('order_status_updated', completePayload);
                io.emit('notification_received', {
                    order_id: conversation.order_id,
                    type: 'work_completed',
                    title: `Project Order Completed: #${conversation.order_no}`
                });
                io.emit('new_notification', {
                    order_id: conversation.order_id,
                    type: 'work_completed'
                });
            }

            sendSuccess(res, 'Project order marked as completed and messaging closed', {
                order_id: conversation.order_id,
                order_status: 'delivered',
                conversation_status: 'closed',
                services: updatedServices,
                message: formattedMsg
            });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new ChatController();

