const subcategoryRepository = require('../repositories/subcategory.repository');
const categoryRepository = require('../repositories/category.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class SubcategoryController {
    /**
     * Get All Subcategories (supports ?category_id=... &main_category_id=... &status=... &type=...)
     */
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const filters = {};

            if (req.query.category_id) {
                filters.category_id = req.query.category_id;
            }
            if (req.query.main_category_id) {
                filters.main_category_id = req.query.main_category_id;
            }
            if (req.query.type) {
                filters.type = req.query.type;
            }
            if (req.query.status) {
                filters.status = req.query.status;
            } else if (!req.baseUrl.includes('admin') && !req.query.all) {
                filters.status = 'active';
            }
            if (req.query.search) {
                filters.search = req.query.search;
            }

            const result = await subcategoryRepository.findAll(page, limit, filters);
            sendSuccess(res, 'Subcategories retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Subcategory By ID
     */
    getById = async (req, res, next) => {
        try {
            const subcategory = await subcategoryRepository.findById(req.params.id);
            if (!subcategory) {
                return next(new AppError('Subcategory not found', 404));
            }
            sendSuccess(res, 'Subcategory retrieved successfully', subcategory);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Subcategory (Admin)
     * Fields: name, category_id, description, type (selling/renting), measurement_type
     */
    create = async (req, res, next) => {
        try {
            let { name, category_id, image, description, type, measurement_type, status, is_editable_order } = req.body;
            if (!name || !name.trim()) {
                return next(new AppError('Subcategory name is required', 400));
            }
            if (!category_id) {
                return next(new AppError('Parent Category is required', 400));
            }

            const category = await categoryRepository.findById(category_id);
            if (!category) {
                return next(new AppError('Selected Parent Category does not exist', 400));
            }

            type = type || 'selling';
            if (!['selling', 'renting', 'services', 'helpers'].includes(type)) {
                return next(new AppError("Type must be either 'selling', 'renting', 'services', or 'helpers'", 400));
            }

            if (type === 'selling') {
                measurement_type = measurement_type || 'weight';
                if (!['weight', 'length', 'quantity', 'volume'].includes(measurement_type)) {
                    return next(new AppError("For Selling subcategories, measurement type must be 'weight', 'length', 'quantity', or 'volume'", 400));
                }
            } else if (type === 'renting' || type === 'services') {
                measurement_type = 'duration';
            } else if (type === 'helpers') {
                measurement_type = measurement_type || 'workers';
                if (!['workers', 'duration'].includes(measurement_type)) {
                    measurement_type = 'workers';
                }
            }

            const id = await subcategoryRepository.create({
                name: name.trim(),
                category_id,
                image: image ? image.trim() : null,
                description: description ? description.trim() : null,
                type,
                measurement_type,
                status: status || 'active',
                is_editable_order: type === 'helpers' ? 0 : (is_editable_order ? 1 : 0)
            });

            const created = await subcategoryRepository.findById(id);
            sendSuccess(res, 'Subcategory created successfully', created, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Subcategory (Admin)
     */
    update = async (req, res, next) => {
        try {
            const { name, category_id, type, measurement_type } = req.body;
            if (name !== undefined && !name.trim()) {
                return next(new AppError('Subcategory name cannot be empty', 400));
            }
            if (category_id !== undefined) {
                const category = await categoryRepository.findById(category_id);
                if (!category) {
                    return next(new AppError('Selected Parent Category does not exist', 400));
                }
            }

            const existing = await subcategoryRepository.findById(req.params.id);
            if (!existing) {
                return next(new AppError('Subcategory not found', 404));
            }

            const targetType = type || existing.type;
            if (!['selling', 'renting', 'services', 'helpers'].includes(targetType)) {
                return next(new AppError("Type must be either 'selling', 'renting', 'services', or 'helpers'", 400));
            }

            let targetMeasurement = measurement_type || existing.measurement_type;

            if (targetType === 'selling') {
                if (!['weight', 'length', 'quantity', 'volume'].includes(targetMeasurement)) {
                    return next(new AppError("For Selling subcategories, measurement type must be 'weight', 'length', 'quantity', or 'volume'", 400));
                }
            } else if (targetType === 'renting' || targetType === 'services') {
                targetMeasurement = 'duration';
            } else if (targetType === 'helpers') {
                targetMeasurement = targetMeasurement || 'workers';
                if (!['workers', 'duration'].includes(targetMeasurement)) {
                    targetMeasurement = 'workers';
                }
            }

            const updateData = { ...req.body };
            if (targetType === 'renting' || targetType === 'services') {
                updateData.measurement_type = 'duration';
            } else if (targetType === 'helpers') {
                updateData.measurement_type = targetMeasurement;
                updateData.is_editable_order = 0;
            }

            const success = await subcategoryRepository.update(req.params.id, updateData);
            if (!success) {
                return next(new AppError('Subcategory not updated or no changes detected', 400));
            }

            const updated = await subcategoryRepository.findById(req.params.id);
            sendSuccess(res, 'Subcategory updated successfully', updated);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Subcategory (Admin)
     */
    delete = async (req, res, next) => {
        try {
            const subcategory = await subcategoryRepository.findById(req.params.id);
            if (!subcategory) {
                return next(new AppError('Subcategory not found', 404));
            }

            const dependentProducts = await subcategoryRepository.countDependentProducts(req.params.id);
            if (dependentProducts > 0) {
                return next(new AppError(`Cannot delete subcategory: It contains ${dependentProducts} dependent products. Reassign or delete them first.`, 400));
            }

            const success = await subcategoryRepository.delete(req.params.id);
            if (!success) {
                return next(new AppError('Failed to delete subcategory', 500));
            }

            sendSuccess(res, 'Subcategory deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new SubcategoryController();
