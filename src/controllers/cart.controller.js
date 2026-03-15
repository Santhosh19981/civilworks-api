const cartRepository = require('../repositories/cart.repository');
const productRepository = require('../repositories/product.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class CartController {
    /**
     * Get User Cart
     */
    getCart = async (req, res, next) => {
        try {
            const cartItems = await cartRepository.findByUserId(req.user.id);
            let subtotal = 0;
            cartItems.forEach(item => {
                subtotal += item.price * item.quantity;
            });

            sendSuccess(res, 'Cart retrieved successfully', { items: cartItems, subtotal });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Add Item to Cart
     */
    addToCart = async (req, res, next) => {
        try {
            const { product_id, quantity } = req.body;
            if (!product_id) return next(new AppError('Product ID is required', 400));

            // Check if product exists and has stock
            const product = await productRepository.findById(product_id);
            if (!product) return next(new AppError('Product not found', 404));
            if (product.stock < (quantity || 1)) return next(new AppError('Insufficient stock', 400));

            // Check if item already in cart
            const existingItem = await cartRepository.findItem(req.user.id, product_id);
            if (existingItem) {
                const newQuantity = existingItem.quantity + (quantity || 1);
                if (product.stock < newQuantity) return next(new AppError('Insufficient stock Total', 400));

                await cartRepository.updateQuantity(existingItem.id, req.user.id, newQuantity);
            } else {
                await cartRepository.addItem(req.user.id, product_id, quantity || 1);
            }

            const cartItems = await cartRepository.findByUserId(req.user.id);
            sendSuccess(res, 'Item added to cart', cartItems);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Cart Item Quantity
     */
    updateQuantity = async (req, res, next) => {
        try {
            const { quantity } = req.body;
            if (!quantity || quantity < 1) return next(new AppError('Quantity must be at least 1', 400));

            const item = await cartRepository.findItemByItemId(req.params.id, req.user.id);
            if (!item) return next(new AppError('Cart item not found', 404));

            // Check stock
            const product = await productRepository.findById(item.product_id);
            if (product.stock < quantity) return next(new AppError('Insufficient stock', 400));

            await cartRepository.updateQuantity(req.params.id, req.user.id, quantity);
            const cartItems = await cartRepository.findByUserId(req.user.id);
            sendSuccess(res, 'Cart updated', cartItems);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Remove Item from Cart
     */
    removeItem = async (req, res, next) => {
        try {
            const success = await cartRepository.removeItem(req.params.id, req.user.id);
            if (!success) return next(new AppError('Cart item not found', 404));

            const cartItems = await cartRepository.findByUserId(req.user.id);
            sendSuccess(res, 'Item removed from cart', cartItems);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new CartController();
