const jwt = require('jsonwebtoken');
const config = require('../config/app.config');
const { pool } = require('../config/db.config');
const vendorRepository = require('../repositories/vendor.repository');
const chatRepository = require('../repositories/chat.repository');
const notificationRepository = require('../repositories/notification.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

// Helper to normalize Indian mobile numbers
const normalizeMobile = (mobile) => {
    if (!mobile) return '';
    let cleaned = String(mobile).replace(/\D/g, '');
    if (cleaned.length > 10 && cleaned.startsWith('91')) {
        cleaned = cleaned.substring(2);
    }
    return cleaned.slice(-10);
};

class VendorPortalController {
    /**
     * Check if Vendor is Enlisted by Mobile & Send OTP
     * Public endpoint
     */
    checkMobile = async (req, res, next) => {
        try {
            const { mobile } = req.body;
            const cleanMobile = normalizeMobile(mobile);

            if (!cleanMobile || cleanMobile.length < 10) {
                return next(new AppError('Please provide a valid 10-digit mobile number', 400));
            }

            const [rows] = await pool.execute(
                'SELECT * FROM vendors WHERE (RIGHT(REPLACE(REPLACE(REPLACE(mobile, " ", ""), "-", ""), "+", ""), 10) = ? OR mobile LIKE ?) AND status != "deleted"',
                [cleanMobile, `%${cleanMobile}%`]
            );

            // In development / testing, default OTP is 1234
            const otp = '1234';

            if (rows.length > 0) {
                const vendor = rows[0];
                try {
                    vendor.services = await vendorRepository.getServicesByVendorId(vendor.id);
                } catch (svcErr) {
                    vendor.services = [];
                }
                return sendSuccess(res, 'Vendor found. OTP sent to registered mobile.', {
                    exists: true,
                    vendor: {
                        id: vendor.id,
                        name: vendor.name,
                        mobile: vendor.mobile,
                        email: vendor.email,
                        image: vendor.image,
                        status: vendor.status,
                        services: vendor.services || []
                    },
                    otp // sent for demonstration / development convenience
                });
            } else {
                return sendSuccess(res, 'Vendor not currently enlisted. Please complete sign up.', {
                    exists: false,
                    mobile: cleanMobile,
                    otp
                });
            }
        } catch (error) {
            next(error);
        }
    };

    /**
     * Send or Resend OTP
     */
    sendOtp = async (req, res, next) => {
        try {
            const { mobile } = req.body;
            const cleanMobile = normalizeMobile(mobile);

            if (!cleanMobile) {
                return next(new AppError('Valid mobile number required', 400));
            }

            const otp = '1234';
            sendSuccess(res, `Verification code sent to +91 ${cleanMobile}`, { otp });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Verify OTP & Authenticate Enlisted Vendor
     */
    verifyOtp = async (req, res, next) => {
        try {
            const { mobile, otp } = req.body;
            const cleanMobile = normalizeMobile(mobile);

            if (!cleanMobile) {
                return next(new AppError('Mobile number is required', 400));
            }
            if (!otp || String(otp).trim() !== '1234') {
                return next(new AppError('Invalid OTP code. Use test OTP: 1234', 400));
            }

            // Find vendor
            const [rows] = await pool.execute(
                'SELECT * FROM vendors WHERE (RIGHT(REPLACE(REPLACE(REPLACE(mobile, " ", ""), "-", ""), "+", ""), 10) = ? OR mobile LIKE ?) AND status != "deleted"',
                [cleanMobile, `%${cleanMobile}%`]
            );

            if (rows.length === 0) {
                return sendSuccess(res, 'OTP verified. Please proceed with signup.', {
                    verified: true,
                    exists: false,
                    mobile: cleanMobile
                });
            }

            const vendor = rows[0];
            try {
                vendor.services = await vendorRepository.getServicesByVendorId(vendor.id);
            } catch (svcErr) {
                vendor.services = [];
            }

            const token = jwt.sign(
                { id: vendor.id, vendor_id: vendor.id, name: vendor.name, mobile: vendor.mobile, role: 'vendor' },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            sendSuccess(res, 'Vendor authenticated successfully', {
                verified: true,
                exists: true,
                token,
                vendor: {
                    id: vendor.id,
                    name: vendor.name,
                    mobile: vendor.mobile,
                    email: vendor.email,
                    image: vendor.image,
                    status: vendor.status,
                    role: 'vendor',
                    services: vendor.services
                }
            });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Sign Up / Enlist New Vendor
     */
    signup = async (req, res, next) => {
        try {
            const { name, mobile, email, image, status = 'active', services, subcategories, otp } = req.body;
            const targetServices = services || subcategories || [];

            if (!name || !name.trim()) {
                return next(new AppError('Vendor name is required', 400));
            }
            const cleanMobile = normalizeMobile(mobile);
            if (!cleanMobile || cleanMobile.length < 10) {
                return next(new AppError('A valid 10-digit mobile number is required', 400));
            }

            if (otp && String(otp).trim() !== '1234') {
                return next(new AppError('Invalid OTP. Use test OTP: 1234', 400));
            }

            // Check if vendor already exists
            const [existing] = await pool.execute(
                'SELECT id FROM vendors WHERE mobile LIKE ?',
                [`%${cleanMobile}%`]
            );
            if (existing.length > 0) {
                return next(new AppError('A vendor is already registered with this mobile number. Please log in.', 400));
            }

            const serviceIds = Array.isArray(targetServices)
                ? targetServices.map(s => typeof s === 'object' ? s.id : s).filter(Boolean)
                : [];

            const vendorId = await vendorRepository.create({
                name: name.trim(),
                mobile: cleanMobile,
                email: email ? email.trim() : null,
                image: image || null,
                status: status || 'active'
            }, serviceIds);

            const vendor = await vendorRepository.findById(vendorId);

            // Generate vendor token
            const token = jwt.sign(
                { id: vendor.id, vendor_id: vendor.id, name: vendor.name, mobile: vendor.mobile, role: 'vendor' },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            sendSuccess(res, 'Vendor enlisted successfully! Welcome to CivilWorks partner network.', {
                token,
                vendor: {
                    id: vendor.id,
                    name: vendor.name,
                    mobile: vendor.mobile,
                    email: vendor.email,
                    image: vendor.image,
                    status: vendor.status,
                    role: 'vendor',
                    services: vendor.services
                }
            }, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get All Service Subcategories for Vendor Signup Multi-Select
     */
    getServiceSubcategories = async (req, res, next) => {
        try {
            const query = `
                SELECT s.id, s.name, s.category_id, s.image, c.name as category_name
                FROM subcategories s
                LEFT JOIN categories c ON s.category_id = c.id
                WHERE s.type = 'services' AND s.status = 'active'
                ORDER BY s.name ASC
            `;
            const [rows] = await pool.execute(query);
            sendSuccess(res, 'Service subcategories retrieved successfully', rows);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Upload Vendor Logo / Photo
     */
    uploadPhoto = async (req, res, next) => {
        try {
            if (!req.file) {
                return next(new AppError('Please select an image file to upload', 400));
            }
            const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
            sendSuccess(res, 'Photo uploaded successfully', { url: fileUrl, filename: req.file.filename });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Current Vendor Profile
     */
    getProfile = async (req, res, next) => {
        try {
            const vendorId = req.user.vendor_id || req.user.id;
            const vendor = await vendorRepository.findById(vendorId);
            if (!vendor) return next(new AppError('Vendor not found', 404));

            sendSuccess(res, 'Vendor profile retrieved', vendor);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Direct Mobile Login (Legacy/Fallback)
     */
    loginByMobile = async (req, res, next) => {
        try {
            const { mobile } = req.body;
            const cleanMobile = normalizeMobile(mobile);
            if (!cleanMobile) {
                return next(new AppError('Please provide your registered mobile number', 400));
            }

            const [rows] = await pool.execute(
                'SELECT * FROM vendors WHERE mobile LIKE ? AND status = "active"',
                [`%${cleanMobile}%`]
            );

            if (rows.length === 0) {
                return next(new AppError('No active vendor found with this mobile number. Please sign up.', 404));
            }

            const vendor = rows[0];
            vendor.services = await vendorRepository.getServicesByVendorId(vendor.id);

            const token = jwt.sign(
                { id: vendor.id, vendor_id: vendor.id, name: vendor.name, mobile: vendor.mobile, role: 'vendor' },
                config.jwt.secret,
                { expiresIn: config.jwt.expiresIn }
            );

            sendSuccess(res, 'Vendor authenticated successfully', {
                vendor: {
                    id: vendor.id,
                    name: vendor.name,
                    mobile: vendor.mobile,
                    email: vendor.email,
                    image: vendor.image,
                    status: vendor.status,
                    role: 'vendor',
                    services: vendor.services
                },
                token
            });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Assigned Orders / Service Requests
     * User Requirement: "he can see his orders which he was assigned... if he assigned to a order then he will get a notification with the order details of address and service without customer details , if only he accepts the order then only he should be added in the chat group with the customer ."
     */
    getRequests = async (req, res, next) => {
        try {
            const vendorId = req.user.vendor_id || req.user.id;
            const query = `
                SELECT 
                    os.id,
                    os.order_id,
                    os.subcategory_id,
                    os.vendor_id,
                    os.vendor_status,
                    os.service_status,
                    os.price,
                    os.notes,
                    os.created_at,
                    COALESCE(NULLIF(os.service_name, ''), (SELECT p.name FROM products p WHERE p.subcategory_id = sc.id LIMIT 1), sc.name) as service_name,
                    sc.name as subcategory_name,
                    sc.is_editable_order,
                    o.order_no,
                    o.order_status,
                    o.total_amount as order_total,
                    o.created_at as order_created_at,
                    u.name as raw_customer_name,
                    u.mobile as raw_customer_mobile,
                    a.address_line_1,
                    a.address_line_2,
                    a.city,
                    a.state,
                    a.pincode,
                    a.landmark,
                    pc.id as conversation_id,
                    cp.status as participant_status
                FROM order_services os
                JOIN orders o ON os.order_id = o.id
                JOIN users u ON o.user_id = u.id
                JOIN subcategories sc ON os.subcategory_id = sc.id
                LEFT JOIN addresses a ON o.address_id = a.id
                LEFT JOIN project_conversations pc ON o.id = pc.order_id
                LEFT JOIN conversation_participants cp ON pc.id = cp.conversation_id AND cp.vendor_id = ?
                WHERE os.vendor_id = ?
                ORDER BY os.created_at DESC
            `;

            const [rows] = await pool.execute(query, [vendorId, vendorId]);

            // Format address and enforce privacy gating
            const formatted = rows.map(r => {
                const isAccepted = r.vendor_status === 'accepted';
                const isRemoved = r.service_status === 'removed' || r.participant_status === 'removed';

                // Format full location address
                const addressParts = [r.address_line_1, r.landmark, r.address_line_2, r.city, r.state, r.pincode].filter(Boolean);
                const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Customer Project Site (Address provided at booking)';

                return {
                    id: r.id,
                    order_id: r.order_id,
                    order_no: r.order_no,
                    order_status: r.order_status,
                    order_created_at: r.order_created_at,
                    service_name: r.service_name,
                    subcategory_name: r.subcategory_name,
                    price: r.price,
                    notes: r.notes,
                    vendor_status: r.vendor_status,
                    service_status: r.service_status,
                    is_removed: isRemoved,
                    is_editable_order: r.is_editable_order,
                    conversation_id: isAccepted && !isRemoved ? r.conversation_id : null,
                    site_address: fullAddress,
                    address: {
                        address_line_1: r.address_line_1,
                        address_line_2: r.address_line_2,
                        city: r.city,
                        state: r.state,
                        pincode: r.pincode,
                        landmark: r.landmark,
                        flat_no: r.address_line_1,
                        area_locality: r.address_line_2
                    },
                    // PRIVACY RULE: Customer details ONLY revealed if vendor accepted!
                    customer: isAccepted && !isRemoved ? {
                        name: r.raw_customer_name,
                        mobile: r.raw_customer_mobile
                    } : null,
                    privacy_notice: isAccepted ? null : 'Customer contact details will be revealed upon accepting this service request.'
                };
            });

            sendSuccess(res, 'Assigned orders retrieved successfully', formatted);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Notifications for Vendor
     * Displays service request notifications with work site address and service, without customer details!
     */
    getNotifications = async (req, res, next) => {
        try {
            const vendorId = req.user.vendor_id || req.user.id;

            const query = `
                SELECT 
                    n.*,
                    o.order_no,
                    a.address_line_1,
                    a.address_line_2,
                    a.landmark,
                    a.city,
                    a.state,
                    a.pincode,
                    sc.name as subcategory_name,
                    os.id as service_req_id,
                    os.vendor_status,
                    os.service_status,
                    COALESCE(NULLIF(os.service_name, ''), (SELECT p.name FROM products p WHERE p.subcategory_id = sc.id LIMIT 1), sc.name) as service_name
                FROM notifications n
                LEFT JOIN orders o ON n.order_id = o.id
                LEFT JOIN addresses a ON o.address_id = a.id
                LEFT JOIN order_services os ON (
                    (n.service_id IS NOT NULL AND os.id = n.service_id)
                    OR (n.service_id IS NULL AND os.id = (
                        SELECT os2.id FROM order_services os2 
                        WHERE os2.order_id = o.id AND os2.vendor_id = ?
                        ORDER BY os2.id DESC LIMIT 1
                    ))
                )
                LEFT JOIN subcategories sc ON os.subcategory_id = sc.id
                WHERE n.target_type = 'vendor' AND n.vendor_id = ? AND n.type != 'chat_message'
                ORDER BY n.created_at DESC, n.id DESC
                LIMIT 50
            `;

            const [rows] = await pool.execute(query, [vendorId, vendorId]);

            const map = new Map();
            rows.forEach(r => {
                const isServiceReqCard = (r.type === 'service_request' || r.type === 'service_accepted' || r.type === 'service_rejected');
                const groupKey = (isServiceReqCard && r.order_id && (r.service_req_id || r.service_id))
                    ? `order_${r.order_id}_svc_${r.service_req_id || r.service_id}`
                    : `notif_${r.id}`;

                const addressParts = [r.address_line_1, r.landmark, r.address_line_2, r.city, r.state, r.pincode].filter(Boolean);
                const item = {
                    id: r.id,
                    order_id: r.order_id,
                    order_no: r.order_no,
                    service_id: r.service_id || r.service_req_id,
                    title: r.title,
                    message: r.message,
                    type: r.type,
                    is_read: Boolean(r.is_read),
                    created_at: r.created_at,
                    service_name: r.service_name || r.subcategory_name || 'Assigned Service',
                    subcategory_name: r.subcategory_name,
                    service_req_id: r.service_req_id || r.service_id,
                    vendor_status: r.vendor_status || 'pending',
                    service_status: r.service_status || 'pending',
                    site_location: addressParts.length > 0 ? addressParts.join(', ') : 'Project Site'
                };

                if (!map.has(groupKey)) {
                    map.set(groupKey, item);
                }
            });

            sendSuccess(res, 'Notifications retrieved', Array.from(map.values()));
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Vendor's Eligible Project Conversations
     */
    getConversations = async (req, res, next) => {
        try {
            const vendorId = req.user.vendor_id || req.user.id;
            const convs = await chatRepository.findConversationsForVendor(vendorId);
            sendSuccess(res, 'Conversations retrieved', convs);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Accept Service Request
     * Adds vendor to the project conversation with customer and fellow contractors
     */
    acceptRequest = async (req, res, next) => {
        try {
            const requestId = req.params.id;
            const vendorId = req.user.vendor_id || req.user.id;

            const [rows] = await pool.execute(
                `SELECT os.*, o.user_id as customer_id, o.order_no, sc.name as subcategory_name, sc.is_editable_order, v.name as vendor_name, u.name as customer_name, u.mobile as customer_mobile
                 FROM order_services os
                 JOIN orders o ON os.order_id = o.id
                 JOIN users u ON o.user_id = u.id
                 JOIN subcategories sc ON os.subcategory_id = sc.id
                 JOIN vendors v ON os.vendor_id = v.id
                 WHERE os.id = ? AND os.vendor_id = ?`,
                [requestId, vendorId]
            );

            if (rows.length === 0) {
                return next(new AppError('Service request not found or not assigned to you', 404));
            }

            const serviceReq = rows[0];

            if (serviceReq.service_status === 'removed') {
                return next(new AppError('This service request has been removed from the order', 400));
            }

            // Update status
            await pool.execute(
                'UPDATE order_services SET vendor_status = "accepted", service_status = "in_progress" WHERE id = ?',
                [requestId]
            );

            // Ensure project conversation exists and add vendor
            let conversation = await chatRepository.findByOrderId(serviceReq.order_id);
            if (!conversation) {
                const convId = await chatRepository.createConversation(serviceReq.order_id, `Project Order #${serviceReq.order_no}`);
                conversation = { id: convId };

                // Add customer to conversation
                await chatRepository.addParticipant(convId, {
                    userId: serviceReq.customer_id,
                    participantType: 'customer',
                    status: 'active'
                });
            }

            // Add this vendor to the EXISTING project conversation
            await chatRepository.addParticipant(conversation.id, {
                vendorId: vendorId,
                participantType: 'vendor',
                status: 'active'
            });

            // Post system message to the project group
            const systemMsg = `${serviceReq.vendor_name} accepted the ${serviceReq.subcategory_name} service request and joined this project group.`;
            const savedMsg = await chatRepository.saveMessage({
                conversation_id: conversation.id,
                sender_type: 'system',
                sender_id: vendorId,
                sender_name: 'CivilWorks System',
                message_type: 'system',
                content: systemMsg
            });

            const io = req.app.get('io');
            if (io) {
                const updatedServices = await chatRepository.getOrderServices(serviceReq.order_id);
                const statusPayload = {
                    conversation_id: conversation.id,
                    order_id: serviceReq.order_id,
                    service_id: requestId,
                    vendor_id: vendorId,
                    vendor_status: 'accepted',
                    service_status: 'in_progress',
                    services: updatedServices
                };
                io.to(`conversation_${conversation.id}`).emit('new_message', savedMsg);
                io.to(`conversation_${conversation.id}`).emit('participant_joined', {
                    vendor_id: vendorId,
                    vendor_name: serviceReq.vendor_name
                });
                io.to(`conversation_${conversation.id}`).emit('vendor_status_updated', statusPayload);
                io.emit('vendor_status_updated', statusPayload);
                io.emit('conversation_message_received', {
                    conversation_id: conversation.id,
                    order_id: serviceReq.order_id,
                    message: savedMsg
                });
                io.emit('order_service_updated', {
                    order_id: serviceReq.order_id,
                    service_id: requestId,
                    vendor_status: 'accepted',
                    service_status: 'in_progress',
                    services: updatedServices
                });
            }

            // Notify customer
            await notificationRepository.createOrUpdateForOrder({
                user_id: serviceReq.customer_id,
                target_type: 'customer',
                order_id: serviceReq.order_id,
                title: `${serviceReq.vendor_name} accepted your request`,
                message: `${serviceReq.vendor_name} is now assigned to ${serviceReq.subcategory_name} and joined your Project Communication Group.`,
                type: 'vendor_accepted'
            });

            // Update vendor notification record to reflect acceptance
            await pool.execute(
                `UPDATE notifications 
                 SET title = CONCAT('Service Request Accepted: ', ?),
                     message = CONCAT('You accepted the service request for ', ?, ' on Project Order #', ?),
                     type = 'service_accepted',
                     service_id = ?,
                     is_read = 1
                 WHERE vendor_id = ? AND order_id = ? AND target_type = 'vendor'
                   AND (service_id = ? OR (service_id IS NULL AND type = 'service_request'))`,
                [serviceReq.subcategory_name, serviceReq.subcategory_name, serviceReq.order_no, serviceReq.id, vendorId, serviceReq.order_id, serviceReq.id]
            );

            sendSuccess(res, 'Service request accepted successfully. You have joined the Project Group.', {
                conversation_id: conversation.id,
                customer: {
                    name: serviceReq.customer_name,
                    mobile: serviceReq.customer_mobile
                }
            });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Reject Service Request
     */
    rejectRequest = async (req, res, next) => {
        try {
            const requestId = req.params.id;
            const vendorId = req.user.vendor_id || req.user.id;

            const [rows] = await pool.execute(
                `SELECT os.*, o.user_id as customer_id, o.order_no, sc.name as subcategory_name, v.name as vendor_name
                 FROM order_services os
                 JOIN orders o ON os.order_id = o.id
                 JOIN subcategories sc ON os.subcategory_id = sc.id
                 JOIN vendors v ON os.vendor_id = v.id
                 WHERE os.id = ? AND os.vendor_id = ?`,
                [requestId, vendorId]
            );

            if (rows.length === 0) {
                return next(new AppError('Service request not found or not assigned to you', 404));
            }

            const serviceReq = rows[0];

            // Mark as rejected
            await pool.execute(
                'UPDATE order_services SET vendor_status = "rejected", service_status = "pending" WHERE id = ?',
                [requestId]
            );

            // Notify customer with option to reselect another vendor
            await notificationRepository.createOrUpdateForOrder({
                user_id: serviceReq.customer_id,
                target_type: 'customer',
                order_id: serviceReq.order_id,
                title: `${serviceReq.vendor_name} declined service request`,
                message: `${serviceReq.vendor_name} was unable to take your ${serviceReq.subcategory_name} request. Please choose another available vendor.`,
                type: 'vendor_rejected'
            });

            // Update vendor notification record to reflect decline
            await pool.execute(
                `UPDATE notifications 
                 SET title = CONCAT('Service Request Declined: ', ?),
                     message = CONCAT('You declined the service request for ', ?, ' on Project Order #', ?),
                     type = 'service_rejected',
                     service_id = ?,
                     is_read = 1
                 WHERE vendor_id = ? AND order_id = ? AND target_type = 'vendor'
                   AND (service_id = ? OR (service_id IS NULL AND type = 'service_request'))`,
                [serviceReq.subcategory_name, serviceReq.subcategory_name, serviceReq.order_no, serviceReq.id, vendorId, serviceReq.order_id, serviceReq.id]
            );

            const io = req.app.get('io');
            if (io) {
                const updatedServices = await chatRepository.getOrderServices(serviceReq.order_id);
                const rejectPayload = {
                    order_id: serviceReq.order_id,
                    service_id: requestId,
                    vendor_id: vendorId,
                    vendor_status: 'rejected',
                    service_status: 'pending',
                    services: updatedServices
                };
                io.emit('vendor_status_updated', rejectPayload);
                io.emit('order_service_updated', rejectPayload);
            }

            sendSuccess(res, 'Service request declined successfully.');
        } catch (error) {
            next(error);
        }
    };

    /**
     * Mark all vendor notifications as read
     */
    markNotificationsRead = async (req, res, next) => {
        try {
            const vendorId = req.user.vendor_id || req.user.id;
            await notificationRepository.markAllAsReadForVendor(vendorId);
            sendSuccess(res, 'Vendor notifications marked as read');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new VendorPortalController();

