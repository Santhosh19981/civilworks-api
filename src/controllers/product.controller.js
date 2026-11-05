const productRepository = require('../repositories/product.repository');
const subcategoryRepository = require('../repositories/subcategory.repository');
const unitRepository = require('../repositories/unit.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');
const { pool } = require('../config/db.config');
const slugify = require('slugify');

class ProductController {
    /**
     * Validate unit compatibility with subcategory configuration
     */
    async validateUnitCompatibility(subcategoryId, unitId) {
        if (!unitId) return; // Unit optional if not yet assigned, but validated if provided

        const subcategory = await subcategoryRepository.findById(subcategoryId);
        if (!subcategory) {
            throw new AppError('Selected subcategory not found', 400);
        }

        const unit = await unitRepository.findById(unitId);
        if (!unit) {
            throw new AppError('Selected unit not found', 400);
        }

        if (subcategory.type === 'selling') {
            if (!unit.unit_category.startsWith('selling_')) {
                throw new AppError(`Invalid unit: Subcategory '${subcategory.name}' is a Selling subcategory and requires a Selling unit (e.g., Piece, Box, KG, Meters, Liter), but received '${unit.name}' (${unit.unit_category})`, 400);
            }
        } else if (subcategory.type === 'renting' || subcategory.type === 'services') {
            if (!unit.unit_category.startsWith('renting_')) {
                throw new AppError(`Invalid unit: Subcategory '${subcategory.name}' (${subcategory.type}) requires a Duration / Contract unit (e.g., Hours, Days, Shifts, Till the contract completion), but received '${unit.name}' (${unit.unit_category})`, 400);
            }
        } else if (subcategory.type === 'helpers') {
            // Helpers can accept either quantity (workers/count) or duration (shifts/days)
        }
    }

