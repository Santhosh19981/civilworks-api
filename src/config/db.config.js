const mysql = require('mysql2/promise');
const config = require('./app.config');
const logger = require('../utils/logger');

const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Test connection
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        logger.info('Database connected successfully to %s', config.db.name);
        connection.release();
    } catch (error) {
        logger.error('Database connection failed: %O', error);
        process.exit(1);
    }
};

module.exports = {
    pool,
    testConnection,
};
