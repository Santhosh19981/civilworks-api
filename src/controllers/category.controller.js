const categoryRepository = require('../repositories/category.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class CategoryController {
    /**
     * Get All Categories
     */
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            
            const result = await categoryRepository.findAll(page, limit);
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
     */
    create = async (req, res, next) => {
        try {
            const { name, icon } = req.body;
            if (!name) return next(new AppError('Category name is required', 400));

            const categoryId = await categoryRepository.create({ name, icon });
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
            const success = await categoryRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Category not found or no changes made', 404));

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
            const success = await categoryRepository.delete(req.params.id);
            if (!success) return next(new AppError('Category not found', 404));
            sendSuccess(res, 'Category deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new CategoryController();
