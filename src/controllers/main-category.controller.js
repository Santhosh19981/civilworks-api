const mainCategoryRepository = require('../repositories/main-category.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class MainCategoryController {
    /**
     * Get All Main Categories
     */
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const filters = {};

            if (req.query.status) {
                filters.status = req.query.status;
            } else if (!req.baseUrl.includes('admin') && !req.query.all) {
                // By default for customer/public queries, show active only
                filters.status = 'active';
            }

            if (req.query.search) {
                filters.search = req.query.search;
            }

            const result = await mainCategoryRepository.findAll(page, limit, filters);
            sendSuccess(res, 'Main categories retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Main Category By ID
     */
    getById = async (req, res, next) => {
        try {
            const mainCategory = await mainCategoryRepository.findById(req.params.id);
            if (!mainCategory) {
                return next(new AppError('Main category not found', 404));
            }
            sendSuccess(res, 'Main category retrieved successfully', mainCategory);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Main Category (Admin)
     */
    create = async (req, res, next) => {
        try {
            const { name, description, image, status } = req.body;
            if (!name || !name.trim()) {
                return next(new AppError('Main category name is required', 400));
            }

            const existing = await mainCategoryRepository.findByName(name.trim());
            if (existing) {
                return next(new AppError('A main category with this name already exists', 400));
            }

            const id = await mainCategoryRepository.create({
                name: name.trim(),
                description: description ? description.trim() : null,
                image: image || null,
                status: status || 'active'
            });

            const created = await mainCategoryRepository.findById(id);
            sendSuccess(res, 'Main category created successfully', created, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Main Category (Admin)
     */
    update = async (req, res, next) => {
        try {
            const { name } = req.body;
            if (name !== undefined && !name.trim()) {
                return next(new AppError('Main category name cannot be empty', 400));
            }

            const existing = await mainCategoryRepository.findById(req.params.id);
            if (!existing) {
                return next(new AppError('Main category not found', 404));
            }

            if (name && name.trim() !== existing.name) {
                const duplicate = await mainCategoryRepository.findByName(name.trim());
                if (duplicate) {
                    return next(new AppError('A main category with this name already exists', 400));
                }
            }

            const success = await mainCategoryRepository.update(req.params.id, req.body);
            if (!success) {
                return next(new AppError('Main category not updated or no changes detected', 400));
            }

            const updated = await mainCategoryRepository.findById(req.params.id);
            sendSuccess(res, 'Main category updated successfully', updated);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Main Category (Admin)
     */
    delete = async (req, res, next) => {
        try {
            const mainCategory = await mainCategoryRepository.findById(req.params.id);
            if (!mainCategory) {
                return next(new AppError('Main category not found', 404));
            }

            const dependentCount = await mainCategoryRepository.countDependentCategories(req.params.id);
            if (dependentCount > 0) {
                return next(new AppError(`Cannot delete main category: It contains ${dependentCount} dependent categories. Reassign or delete them first.`, 400));
            }

            const success = await mainCategoryRepository.delete(req.params.id);
            if (!success) {
                return next(new AppError('Failed to delete main category', 500));
            }

            sendSuccess(res, 'Main category deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new MainCategoryController();
