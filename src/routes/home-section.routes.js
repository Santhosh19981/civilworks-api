const express = require('express');
const router = express.Router();
const homeSectionController = require('../controllers/home-section.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

// Public
router.get('/active', homeSectionController.getActive);

// Admin
router.get('/', protect, restrictTo('super_admin', 'admin'), homeSectionController.getAll);
router.post('/', protect, restrictTo('super_admin', 'admin'), homeSectionController.create);
router.get('/:id', protect, restrictTo('super_admin', 'admin'), homeSectionController.getById);
router.put('/:id', protect, restrictTo('super_admin', 'admin'), homeSectionController.update);
router.delete('/:id', protect, restrictTo('super_admin', 'admin'), homeSectionController.delete);

module.exports = router;
