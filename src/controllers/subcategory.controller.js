const subcategoryRepository = require('../repositories/subcategory.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class SubcategoryController {
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const filters = { category_id: req.query.category_id };
            
            const result = await subcategoryRepository.findAll(page, limit, filters);
            sendSuccess(res, 'Subcategories retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    getById = async (req, res, next) => {
        try {
            const sub = await subcategoryRepository.findById(req.params.id);
            if (!sub) return next(new AppError('Subcategory not found', 404));
            sendSuccess(res, 'Subcategory retrieved successfully', sub);
        } catch (error) {
            next(error);
        }
    };

    create = async (req, res, next) => {
        try {
            const { name, category_id } = req.body;
            if (!name || !category_id) return next(new AppError('Name and category_id are required', 400));

            const subId = await subcategoryRepository.create(req.body);
            const sub = await subcategoryRepository.findById(subId);
            sendSuccess(res, 'Subcategory created successfully', sub, 201);
        } catch (error) {
            next(error);
        }
    };

    update = async (req, res, next) => {
        try {
            const success = await subcategoryRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Subcategory not found', 404));
            const sub = await subcategoryRepository.findById(req.params.id);
            sendSuccess(res, 'Subcategory updated successfully', sub);
        } catch (error) {
            next(error);
        }
    };

    delete = async (req, res, next) => {
        try {
            const success = await subcategoryRepository.delete(req.params.id);
            if (!success) return next(new AppError('Subcategory not found', 404));
            sendSuccess(res, 'Subcategory deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new SubcategoryController();
