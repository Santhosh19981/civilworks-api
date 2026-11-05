const unitRepository = require('../repositories/unit.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

const VALID_CATEGORIES = [
    'selling_weight',
    'selling_length',
    'selling_quantity',
    'selling_volume',
    'renting_duration'
];

const isValidCategory = (category) => {
    if (!category || typeof category !== 'string') return false;
    const cat = category.trim();
    if (VALID_CATEGORIES.includes(cat)) return true;
    return (cat.startsWith('selling_') || cat.startsWith('renting_')) && cat.length >= 8 && cat.length <= 50;
};

class UnitController {
    /**
     * Get All Units (Supports ?unit_category=... &status=...)
     */
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const filters = {};

            if (req.query.unit_category) {
                filters.unit_category = req.query.unit_category;
            }
            if (req.query.status) {
                filters.status = req.query.status;
            } else if (!req.baseUrl.includes('admin') && !req.query.all) {
                filters.status = 'active';
            }
            if (req.query.search) {
                filters.search = req.query.search;
            }

            const result = await unitRepository.findAll(page, limit, filters);
            sendSuccess(res, 'Units retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Unit By ID
     */
    getById = async (req, res, next) => {
        try {
            const unit = await unitRepository.findById(req.params.id);
            if (!unit) {
                return next(new AppError('Unit not found', 404));
            }
            sendSuccess(res, 'Unit retrieved successfully', unit);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Unit (Admin)
     */
    create = async (req, res, next) => {
        try {
            const { name, unit_category, status } = req.body;
            if (!name || !name.trim()) {
                return next(new AppError('Unit name is required', 400));
            }
            if (!unit_category || !isValidCategory(unit_category)) {
                return next(new AppError(`Valid unit category is required (${VALID_CATEGORIES.join(', ')})`, 400));
            }

            const id = await unitRepository.create({
                name: name.trim(),
                unit_category,
                status: status || 'active'
            });

            const created = await unitRepository.findById(id);
            sendSuccess(res, 'Unit created successfully', created, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Unit (Admin)
     */
    update = async (req, res, next) => {
        try {
            const { name, unit_category } = req.body;
            if (name !== undefined && !name.trim()) {
                return next(new AppError('Unit name cannot be empty', 400));
            }
            if (unit_category !== undefined && !isValidCategory(unit_category)) {
                return next(new AppError(`Valid unit category is required (${VALID_CATEGORIES.join(', ')})`, 400));
            }

            const existing = await unitRepository.findById(req.params.id);
            if (!existing) {
                return next(new AppError('Unit not found', 404));
            }

            const success = await unitRepository.update(req.params.id, req.body);
            if (!success) {
                return next(new AppError('Unit not updated or no changes detected', 400));
            }

            const updated = await unitRepository.findById(req.params.id);
            sendSuccess(res, 'Unit updated successfully', updated);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Unit (Admin)
     */
    delete = async (req, res, next) => {
        try {
            const unit = await unitRepository.findById(req.params.id);
            if (!unit) {
                return next(new AppError('Unit not found', 404));
            }

            const dependentProducts = await unitRepository.countDependentProducts(req.params.id);
            if (dependentProducts > 0) {
                return next(new AppError(`Cannot delete unit: It is used by ${dependentProducts} products. Deactivate the unit instead or reassign the products.`, 400));
            }

            const success = await unitRepository.delete(req.params.id);
            if (!success) {
                return next(new AppError('Failed to delete unit', 500));
            }

            sendSuccess(res, 'Unit deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new UnitController();
