const categoryRepository = require('../repositories/category.repository');
const mainCategoryRepository = require('../repositories/main-category.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class CategoryController {
    /**
     * Get All Categories (Supports ?main_category_id=... &status=...)
     */
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const filters = {};

            if (req.query.main_category_id) {
                filters.main_category_id = req.query.main_category_id;
            }
            if (req.query.status) {
                filters.status = req.query.status;
            } else if (!req.baseUrl.includes('admin') && !req.query.all) {
                filters.status = 'active';
            }
            if (req.query.search) {
                filters.search = req.query.search;
            }
            
            const result = await categoryRepository.findAll(page, limit, filters);
            sendSuccess(res, 'Categories retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Category By ID
     */
    getById = async (req, res, next) => {
        try {
            const category = await categoryRepository.findById(req.params.id);
            if (!category) {
                return next(new AppError('Category not found', 404));
            }
            sendSuccess(res, 'Category retrieved successfully', category);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Category (Admin)
     * Requires: name, main_category_ids (or main_category_id)
     */
    create = async (req, res, next) => {
        try {
            const { name, main_category_id, main_category_ids, description, icon, status } = req.body;
            if (!name || !name.trim()) {
                return next(new AppError('Category name is required', 400));
            }

            let ids = Array.isArray(main_category_ids) ? main_category_ids.map(Number).filter(Boolean) : [];
            if (ids.length === 0 && main_category_id) {
                ids = [Number(main_category_id)];
            }
            if (ids.length === 0) {
                return next(new AppError('At least one Parent Main Category is required', 400));
            }

            for (const mcId of ids) {
                const mainCategory = await mainCategoryRepository.findById(mcId);
                if (!mainCategory) {
                    return next(new AppError(`Selected Main Category #${mcId} does not exist`, 400));
                }
            }

            const categoryId = await categoryRepository.create({
                name: name.trim(),
                main_category_id: ids[0],
                main_category_ids: ids,
                description: description ? description.trim() : null,
                icon: icon || 'categories',
                status: status || 'active'
            });

            const category = await categoryRepository.findById(categoryId);
            sendSuccess(res, 'Category created successfully', category, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Category (Admin)
     */
    update = async (req, res, next) => {
        try {
            const { name, main_category_id, main_category_ids } = req.body;
            if (name !== undefined && !name.trim()) {
                return next(new AppError('Category name cannot be empty', 400));
            }

            let ids = undefined;
            if (main_category_ids !== undefined) {
                ids = Array.isArray(main_category_ids) ? main_category_ids.map(Number).filter(Boolean) : [];
                if (ids.length === 0 && main_category_id) {
                    ids = [Number(main_category_id)];
                }
                if (ids.length === 0) {
                    return next(new AppError('At least one Parent Main Category is required', 400));
                }
                for (const mcId of ids) {
                    const mainCategory = await mainCategoryRepository.findById(mcId);
                    if (!mainCategory) {
                        return next(new AppError(`Selected Main Category #${mcId} does not exist`, 400));
                    }
                }
            } else if (main_category_id !== undefined) {
                const mainCategory = await mainCategoryRepository.findById(main_category_id);
                if (!mainCategory) {
                    return next(new AppError('Selected Main Category does not exist', 400));
                }
                ids = [Number(main_category_id)];
            }

            const existing = await categoryRepository.findById(req.params.id);
            if (!existing) {
                return next(new AppError('Category not found', 404));
            }

            const updatePayload = { ...req.body };
            if (ids !== undefined) {
                updatePayload.main_category_ids = ids;
                updatePayload.main_category_id = ids[0];
            }

            const success = await categoryRepository.update(req.params.id, updatePayload);
            if (!success) {
                return next(new AppError('Category not updated or no changes detected', 400));
            }

            const category = await categoryRepository.findById(req.params.id);
            sendSuccess(res, 'Category updated successfully', category);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Category (Admin)
     */
    delete = async (req, res, next) => {
        try {
            const category = await categoryRepository.findById(req.params.id);
            if (!category) {
                return next(new AppError('Category not found', 404));
            }

            const success = await categoryRepository.delete(req.params.id);
            if (!success) {
                return next(new AppError('Failed to delete category', 500));
            }

            sendSuccess(res, 'Category deleted successfully and following categories renumbered');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new CategoryController();
