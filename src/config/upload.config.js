const multer = require('multer');
const path = require('path');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Placeholder for Multer Upload Config
 * Detailed config will be added in Phase 6
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'src/uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

module.exports = upload;
