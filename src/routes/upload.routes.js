const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.middleware');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const { sendSuccess } = require('../utils/response.helper');

// POST /api/v1/upload
router.post('/', protect, restrictTo('super_admin', 'admin', 'manager'), upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'fail', message: 'Please upload a file' });
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

module.exports = router;
