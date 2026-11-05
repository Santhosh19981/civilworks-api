const cartRepository = require('../repositories/cart.repository');
const productRepository = require('../repositories/product.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class CartController {
    formatCartItems(cartItems) {
        return cartItems.map(item => {
            const isRental = item.subcategory_type === 'renting';
            const duration = item.rental_duration || (isRental ? 1 : null);
            const qty = item.quantity || 1;
            const itemTotal = isRental ? item.price * duration * qty : item.price * qty;

            return {
                id: item.id,
                user_id: item.user_id,
                product_id: item.product_id,
                quantity: qty,
                rental_duration: duration,
                unit_id: item.unit_id,
                unit_name: item.unit_name || (isRental ? 'Days' : 'KG'),
                subcategory_type: item.subcategory_type || 'selling',
                measurement_type: item.measurement_type,
                item_total: itemTotal,
                main_category_name: item.main_category_name || 'Construction',
                main_category_id: item.main_category_id || 1,
                created_at: item.created_at,
                updated_at: item.updated_at,
                product: {
                    id: item.product_id,
                    name: item.name,
                    price: item.price,
                    image: item.image,
                    stock: item.stock,
                    unit_name: item.unit_name || (isRental ? 'Days' : 'KG'),
                    subcategory_type: item.subcategory_type || 'selling',
                    measurement_type: item.measurement_type,
                    main_category_name: item.main_category_name || 'Construction',
                    main_category_id: item.main_category_id || 1
                }
            };
        });
    }

    calculateSubtotal(cartItems) {
        let subtotal = 0;
        for (const item of cartItems) {
            const isRental = item.subcategory_type === 'renting';
            const duration = item.rental_duration || (isRental ? 1 : null);
            const qty = item.quantity || 1;
            subtotal += isRental ? item.price * duration * qty : item.price * qty;
        }
        return subtotal;
    }

    /**
     * Get User Cart
     */
    getCart = async (req, res, next) => {
        try {
            const cartItems = await cartRepository.findByUserId(req.user.id);
            const subtotal = this.calculateSubtotal(cartItems);

            sendSuccess(res, 'Cart retrieved successfully', { items: this.formatCartItems(cartItems), subtotal });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Add Item to Cart
     */
    addToCart = async (req, res, next) => {
        try {
            const { product_id, quantity = 1, rental_duration = null, unit_id = null } = req.body;
            if (!product_id) return next(new AppError('Product ID is required', 400));

            // Check if product exists and has stock
            const product = await productRepository.findById(product_id);
            if (!product) return next(new AppError('Product not found', 404));
            // Check existing cart items for single order type restriction
            const existingCart = await cartRepository.findByUserId(req.user.id);
            const incomingType = product.subcategory_type || 'selling';
            if (existingCart.length > 0) {
                const currentType = existingCart[0].subcategory_type || 'selling';
                if (currentType !== incomingType) {
                    const typeLabel = (t) => t === 'renting' ? 'Rental' : (t === 'services' ? 'Service' : 'Product');
                    return next(new AppError(`You can only order one type of item at a time. Your cart currently contains ${typeLabel(currentType)} items. Please place your order or clear your cart before adding ${typeLabel(incomingType)} items.`, 400));
                }
            }

            const isRental = product.subcategory_type === 'renting';
            const finalDuration = isRental ? (rental_duration ? parseInt(rental_duration) : 1) : null;
            const finalUnitId = unit_id || product.unit_id;

            const isNonSelling = product.subcategory_type === 'renting' || 
                                 product.subcategory_type === 'services' || 
                                 product.type === 'renting' || 
                                 product.type === 'rental' || 
                                 product.type === 'services';

            // Check if item already in cart
            const existingItem = await cartRepository.findItem(req.user.id, product_id);
            if (existingItem) {
                const newQuantity = existingItem.quantity + (quantity || 1);
                if (!isNonSelling && product.stock < newQuantity) return next(new AppError('Insufficient stock total', 400));

                await cartRepository.updateQuantity(existingItem.id, req.user.id, newQuantity, finalDuration);
            } else {
                if (!isNonSelling && product.stock < (quantity || 1)) return next(new AppError('Insufficient stock', 400));
                await cartRepository.addItem(req.user.id, product_id, quantity || 1, finalDuration, finalUnitId);
            }

            const cartItems = await cartRepository.findByUserId(req.user.id);
            const subtotal = this.calculateSubtotal(cartItems);
            sendSuccess(res, 'Item added to cart', { items: this.formatCartItems(cartItems), subtotal });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Cart Item Quantity / Duration
     */
    updateQuantity = async (req, res, next) => {
        try {
            const { quantity, rental_duration } = req.body;
            if (quantity !== undefined && quantity < 1) return next(new AppError('Quantity must be at least 1', 400));
            if (rental_duration !== undefined && rental_duration < 1) return next(new AppError('Rental duration must be at least 1', 400));

            const item = await cartRepository.findItemByItemId(req.params.id, req.user.id);
            if (!item) return next(new AppError('Cart item not found', 404));

            // Check stock only for selling products (rentals & services have no stock constraint)
            const product = await productRepository.findById(item.product_id);
            const isNonSelling = product && (
                product.subcategory_type === 'renting' || 
                product.subcategory_type === 'services' || 
                product.type === 'renting' || 
                product.type === 'rental' || 
                product.type === 'services'
            );
            const targetQty = quantity !== undefined ? quantity : item.quantity;
            if (!isNonSelling && product && product.stock < targetQty) return next(new AppError('Insufficient stock', 400));

            const targetDuration = rental_duration !== undefined ? rental_duration : item.rental_duration;
            await cartRepository.updateQuantity(req.params.id, req.user.id, targetQty, targetDuration);

            const cartItems = await cartRepository.findByUserId(req.user.id);
            const subtotal = this.calculateSubtotal(cartItems);
            sendSuccess(res, 'Cart updated', { items: this.formatCartItems(cartItems), subtotal });
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
            const subtotal = this.calculateSubtotal(cartItems);
            sendSuccess(res, 'Item removed from cart', { items: this.formatCartItems(cartItems), subtotal });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Sync Cart
     */
    syncCart = async (req, res, next) => {
        try {
            const { items } = req.body;
            if (!items || !Array.isArray(items)) return next(new AppError('Items array is required', 400));

            for (const item of items) {
                const { product_id, quantity = 1, rental_duration = null, unit_id = null } = item;
                if (!product_id) continue;

                const existingItem = await cartRepository.findItem(req.user.id, product_id);
                if (existingItem) {
                    await cartRepository.updateQuantity(existingItem.id, req.user.id, existingItem.quantity + quantity, rental_duration);
                } else {
                    await cartRepository.addItem(req.user.id, product_id, quantity, rental_duration, unit_id);
                }
            }

            const cartItems = await cartRepository.findByUserId(req.user.id);
            const subtotal = this.calculateSubtotal(cartItems);
            sendSuccess(res, 'Cart synced successfully', { items: this.formatCartItems(cartItems), subtotal });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new CartController();
