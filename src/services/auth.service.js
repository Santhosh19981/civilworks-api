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
            expiresIn: config.jwt.expiresIn,
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

        return { user, token };
    }

    /**
     * Login User (Customer/Admin)
     */
    async login(mobileOrEmail, password, roleMatch = null) {
        let user;
        if (mobileOrEmail.includes('@')) {
            user = await userRepository.findByEmail(mobileOrEmail);
        } else {
            user = await userRepository.findByMobile(mobileOrEmail);
        }

        let isMatch = false;
        const isCustomer = roleMatch && roleMatch.includes('customer');

        // Auto-register if customer doesn't exist and uses demo OTP "1234"
        if (!user && isCustomer && password === '1234') {
            const hashedPassword = await bcrypt.hash(password, 10);
            const isEmail = mobileOrEmail.includes('@');
            const newUserId = await userRepository.create({
                name: isEmail ? mobileOrEmail.split('@')[0] : 'Customer',
                email: isEmail ? mobileOrEmail : null,
                mobile: isEmail ? null : mobileOrEmail,
                password: hashedPassword,
                role_id: 4
            });
            user = await userRepository.findById(newUserId);
            isMatch = true;
        } else if (user) {
            isMatch = await bcrypt.compare(password, user.password);
            
            // Allow demo OTP "1234" for existing customers
            if (!isMatch && isCustomer && password === '1234' && user.role === 'customer') {
                isMatch = true;
            }
        }

        if (!isMatch) {
            throw new AppError('Incorrect mobile/email or password', 401);
        }

        if (user.status !== 'active') {
            throw new AppError('Account is inactive', 403);
        }

        // Check role if specified (e.g. for admin login)
        if (roleMatch && !roleMatch.includes(user.role)) {
            throw new AppError('You do not have permission to log in here', 403);
        }

        const token = this.generateToken(user.id);

        // Remove password from output
        delete user.password;

        return { user, token };
    }
}

module.exports = new AuthService();
