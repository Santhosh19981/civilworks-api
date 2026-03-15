const app = require('./app');
const config = require('./config/app.config');
const { testConnection } = require('./config/db.config');
const logger = require('./utils/logger');

const startServer = async () => {
    try {
        // 1. Test database connection
        await testConnection();

        // 2. Start Express server
        const port = config.app.port;
        const server = app.listen(port, () => {
            logger.info(`
        ################################################
        🛡️  Server listening on port: ${port} 🛡️
        🏡 Environment: ${config.app.env}
        ################################################
      `);
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
