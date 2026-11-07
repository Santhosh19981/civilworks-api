const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sopController = require('../controllers/sop.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

// Ensure uploads/sop directory exists
const sopUploadsDir = path.resolve(__dirname, '../uploads/sop');
if (!fs.existsSync(sopUploadsDir)) {
    fs.mkdirSync(sopUploadsDir, { recursive: true });
}

// Multer storage for SOP proof images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(sopUploadsDir)) {
            fs.mkdirSync(sopUploadsDir, { recursive: true });
        }
        cb(null, sopUploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
        cb(null, `sop-proof-${nameWithoutExt}-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, WebP) are allowed for subtask completion proof.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB
    }
});

// All routes require authentication
router.use(protect);

// Order SOP routes
router.get('/orders', sopController.getOrders);
router.get('/orders/:orderId', sopController.getOrderSOP);
router.put('/orders/:orderId/sequence', sopController.reorderServices);

// Service routes
router.put('/services/:serviceId', sopController.updateService);
router.post('/services/:serviceId/subtasks', sopController.createSubtask);
router.put('/services/:serviceId/subtasks/sequence', sopController.reorderSubtasks);
router.post('/services/:serviceId/raise-completion-request', sopController.raiseCompletionRequest);

// Subtask routes
router.put('/subtasks/:subtaskId', sopController.updateSubtask);
router.delete('/subtasks/:subtaskId', sopController.deleteSubtask);
router.post('/subtasks/:subtaskId/complete', sopController.completeSubtask);
router.post('/subtasks/:subtaskId/upload-proof', upload.single('image'), sopController.uploadProof);
router.post('/subtasks/:subtaskId/review', sopController.reviewSubtask);
router.post('/subtasks/:subtaskId/comments', sopController.addSubtaskComment);

// Completion request response route
router.post('/completion-requests/:requestId/respond', sopController.respondCompletionRequest);

module.exports = router;
