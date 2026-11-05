const jwt = require('jsonwebtoken');
const config = require('../config/app.config');
const { sendError } = require('../utils/response.helper');
const { AppError } = require('./error.middleware');
const { pool } = require('../config/db.config');

/**
 * JWT Auth Middleware
 */
const protect = async (req, res, next) => {
    try {
        // 1) Getting token and check if it's there
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return next(new AppError('You are not logged in! Please log in to get access.', 401));
        }

        // 2) Verification token
        const decoded = jwt.verify(token, config.jwt.secret);

        // Check if token belongs to a vendor partner
        if (decoded.role === 'vendor' || decoded.vendor_id) {
            const vendorId = decoded.vendor_id || decoded.id;
            const [vendors] = await pool.execute(
                'SELECT * FROM vendors WHERE id = ?',
                [vendorId]
            );

            if (vendors.length === 0) {
                return next(new AppError('The vendor belonging to this token no longer exists.', 401));
            }

            const currentVendor = vendors[0];

            if (currentVendor.status !== 'active') {
                return next(new AppError('Your vendor account is inactive. Please contact support.', 403));
            }

            req.user = {
                id: currentVendor.id,
                vendor_id: currentVendor.id,
                name: currentVendor.name,
                mobile: currentVendor.mobile,
                email: currentVendor.email,
                role: 'vendor',
                status: currentVendor.status
            };
            return next();
        }

        // 3) Check if user still exists
        const [users] = await pool.execute(
            'SELECT u.*, r.name as role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return next(new AppError('The user belonging to this token no longer exists.', 401));
        }

        const currentUser = users[0];

        // 4) Check if user is active
        if (currentUser.status !== 'active') {
            return next(new AppError('Your account is inactive. Please contact support.', 403));
        }

        // GRANT ACCESS TO PROTECTED ROUTE
        req.user = currentUser;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid token. Please log in again!', 401));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Your token has expired! Please log in again.', 401));
        }
        next(error);
    }
};

/**
 * Role Based Access Middleware
 */
const restrictTo = (...roles) => {
    return (req, res, next) => {
        let isAuthorized = roles.includes(req.user.role);
        
        // Temporarily allow employees to test customer flows
        if (!isAuthorized && roles.includes('customer') && ['manager', 'admin', 'super_admin'].includes(req.user.role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return next(new AppError('You do not have permission to perform this action', 403));
        }
        next();
    };
};

/**
 * Granular Permission Middleware
 */
const checkPermission = (...moduleNames) => {
    return (req, res, next) => {
        // Super admins and admins always have access
        if (req.user.role === 'super_admin' || req.user.role === 'admin') {
            return next();
        }

        // Check if user has granular permissions
        if (!req.user.permissions) {
            return next(new AppError('You do not have permission to access this module', 403));
        }

        const userPermissions = req.user.permissions.split(',').map(p => p.trim());
        const hasAccess = moduleNames.some(m => userPermissions.includes(m) || userPermissions.includes('all'));
        if (!hasAccess) {
            return next(new AppError(`Access denied: You do not have permission for the ${moduleNames.join('/')} module`, 403));
        }

        next();
    };
};

module.exports = {
    protect,
    restrictTo,
    checkPermission
};
