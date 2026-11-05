const skillRepository = require('../repositories/skill.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class SkillController {
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const filters = {};

            if (req.query.status) {
                filters.status = req.query.status;
            } else if (!req.baseUrl.includes('admin') && !req.query.all) {
                filters.status = 'active';
            }

            if (req.query.search) {
                filters.search = req.query.search;
            }

            const result = await skillRepository.findAll(page, limit, filters);
            sendSuccess(res, 'Skills retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    getById = async (req, res, next) => {
        try {
            const skill = await skillRepository.findById(req.params.id);
            if (!skill) return next(new AppError('Skill not found', 404));
            sendSuccess(res, 'Skill retrieved successfully', skill);
        } catch (error) {
            next(error);
        }
    };

    create = async (req, res, next) => {
        try {
            const { name, image, status } = req.body;
            if (!name || !name.trim()) {
                return next(new AppError('Skill name is required', 400));
            }
            if (!image || !image.trim()) {
                return next(new AppError('Skill image is required', 400));
            }

            const id = await skillRepository.create({
                name: name.trim(),
                image: image.trim(),
                status: status || 'active'
            });

            const created = await skillRepository.findById(id);
            sendSuccess(res, 'Skill created successfully', created, 201);
        } catch (error) {
            next(error);
        }
    };

    update = async (req, res, next) => {
        try {
            const { name, image, status } = req.body;
            const existing = await skillRepository.findById(req.params.id);
            if (!existing) return next(new AppError('Skill not found', 404));

            if (name !== undefined && !name.trim()) {
                return next(new AppError('Skill name cannot be empty', 400));
            }

            await skillRepository.update(req.params.id, {
                ...(name && { name: name.trim() }),
                ...(image && { image: image.trim() }),
                ...(status && { status })
            });

            const updated = await skillRepository.findById(req.params.id);
            sendSuccess(res, 'Skill updated successfully', updated);
        } catch (error) {
            next(error);
        }
    };

    delete = async (req, res, next) => {
        try {
            const existing = await skillRepository.findById(req.params.id);
            if (!existing) return next(new AppError('Skill not found', 404));

            await skillRepository.delete(req.params.id);
            sendSuccess(res, 'Skill deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new SkillController();
