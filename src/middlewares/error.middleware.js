const logger = require('../utils/logger');
const { sendError } = require('../utils/response.helper');

/**
 * Centralized Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Show full error in development or QA for easier debugging
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'qa') {
        logger.error('Error: %O', err);
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack, error: err }),
        });
    }

    // Production mode — handle known MySQL errors with user-friendly messages
    if (err.code === 'ER_NO_SUCH_TABLE') {
        logger.error('DB Table Missing: %O', err);
        return sendError(res, 'Database configuration error. Please contact support.', 500);
    }
    if (err.code === 'ER_DUP_ENTRY') {
        return sendError(res, 'This record already exists.', 409);
    }
    if (err.code === 'ER_BAD_FIELD_ERROR') {
        logger.error('DB Field Error: %O', err);
        return sendError(res, 'Database configuration error. Please contact support.', 500);
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR') {
        logger.error('DB Connection Error: %O', err);
        return sendError(res, 'Service temporarily unavailable. Please try again later.', 503);
    }

    // Operational errors: safe to expose message to user
    if (err.isOperational) {
        return sendError(res, err.message, err.statusCode);
    }

    // Unknown errors: log and hide internals
    logger.error('Unexpected Error: %O', err);
    return sendError(res, 'Something went very wrong!', 500);
};


/**
 * Custom Error Class
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = {
    errorHandler,
    AppError,
};
