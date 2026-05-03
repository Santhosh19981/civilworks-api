const express = require('express');
const router = express.Router();
const homeSectionController = require('../controllers/home-section.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

// Public
router.get('/active', homeSectionController.getActive);

// Admin
router.get('/', protect, restrictTo('admin'), homeSectionController.getAll);
router.post('/', protect, restrictTo('admin'), homeSectionController.create);
router.get('/:id', protect, restrictTo('admin'), homeSectionController.getById);
router.put('/:id', protect, restrictTo('admin'), homeSectionController.update);
router.delete('/:id', protect, restrictTo('admin'), homeSectionController.delete);

module.exports = router;
