const productRepository = require('../repositories/product.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');
const slugify = require('slugify');

class ProductController {
    /**
     * Get All Products
     */
    getAll = async (req, res, next) => {
        try {
            const { category_id, featured, search, page, limit } = req.query;
            const filters = {
                category_id,
                featured: featured !== undefined ? featured === 'true' : undefined,
                search
            };
            
            const p = parseInt(page) || 1;
            const l = parseInt(limit) || 10;
            
            const result = await productRepository.findAll(filters, p, l);
            sendSuccess(res, 'Products retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Product By ID
     */
    getById = async (req, res, next) => {
        try {
            const product = await productRepository.findById(req.params.id);
            if (!product) return next(new AppError('Product not found', 404));
            sendSuccess(res, 'Product retrieved successfully', product);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Product (Admin)
     */
    create = async (req, res, next) => {
        try {
            const { category_id, name, price, stock, description, featured } = req.body;
            if (!category_id || !name || !price) {
                return next(new AppError('Please provide category_id, name and price', 400));
            }

            const slug = slugify(name, { lower: true, strict: true });

            // Check if slug exists
            const existing = await productRepository.findBySlug(slug);
            const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

            const productId = await productRepository.create({
                ...req.body,
                slug: finalSlug
            });

            const product = await productRepository.findById(productId);
            sendSuccess(res, 'Product created successfully', product, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Product (Admin)
     */
    update = async (req, res, next) => {
        try {
            if (req.body.name) {
                req.body.slug = slugify(req.body.name, { lower: true, strict: true });
            }

            const success = await productRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Product not found or no changes made', 404));

            const product = await productRepository.findById(req.params.id);
            sendSuccess(res, 'Product updated successfully', product);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Product (Admin)
     */
    delete = async (req, res, next) => {
        try {
            const success = await productRepository.delete(req.params.id);
            if (!success) return next(new AppError('Product not found', 404));
            sendSuccess(res, 'Product deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new ProductController();
