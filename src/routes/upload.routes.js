const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.middleware');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const { sendSuccess, sendError } = require('../utils/response.helper');

// POST /api/v1/upload
router.post('/', protect, restrictTo('super_admin', 'admin', 'manager'), (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            return sendError(res, err.message || 'File upload failed', err.statusCode || 400);
        }
        if (!req.file) {
            return res.status(400).json({ status: 'fail', message: 'Please upload an image file' });
        }
        
        // Construct the URL to access the uploaded file
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        sendSuccess(res, 'File uploaded successfully', {
            url: fileUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size
        });
    });
});

module.exports = router;
