const vendorRepository = require('../repositories/vendor.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class VendorController {
    /**
     * Get All Vendors (supports ?subcategory_id=... &status=...)
     */
    getAll = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const filters = {};

            if (req.query.subcategory_id) {
                filters.subcategory_id = req.query.subcategory_id;
            }
            if (req.query.status) {
                filters.status = req.query.status;
            } else if (!req.baseUrl.includes('admin') && !req.query.all) {
                filters.status = 'active';
            }
            if (req.query.search) {
                filters.search = req.query.search;
            }

            const result = await vendorRepository.findAll(page, limit, filters);
            sendSuccess(res, 'Vendors retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Vendor By ID
     */
    getById = async (req, res, next) => {
        try {
            const vendor = await vendorRepository.findById(req.params.id);
            if (!vendor) {
                return next(new AppError('Vendor not found', 404));
            }
            sendSuccess(res, 'Vendor retrieved successfully', vendor);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Vendor (Admin)
     * Fields: name (req), mobile (req), email (opt), services (multi-select subcategories array)
     */
    create = async (req, res, next) => {
        try {
            const { name, mobile, email, image, status, services } = req.body;
            if (!name || !name.trim()) {
                return next(new AppError('Vendor name is required', 400));
            }
            if (!mobile || !mobile.trim()) {
                return next(new AppError('Mobile number is required', 400));
            }

            const serviceIds = Array.isArray(services) 
                ? services.map(s => typeof s === 'object' ? s.id : s).filter(Boolean)
                : [];

            const vendorId = await vendorRepository.create({
                name: name.trim(),
                mobile: mobile.trim(),
                email: email ? email.trim() : null,
                image: image || null,
                status: status || 'active'
            }, serviceIds);

            const created = await vendorRepository.findById(vendorId);
            sendSuccess(res, 'Vendor created successfully', created, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Vendor (Admin)
     */
    update = async (req, res, next) => {
        try {
            const { name, mobile, services } = req.body;
            if (name !== undefined && !name.trim()) {
                return next(new AppError('Vendor name cannot be empty', 400));
            }
            if (mobile !== undefined && !mobile.trim()) {
                return next(new AppError('Mobile number cannot be empty', 400));
            }

            const existing = await vendorRepository.findById(req.params.id);
            if (!existing) {
                return next(new AppError('Vendor not found', 404));
            }

            let serviceIds = null;
            if (services !== undefined) {
                serviceIds = Array.isArray(services) 
                    ? services.map(s => typeof s === 'object' ? s.id : s).filter(Boolean)
                    : [];
            }

            await vendorRepository.update(req.params.id, req.body, serviceIds);
            const updated = await vendorRepository.findById(req.params.id);
            sendSuccess(res, 'Vendor updated successfully', updated);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Vendor (Admin)
     */
    delete = async (req, res, next) => {
        try {
            const vendor = await vendorRepository.findById(req.params.id);
            if (!vendor) {
                return next(new AppError('Vendor not found', 404));
            }

            const success = await vendorRepository.delete(req.params.id);
            if (!success) {
                return next(new AppError('Failed to delete vendor', 500));
            }

            sendSuccess(res, 'Vendor deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new VendorController();
