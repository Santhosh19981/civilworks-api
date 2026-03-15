const userRepository = require('../repositories/user.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class UserController {
    /**
     * Get All Users
     */
    getAll = async (req, res, next) => {
        try {
            const { page, limit, role, search } = req.query;
            const filters = { role, search };
            
            const result = await userRepository.findAll(page, limit, filters);
            
            sendSuccess(res, 'Users retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Current User Profile
     */
    updateProfile = async (req, res, next) => {
        try {
            // req.user is set by the 'protect' middleware
            const userId = req.user.id; 
            
            // Security: Strip out roles and permissions so users cannot escalate privileges
            delete req.body.role_id;
            delete req.body.permissions;

            if (req.body.password) {
                const bcrypt = require('bcryptjs');
                req.body.password = await bcrypt.hash(req.body.password, 12);
                await userRepository.updatePassword(userId, req.body.password);
                delete req.body.password;
            }

            const updated = await userRepository.updateProfile(userId, req.body);
            if (!updated) return next(new AppError('No user found', 404));

            const user = await userRepository.findById(userId);
            delete user.password; // Never send back hashed password
            
            sendSuccess(res, 'Profile updated successfully', user);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new UserController();
