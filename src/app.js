const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./config/app.config');
const { errorHandler, AppError } = require('./middlewares/error.middleware');
const healthRoutes = require('./routes/health.routes');

const app = express();

// Enable CORS
app.use(cors({
    origin: [
        'https://civilworks.in', 
        'https://admin.civilworks.in',
        'https://qa.civilworks.in',
        'https://qa-admin.civilworks.in',
        'http://localhost:4200',
        'http://localhost:4201'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 200
}));

// CORS middleware already handles OPTIONS requests

// Set security HTTP headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "unsafe-none" }
}));

// Development logging
if (config.app.env === 'development') {
    app.use(morgan('dev'));
}

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/categories', require('./routes/category.routes'));
app.use('/api/v1/subcategories', require('./routes/subcategory.routes'));
app.use('/api/v1/upload', require('./routes/upload.routes'));
app.use('/api/v1/products', require('./routes/product.routes'));
app.use('/api/v1/rentals', require('./routes/rental.routes'));
app.use('/api/v1/rental-categories', require('./routes/rental-category.routes'));
app.use('/api/v1/helpers', require('./routes/helper.routes'));
app.use('/api/v1/helper-members', require('./routes/helper-member.routes'));
app.use('/api/v1/addresses', require('./routes/address.routes'));
app.use('/api/v1/cart', require('./routes/cart.routes'));
app.use('/api/v1/orders', require('./routes/order.routes'));
app.use('/api/v1/users', require('./routes/user.routes'));
app.use('/api/v1/employees', require('./routes/employee.routes'));
app.use('/api/v1/dashboard', require('./routes/dashboard.routes'));
app.use('/api/v1/home-services', require('./routes/home-service.routes'));
app.use('/api/v1/home-sections', require('./routes/home-section.routes'));
app.use('/api/v1', require('./routes/common.routes'));
app.use('/api/v1', healthRoutes);

// Handle undefined routes
app.all(/.*/, (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Centralized Error Handling
app.use(errorHandler);

module.exports = app;
