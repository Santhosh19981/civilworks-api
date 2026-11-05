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
    connectionLimit: 15,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    maxIdle: 10,
    idleTimeout: 60000
});

// Wrap execute and query with 1-time automatic retry on ECONNRESET / disconnection
const originalExecute = pool.execute.bind(pool);
const originalQuery = pool.query.bind(pool);

pool.execute = async function (...args) {
    try {
        return await originalExecute(...args);
    } catch (err) {
        if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.fatal) {
            logger.warn(`Database connection lost (${err.code}). Reconnecting and retrying execute...`);
            return await originalExecute(...args);
        }
        throw err;
    }
};

pool.query = async function (...args) {
    try {
        return await originalQuery(...args);
    } catch (err) {
        if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.fatal) {
            logger.warn(`Database connection lost (${err.code}). Reconnecting and retrying query...`);
            return await originalQuery(...args);
        }
        throw err;
    }
};

// Periodic heartbeat to prevent remote firewall / NAT timeout
setInterval(async () => {
    try {
        await pool.query('SELECT 1');
    } catch (err) {
        // Silently handled: pool will recreate connection on next query
    }
}, 20000);

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
