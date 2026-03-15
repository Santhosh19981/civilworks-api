const express = require('express');
const employeeController = require('../controllers/employee.controller');
const { protect, restrictTo, checkPermission } = require('../middlewares/auth.middleware');

const router = express.Router();

// All employee routes are restricted to super_admin and admin (now via checkPermission)
router.use(protect);
router.use(checkPermission('employees'));

router.get('/', employeeController.getAll);
router.get('/:id', employeeController.getById);

// Admin routes for mutations (match CoreService pattern globally)
router.post('/admin', employeeController.create);
router.put('/admin/:id', employeeController.update);
router.delete('/admin/:id', employeeController.delete);

module.exports = router;
