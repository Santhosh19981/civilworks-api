const express = require('express');
const { sendSuccess } = require('../utils/response.helper');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   GET /api/v1/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health', (req, res) => {
    logger.info('Health check triggered');
    return sendSuccess(res, 'CivilWorks API is healthy', {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        version: '1.0.0',
    });
});

module.exports = router;
