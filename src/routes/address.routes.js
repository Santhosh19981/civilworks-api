const express = require('express');
const addressController = require('../controllers/address.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = express.Router();

// Only customers can manage addresses
router.use(protect, restrictTo('customer'));

router.get('/', addressController.getAll);
router.post('/', addressController.create);
router.put('/:id', addressController.update);
router.delete('/:id', addressController.delete);

module.exports = router;
