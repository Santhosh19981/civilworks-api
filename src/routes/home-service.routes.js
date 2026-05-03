const express = require('express');
const router = express.Router();
const homeServiceController = require('../controllers/home-service.controller');
// const { authenticate } = require('../middlewares/auth.middleware'); // Assuming auth is needed for admin

// Public routes (for app)
router.get('/active', homeServiceController.getActive);

// Admin routes
router.get('/', homeServiceController.getAll);
router.get('/:id', homeServiceController.getById);
router.put('/admin/reorder', homeServiceController.reorder);
router.post('/admin', homeServiceController.create);
router.put('/admin/:id', homeServiceController.update);
router.delete('/admin/:id', homeServiceController.delete);

module.exports = router;
