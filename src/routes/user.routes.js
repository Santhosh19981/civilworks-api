const express = require('express');
const userController = require('../controllers/user.controller');
const { protect, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', protect, checkPermission('customers'), userController.getAll);
router.put('/profile', protect, userController.updateProfile);

module.exports = router;
