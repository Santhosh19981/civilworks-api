/**
 * Success Response Helper
 */
const sendSuccess = (res, message, data = null, statusCode = 200, pagination = null) => {
    const response = {
        status: 'success',
        message,
        data,
    };
    if (pagination) response.pagination = pagination;
    return res.status(statusCode).json(response);
};

/**
 * Error Response Helper
 */
const sendError = (res, message, statusCode = 500, errors = null) => {
    const response = {
        status: 'error',
        message,
    };
    if (errors) response.errors = errors;
    return res.status(statusCode).json(response);
};

module.exports = {
    sendSuccess,
    sendError,
};
