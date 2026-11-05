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
            const targetRole = role || (req.baseUrl.includes('customers') ? 'customer' : undefined);
            const filters = { role: targetRole, search };
            
            const result = await userRepository.findAll(Number(page) || 1, Number(limit) || 10, filters);
            
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

            const targetMobile = req.body.mobile || req.body.phone;
            if (targetMobile) {
                const cleanMobile = String(targetMobile).replace(/\D/g, '').slice(-10);
                if (cleanMobile.length !== 10) {
                    return next(new AppError('Please provide a valid 10-digit mobile number', 400));
                }
                const existing = await userRepository.findByMobile(cleanMobile);
                if (existing && existing.id !== userId) {
                    return next(new AppError('This mobile number is already registered with another customer account.', 400));
                }
                req.body.mobile = cleanMobile;
            }

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
            
            sendSuccess(res, 'Profile updated successfully', { user });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Upgrade customer to Plus Membership
     */
    upgradeMembership = async (req, res, next) => {
        try {
            const userId = req.user.id;
            const { plan = 'annual_plus', payment_id, amount = 999 } = req.body;

            const { pool } = require('../config/db.config');
            await pool.execute(
                `UPDATE users 
                 SET is_plus_member = 1,
                     plus_membership_plan = ?,
                     plus_membership_expiry = DATE_ADD(NOW(), INTERVAL 1 YEAR),
                     updated_at = NOW()
                 WHERE id = ?`,
                [plan, userId]
            );

            const user = await userRepository.findById(userId);
            if (user) {
                delete user.password;
            }

            sendSuccess(res, 'Congratulations! Your Plus Membership has been activated successfully.', {
                user,
                membership: {
                    status: 'active',
                    plan,
                    payment_id: payment_id || ('RZP_DEMO_' + Date.now()),
                    amount,
                    expiry: user?.plus_membership_expiry
                }
            });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new UserController();
