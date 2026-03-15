const helperMemberRepository = require('../repositories/helper-member.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class HelperMemberController {
    /**
     * Get All Helper Members
     */
    getAll = async (req, res, next) => {
        try {
            const { search, helper_id, status, page, limit } = req.query;
            const result = await helperMemberRepository.findAll({ search, helper_id, status, page, limit });
            sendSuccess(res, 'Helper members retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Helper Member By ID
     */
    getById = async (req, res, next) => {
        try {
            const member = await helperMemberRepository.findById(req.params.id);
            if (!member) return next(new AppError('Helper member not found', 404));
            sendSuccess(res, 'Helper member retrieved successfully', member);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Helper Member
     */
    create = async (req, res, next) => {
        try {
            const memberId = await helperMemberRepository.create(req.body);
            const member = await helperMemberRepository.findById(memberId);
            sendSuccess(res, 'Helper member created successfully', member, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Helper Member
     */
    update = async (req, res, next) => {
        try {
            const success = await helperMemberRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Helper member not found or no changes made', 404));
            const member = await helperMemberRepository.findById(req.params.id);
            sendSuccess(res, 'Helper member updated successfully', member);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Helper Member
     */
    delete = async (req, res, next) => {
        try {
            const success = await helperMemberRepository.delete(req.params.id);
            if (!success) return next(new AppError('Helper member not found', 404));
            sendSuccess(res, 'Helper member deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new HelperMemberController();
