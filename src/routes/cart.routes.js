const express = require('express');
const cartController = require('../controllers/cart.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = express.Router();

// Only customers can manage cart
router.use(protect, restrictTo('customer'));

router.get('/', cartController.getCart);
router.post('/', cartController.addToCart);
router.post('/sync', cartController.syncCart);
router.put('/:id', cartController.updateQuantity);
router.delete('/:id', cartController.removeItem);

module.exports = router;
