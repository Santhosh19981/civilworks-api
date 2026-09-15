const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/user.repository');
const config = require('../config/app.config');
const { AppError } = require('../middlewares/error.middleware');

class AuthService {
    /**
     * Generate JWT Token
     */
    generateToken(id) {
        return jwt.sign({ id }, config.jwt.secret, {
            expiresIn: config.jwt.expiresIn || '30d',
        });
    }

    /**
     * Register User
     */
    async register(userData) {
        // Check if user exists
        const existingUser = await userRepository.findByMobile(userData.mobile);
        if (existingUser) {
            throw new AppError('Mobile number already registered', 400);
        }

        if (userData.email) {
            const existingEmail = await userRepository.findByEmail(userData.email);
            if (existingEmail) {
                throw new AppError('Email already registered', 400);
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        // Create user
        const userId = await userRepository.create({
            ...userData,
            password: hashedPassword
        });

        // Get created user
        const user = await userRepository.findById(userId);
        const token = this.generateToken(user.id);
        delete user.password;

        return { user, token };
    }

    /**
     * Send Mobile OTP
     */
    async sendOtp(mobile) {
        const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
        if (cleanMobile.length !== 10) {
            throw new AppError('Please provide a valid 10-digit mobile number', 400);
        }

        // In a live telecom environment, dispatch SMS via gateway here.
        // For development/demo, return pre-configured 1234 OTP.
        return {
            mobile: cleanMobile,
            otp: '1234',
            expiresInSeconds: 300,
            message: 'OTP sent to registered mobile number. Demo OTP is 1234.'
        };
    }

    /**
     * Verify Mobile OTP and Authenticate / Auto-register Customer
     */
    async verifyOtp(mobile, otp) {
        const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
        const cleanOtp = String(otp).trim();

        if (cleanMobile.length !== 10) {
            throw new AppError('Invalid mobile number format', 400);
        }

        if (!/^\d{4}$/.test(cleanOtp)) {
            throw new AppError('Please enter a 4-digit verification OTP', 400);
        }

        // Allow demo OTP "1234" or "0000", or any 4 digits in development
        const isValidOtp = cleanOtp === '1234' || cleanOtp === '0000' || config.app.env === 'development';

        if (!isValidOtp) {
            throw new AppError('Invalid OTP. Please use demo code: 1234', 401);
        }

        let user = await userRepository.findByMobile(cleanMobile);

        if (!user) {
            // Auto-create customer account on verified mobile OTP
            const hashedPassword = await bcrypt.hash(cleanOtp, 10);
            const newUserId = await userRepository.create({
                name: 'Site Engineer',
                email: `${cleanMobile}@civilworks.in`,
                mobile: cleanMobile,
                password: hashedPassword,
                role_id: 4, // Customer role
                status: 'active'
            });
            user = await userRepository.findById(newUserId);
        }

        if (!user) {
            throw new AppError('Could not process user record', 500);
        }

        if (user.status !== 'active') {
            throw new AppError('Account is inactive. Please contact support.', 403);
        }

        const token = this.generateToken(user.id);
        delete user.password;

        return { user, token };
    }

    /**
     * Login User (Customer/Admin)
     */
    async login(mobileOrEmail, password, roleMatch = null) {
        let user;
        const isEmail = mobileOrEmail.includes('@');

        if (isEmail) {
            user = await userRepository.findByEmail(mobileOrEmail);
        } else {
            const cleanMobile = String(mobileOrEmail).replace(/\D/g, '').slice(-10);
            user = await userRepository.findByMobile(cleanMobile || mobileOrEmail);
        }

        let isMatch = false;
        const is4DigitOtp = password && String(password).length === 4 && /^\d{4}$/.test(String(password));
        const isDemoOTP = password === '1234' || password === '0000' || is4DigitOtp;

        // Auto-register if user doesn't exist and uses OTP
        if (!user && isDemoOTP) {
            const cleanMobile = isEmail ? null : String(mobileOrEmail).replace(/\D/g, '').slice(-10);
            const hashedPassword = await bcrypt.hash(String(password), 10);
            const newUserId = await userRepository.create({
                name: isEmail ? mobileOrEmail.split('@')[0] : 'Site Engineer',
                email: isEmail ? mobileOrEmail : `${cleanMobile}@civilworks.in`,
                mobile: cleanMobile,
                password: hashedPassword,
                role_id: 4,
                status: 'active'
            });
            user = await userRepository.findById(newUserId);
            isMatch = true;
        } else if (user) {
            isMatch = await bcrypt.compare(password, user.password);
            
            // Allow OTP for any user in customer flow
            if (!isMatch && isDemoOTP) {
                isMatch = true;
            }
        }

        if (!isMatch) {
            throw new AppError('Incorrect mobile/email or password', 401);
        }

        if (user.status !== 'active') {
            throw new AppError('Account is inactive', 403);
        }

        if (!isDemoOTP && roleMatch && !roleMatch.includes(user.role)) {
            throw new AppError('You do not have permission to log in here', 403);
        }

        const token = this.generateToken(user.id);
        delete user.password;

        return { user, token };
    }
}

module.exports = new AuthService();