    /**
     * Get All Products
     */
    getAll = async (req, res, next) => {
        try {
            const { main_category_id, category_id, subcategory_id, featured, search, status, page, limit, type } = req.query;
            const filters = {};

            if (main_category_id) filters.main_category_id = main_category_id;
            if (category_id) filters.category_id = category_id;
            if (subcategory_id) filters.subcategory_id = subcategory_id;
            if (type) filters.type = type;
            if (featured !== undefined) filters.featured = featured === 'true' || featured === '1';
            if (search) filters.search = search;

            if (status) {
                filters.status = status;
            } else if (!req.baseUrl.includes('admin') && !req.query.all) {
                // By default for customer app, show only active products
                filters.status = 'active';
            }
            
            const p = parseInt(page) || 1;
            const l = parseInt(limit) || 10;
            
            const result = await productRepository.findAll(filters, p, l);
            for (const item of (result.data || [])) {
                if (item.skills && typeof item.skills === 'string') {
                    try { item.skills = JSON.parse(item.skills); } catch (e) {}
                }
            }
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
            product.product_type = product.subcategory_type || 'selling';
            if (product.skills && typeof product.skills === 'string') {
                try { product.skills = JSON.parse(product.skills); } catch (e) {}
            }
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
            let { subcategory_id, unit_id, name, price, stock, category_id } = req.body;
            if (!name || !name.trim()) {
                return next(new AppError('Product name is required', 400));
            }
            if (!subcategory_id) {
                return next(new AppError('Subcategory is required', 400));
            }
            if (price === undefined || price === null || price < 0) {
                return next(new AppError('Valid price is required', 400));
            }

            // Derive category_id from subcategory
            const subcategory = await subcategoryRepository.findById(subcategory_id);
            if (!subcategory) {
                return next(new AppError('Selected subcategory does not exist', 400));
            }
            category_id = subcategory.category_id;

            // Validate dynamic unit compatibility based on subcategory type and measurement_type
            if (unit_id) {
                const unit = await unitRepository.findById(unit_id);
                if (!unit) {
                    return next(new AppError('Selected unit not found', 400));
                }

                if (subcategory.type === 'selling') {
                    if (subcategory.measurement_type === 'weight' && !unit.unit_category.includes('weight')) {
                        return next(new AppError(`Invalid unit: Subcategory '${subcategory.name}' is Selling (Weight) and requires a Weight unit (e.g. KG, Grams, Ton), but received '${unit.name}'`, 400));
                    } else if (subcategory.measurement_type === 'length' && !unit.unit_category.includes('length')) {
                        return next(new AppError(`Invalid unit: Subcategory '${subcategory.name}' is Selling (Length) and requires a Length unit (e.g. Meters, Sq Feet), but received '${unit.name}'`, 400));
                    } else if (!unit.unit_category.startsWith('selling_')) {
                        return next(new AppError(`Invalid unit: Subcategory '${subcategory.name}' requires a Selling unit, but received '${unit.name}'`, 400));
                    }
                } else if (subcategory.type === 'renting' || subcategory.type === 'services') {
                    if (!unit.unit_category.startsWith('renting_') && !unit.name.toLowerCase().includes('contract')) {
                        return next(new AppError(`Invalid unit: Subcategory '${subcategory.name}' requires a Duration/Contract unit, but received '${unit.name}'`, 400));
                    }
                } else if (subcategory.type === 'helpers') {
                    // For helpers, quantity or duration units are permitted
                }
            }

            const slug = slugify(name, { lower: true, strict: true });
            const existing = await productRepository.findBySlug(slug);
            const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

            const productId = await productRepository.create({
                ...req.body,
                category_id,
                subcategory_id,
                name: name.trim(),
                slug: finalSlug
            });

            // Automatically sync to rentals catalog if renting subcategory or Category 6
            if (subcategory && (subcategory.type === 'renting' || String(category_id) === '6')) {
                try {
                    const [existingRental] = await pool.execute('SELECT id FROM rentals WHERE name = ?', [name.trim()]);
                    if (existingRental.length === 0) {
                        const [catRows] = await pool.execute('SELECT main_category_id FROM categories WHERE id = ?', [category_id]);
                        const mainCatId = catRows[0]?.main_category_id || 1;
                        await pool.execute(
                            `INSERT INTO rentals 
                             (main_category_id, category_id, subcategory_id, unit_id, name, image, description, price_per_day, status, featured) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                mainCatId,
                                category_id,
                                subcategory_id,
                                unit_id || null,
                                name.trim(),
                                req.body.image || '',
                                req.body.description || '',
                                price,
                                req.body.status || 'active',
                                req.body.featured ? 1 : 0
                            ]
                        );
                    }
                } catch (syncErr) {
                    console.warn('Syncing product create to rentals warning:', syncErr.message);
                }
            }

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
            const existing = await productRepository.findById(req.params.id);
            if (!existing) return next(new AppError('Product not found', 404));

            let subcategoryId = req.body.subcategory_id || existing.subcategory_id;
            let categoryId = req.body.category_id || existing.category_id;
            const unitId = req.body.unit_id !== undefined ? req.body.unit_id : existing.unit_id;

            if (req.body.subcategory_id) {
                const subcategory = await subcategoryRepository.findById(subcategoryId);
                if (subcategory) {
                    categoryId = subcategory.category_id;
                    req.body.category_id = categoryId;
                }
            }

            if (unitId && subcategoryId) {
                await this.validateUnitCompatibility(subcategoryId, unitId);
            }

            if (req.body.name) {
                req.body.slug = slugify(req.body.name, { lower: true, strict: true });
            }

            const success = await productRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Product not found or no changes made', 400));

            // Sync update to rentals table if renting subcategory or Category 6
            const sub = await subcategoryRepository.findById(subcategoryId);
            if ((sub && sub.type === 'renting') || String(categoryId) === '6') {
                try {
                    const prodName = req.body.name ? req.body.name.trim() : existing.name;
                    const [matchingRentals] = await pool.execute(
                        'SELECT id FROM rentals WHERE name = ? OR name = ?',
                        [existing.name, prodName]
                    );
                    const newPrice = req.body.price !== undefined ? req.body.price : existing.price;
                    const newImage = req.body.image !== undefined ? req.body.image : existing.image;
                    const newDesc = req.body.description !== undefined ? req.body.description : existing.description;
                    const newStatus = req.body.status !== undefined ? req.body.status : existing.status;
                    const newUnit = req.body.unit_id !== undefined ? req.body.unit_id : existing.unit_id;

                    if (matchingRentals.length > 0) {
                        await pool.execute(
                            `UPDATE rentals 
                             SET name = ?, price_per_day = ?, image = ?, description = ?, status = ?, category_id = ?, subcategory_id = ?, unit_id = ?
                             WHERE id = ?`,
                            [prodName, newPrice, newImage, newDesc, newStatus, categoryId, subcategoryId, newUnit, matchingRentals[0].id]
                        );
                    } else {
                        const [catRows] = await pool.execute('SELECT main_category_id FROM categories WHERE id = ?', [categoryId]);
                        const mainCatId = catRows[0]?.main_category_id || 1;
                        await pool.execute(
                            `INSERT INTO rentals 
                             (main_category_id, category_id, subcategory_id, unit_id, name, image, description, price_per_day, status, featured) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [mainCatId, categoryId, subcategoryId, newUnit, prodName, newImage || '', newDesc || '', newPrice, newStatus, 0]
                        );
                    }
                } catch (syncErr) {
                    console.warn('Syncing product update to rentals warning:', syncErr.message);
                }
            }

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
            const product = await productRepository.findById(req.params.id);
            if (!product) return next(new AppError('Product not found', 404));

            const success = await productRepository.delete(req.params.id);
            if (!success) return next(new AppError('Failed to delete product', 500));

            // Sync delete to rentals table
            try {
                await pool.execute('DELETE FROM rentals WHERE name = ?', [product.name]);
            } catch (syncErr) {
                console.warn('Syncing product delete to rentals warning:', syncErr.message);
            }

            sendSuccess(res, 'Product deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new ProductController();
