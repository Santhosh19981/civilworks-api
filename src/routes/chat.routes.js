const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const chatController = require('../controllers/chat.controller');
const { protect } = require('../middlewares/auth.middleware');
const { sendSuccess, sendError } = require('../utils/response.helper');

const router = express.Router();

// Ensure uploads/chat directory exists
const chatUploadsDir = path.resolve(__dirname, '../uploads/chat');
if (!fs.existsSync(chatUploadsDir)) {
    fs.mkdirSync(chatUploadsDir, { recursive: true });
}

// Multer storage for chat media
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(chatUploadsDir)) {
            fs.mkdirSync(chatUploadsDir, { recursive: true });
        }
        cb(null, chatUploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
        cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
    }
});

// Allowed file types: image, video, audio, pdf, docs
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/aac',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
    ];

    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: Images, Videos, Audio, PDF, and Documents.`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});

// 1. Upload route
router.post('/upload', protect, (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return sendError(res, err.message || 'Chat file upload failed', 400);
        }
        if (!req.file) {
            return sendError(res, 'Please provide a file to upload', 400);
        }

        const fileUrl = `/uploads/chat/${req.file.filename}`;
        let messageType = 'document';
        if (req.file.mimetype.startsWith('image/')) messageType = 'image';
        else if (req.file.mimetype.startsWith('video/')) messageType = 'video';
        else if (req.file.mimetype.startsWith('audio/')) messageType = 'audio';
        else if (req.file.mimetype === 'application/pdf') messageType = 'pdf';

        sendSuccess(res, 'File uploaded successfully', {
            url: fileUrl,
            file_url: fileUrl,
            attachment_url: fileUrl,
            filename: req.file.originalname,
            file_name: req.file.originalname,
            attachment_name: req.file.originalname,
            stored_name: req.file.filename,
            size: req.file.size,
            file_size: req.file.size,
            attachment_size: req.file.size,
            mimetype: req.file.mimetype,
            file_type: req.file.mimetype,
            attachment_mime: req.file.mimetype,
            message_type: messageType
        });
    });
});

// 2. Conversation routes
router.get('/conversations', protect, chatController.getConversations);
router.get('/conversations/:id/messages', protect, chatController.getMessages);
router.post('/conversations/:id/messages', protect, chatController.sendMessage);
router.post('/conversations/:id/request-completion', protect, chatController.requestCompletion);
router.post('/conversations/:id/complete-work', protect, chatController.completeWork);
router.post('/conversations/:id/complete-order', protect, chatController.completeOrder);

module.exports = router;

