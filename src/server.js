const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config/app.config');
const { testConnection } = require('./config/db.config');
const logger = require('./utils/logger');

const startServer = async () => {
    try {
        // 1. Test database connection
        await testConnection();

        // 2. Create HTTP server
        const server = http.createServer(app);

        // 3. Initialize Socket.IO
        const io = new Server(server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
            }
        });

        // Store io on app
        app.set('io', io);

        // Socket.IO event handling
        io.on('connection', (socket) => {
            logger.info(`Socket connected: ${socket.id}`);

            // Join a specific project conversation room
            socket.on('join_conversation', (conversationId) => {
                if (conversationId != null) {
                    socket.join(`conversation_${conversationId}`);
                    if (!isNaN(Number(conversationId))) {
                        socket.join(`conversation_${Number(conversationId)}`);
                    }
                    logger.info(`Socket ${socket.id} joined room conversation_${conversationId}`);
                }
            });

            // Leave room
            socket.on('leave_conversation', (conversationId) => {
                if (conversationId != null) {
                    socket.leave(`conversation_${conversationId}`);
                    if (!isNaN(Number(conversationId))) {
                        socket.leave(`conversation_${Number(conversationId)}`);
                    }
                    logger.info(`Socket ${socket.id} left room conversation_${conversationId}`);
                }
            });

            // Join order room for real-time order/SOP tracking
            socket.on('join_order', (orderId) => {
                if (orderId != null) {
                    socket.join(`order_${orderId}`);
                    if (!isNaN(Number(orderId))) {
                        socket.join(`order_${Number(orderId)}`);
                    }
                    logger.info(`Socket ${socket.id} joined order room order_${orderId}`);
                }
            });

            socket.on('leave_order', (orderId) => {
                if (orderId != null) {
                    socket.leave(`order_${orderId}`);
                    if (!isNaN(Number(orderId))) {
                        socket.leave(`order_${Number(orderId)}`);
                    }
                    logger.info(`Socket ${socket.id} left order room order_${orderId}`);
                }
            });

            // Join vendor channel
            socket.on('join_vendor', (vendorId) => {
                if (vendorId != null) {
                    socket.join(`vendor_${vendorId}`);
                    if (!isNaN(Number(vendorId))) {
                        socket.join(`vendor_${Number(vendorId)}`);
                    }
                    logger.info(`Socket ${socket.id} joined vendor room vendor_${vendorId}`);
                }
            });

            socket.on('leave_vendor', (vendorId) => {
                if (vendorId != null) {
                    socket.leave(`vendor_${vendorId}`);
                    if (!isNaN(Number(vendorId))) {
                        socket.leave(`vendor_${Number(vendorId)}`);
                    }
                    logger.info(`Socket ${socket.id} left vendor room vendor_${vendorId}`);
                }
            });

            // Join user channel
            socket.on('join_user', (userId) => {
                if (userId != null) {
                    socket.join(`user_${userId}`);
                    if (!isNaN(Number(userId))) {
                        socket.join(`user_${Number(userId)}`);
                    }
                    logger.info(`Socket ${socket.id} joined user room user_${userId}`);
                }
            });

            socket.on('leave_user', (userId) => {
                if (userId != null) {
                    socket.leave(`user_${userId}`);
                    if (!isNaN(Number(userId))) {
                        socket.leave(`user_${Number(userId)}`);
                    }
                    logger.info(`Socket ${socket.id} left user room user_${userId}`);
                }
            });

            // Typing indicator
            socket.on('typing', ({ conversationId, senderName, isTyping }) => {
                socket.to(`conversation_${conversationId}`).emit('user_typing', {
                    conversationId,
                    senderName,
                    isTyping
                });
            });

            socket.on('disconnect', () => {
                logger.info(`Socket disconnected: ${socket.id}`);
            });
        });

        // 4. Start Server
        const port = config.app.port;
        server.listen(port, () => {
            logger.info(`
        ################################################
        🛡️  Server listening on port: ${port} 🛡️
        🏡 Environment: ${config.app.env}
        💬 Real-time Socket.IO Engine: Active
        ################################################
      `);

            // Check due subtasks on startup and then every 30 minutes
            const sopRepository = require('./repositories/sop.repository');
            setTimeout(() => {
                sopRepository.notifyDueSubtaskVendors(io).catch(err => logger.error('SOP due notify error:', err));
            }, 5000);
            setInterval(() => {
                sopRepository.notifyDueSubtaskVendors(io).catch(err => logger.error('SOP due notify error:', err));
            }, 30 * 60 * 1000);
        });

        // Handle promise rejections
        process.on('unhandledRejection', (err) => {
            logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
            logger.error(err.name, err.message);
            server.close(() => {
                process.exit(1);
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (err) => {
            logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
            logger.error(err.name, err.message);
            process.exit(1);
        });

        // Handle SIGTERM
        process.on('SIGTERM', () => {
            logger.info('👋 SIGTERM RECEIVED. Shutting down gracefully');
            server.close(() => {
                logger.info('💥 Process terminated!');
            });
        });

    } catch (error) {
        logger.error('Failed to start server: %O', error);
        process.exit(1);
    }
};

startServer();
