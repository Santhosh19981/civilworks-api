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
            const { mobile, password, otp } = req.body;
            const credential = password || otp;

            if (!mobile || !credential) {
                return next(new AppError('Please provide mobile and password or OTP', 400));
            }

            const { user, token } = await authService.login(mobile, credential, ['customer']);

            sendSuccess(res, 'Login successful', { user, token });
        } catch (error) {
            next(error);
        }
    };

    /**
     * Send Mobile OTP
     */
    sendOtp = async (req, res, next) => {
        try {
            const { mobile } = req.body;

            if (!mobile || String(mobile).trim().length < 10) {
                return next(new AppError('Please provide a valid 10-digit mobile number', 400));
            }

            const result = await authService.sendOtp(String(mobile).trim());

            sendSuccess(res, 'OTP sent successfully', result);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Verify Mobile OTP and Sign In
     */
    verifyOtp = async (req, res, next) => {
        try {
            const { mobile, otp } = req.body;

            if (!mobile || !otp) {
                return next(new AppError('Please provide mobile number and 4-digit OTP', 400));
            }

            const { user, token } = await authService.verifyOtp(String(mobile).trim(), String(otp).trim());

            sendSuccess(res, 'OTP verified successfully. Login successful.', { user, token });
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
        sendSuccess(res, 'Logged out successfully');
    };

    /**
     * Get Current User
     */
    getMe = async (req, res, next) => {
        const safeUser = { ...req.user };
        delete safeUser.password;
        sendSuccess(res, 'User data retrieved', { user: safeUser });
    };
}

module.exports = new AuthController();

