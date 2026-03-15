const helperRepository = require('../repositories/helper.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class HelperController {
    /**
     * Get All Helpers
     */
    getAll = async (req, res, next) => {
        try {
            const { search, page, limit, status } = req.query;
            const result = await helperRepository.findAll({ search, page, limit, status });
            sendSuccess(res, 'Helpers retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Helper By ID
     */
    getById = async (req, res, next) => {
        try {
            const helper = await helperRepository.findById(req.params.id);
            if (!helper) return next(new AppError('Helper service not found', 404));
            sendSuccess(res, 'Helper retrieved successfully', helper);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Helper Booking (Customer)
     */
    createBooking = async (req, res, next) => {
        try {
            const { helper_id, members_count, booking_date, contact_mobile, payment_method } = req.body;
            if (!helper_id || !members_count || !booking_date || !contact_mobile || !payment_method) {
                return next(new AppError('Please provide all required fields', 400));
            }

            const helper = await helperRepository.findById(helper_id);
            if (!helper) return next(new AppError('Helper service not found', 404));

            const total_amount = helper.price_per_day * members_count;
            const booking_no = `HELP-${Date.now()}`;

            const bookingId = await helperRepository.createBooking({
                booking_no,
                user_id: req.user.id,
                helper_id,
                members_count,
                booking_date,
                total_amount,
                contact_mobile,
                payment_method
            });

            const booking = await helperRepository.findBookingById(bookingId);
            sendSuccess(res, 'Helper booked successfully', booking, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Create Helper
     */
    createAdmin = async (req, res, next) => {
        try {
            const helperId = await helperRepository.create(req.body);
            const helper = await helperRepository.findById(helperId);
            sendSuccess(res, 'Helper service created successfully', helper, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Update Helper
     */
    updateAdmin = async (req, res, next) => {
        try {
            const success = await helperRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Helper not found or no changes made', 404));
            const helper = await helperRepository.findById(req.params.id);
            sendSuccess(res, 'Helper service updated successfully', helper);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Delete Helper
     */
    deleteAdmin = async (req, res, next) => {
        try {
            const success = await helperRepository.delete(req.params.id);
            if (!success) return next(new AppError('Helper not found', 404));
            sendSuccess(res, 'Helper service deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new HelperController();
