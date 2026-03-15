const rentalCategoryRepository = require('../repositories/rental-category.repository');
const { AppError } = require('../middlewares/error.middleware');
const { sendSuccess } = require('../utils/response.helper');

/**
 * Get All Rental Categories
 */
exports.getAllCategories = async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const result = await rentalCategoryRepository.findAll(parseInt(page) || 1, parseInt(limit) || 10);
        sendSuccess(res, 'Rental categories fetched successfully', result.data, 200, result.pagination);
    } catch (error) {
        next(error);
    }
};

/**
 * Get Rental Category By ID
 */
exports.getCategory = async (req, res, next) => {
    try {
        const category = await rentalCategoryRepository.findById(req.params.id);
        if (!category) {
            return next(new AppError('Rental category not found', 404));
        }
        sendSuccess(res, 'Rental category fetched successfully', category);
    } catch (error) {
        next(error);
    }
};

/**
 * Create Rental Category
 */
exports.createCategory = async (req, res, next) => {
    try {
        const id = await rentalCategoryRepository.create(req.body);
        const category = await rentalCategoryRepository.findById(id);
        sendSuccess(res, 'Rental category created successfully', category, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * Update Rental Category
 */
exports.updateCategory = async (req, res, next) => {
    try {
        const updated = await rentalCategoryRepository.update(req.params.id, req.body);
        if (!updated) {
            return next(new AppError('Rental category not found or no changes made', 404));
        }
        const category = await rentalCategoryRepository.findById(req.params.id);
        sendSuccess(res, 'Rental category updated successfully', category);
    } catch (error) {
        next(error);
    }
};

/**
 * Delete Rental Category
 */
exports.deleteCategory = async (req, res, next) => {
    try {
        const deleted = await rentalCategoryRepository.delete(req.params.id);
        if (!deleted) {
            return next(new AppError('Rental category not found', 404));
        }
        sendSuccess(res, 'Rental category deleted successfully', null, 200);
    } catch (error) {
        next(error);
    }
};
