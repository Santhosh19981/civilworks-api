const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class AuthController {
    /**
     * Customer Register
     */
    register = async (req, res, next) => {
        try {
            const { name, email, mobile, password } = req.body;

            if (!name || !mobile || !password) {
                return next(new AppError('Please provide name, mobile and password', 400));
            }

            const { user, token } = await authService.register({ name, email, mobile, password });

            sendSuccess(res, 'Registration successful', { user, token }, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Customer Login
     */
    login = async (req, res, next) => {
        try {
            const { mobile, password } = req.body;

            if (!mobile || !password) {
                return next(new AppError('Please provide mobile and password', 400));
            }

            const { user, token } = await authService.login(mobile, password, ['customer']);

            sendSuccess(res, 'Login successful', { user, token });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin Login
     */
    adminLogin = async (req, res, next) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return next(new AppError('Please provide email and password', 400));
            }

            const { user, token } = await authService.login(email, password, ['super_admin', 'admin', 'manager']);

            sendSuccess(res, 'Admin login successful', { user, token });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Logout
     */
    logout = async (req, res, next) => {
        // Since we use JWT, logout is primarily handled on the frontend by removing the token
        // However, we can send a success response
        sendSuccess(res, 'Logged out successfully');
    };

    /**
     * Get Current User
     */
    getMe = async (req, res, next) => {
        sendSuccess(res, 'User data retrieved', { user: req.user });
    };
}

module.exports = new AuthController();
