const rentalRepository = require('../repositories/rental.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class RentalController {
    /**
     * Get All Rentals
     */
    getAll = async (req, res, next) => {
        try {
            const { featured, search, page, limit } = req.query;
            const filters = {
                featured: featured !== undefined ? featured === 'true' : undefined,
                search
            };
            
            const p = parseInt(page) || 1;
            const l = parseInt(limit) || 10;
            
            const result = await rentalRepository.findAll(filters, p, l);
            sendSuccess(res, 'Rentals retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Get Rental By ID
     */
    getById = async (req, res, next) => {
        try {
            const rental = await rentalRepository.findById(req.params.id);
            if (!rental) return next(new AppError('Rental item not found', 404));
            sendSuccess(res, 'Rental retrieved successfully', rental);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Rental Booking (Customer)
     */
    createBooking = async (req, res, next) => {
        try {
            const { rental_id, duration_days, contact_mobile, notes, payment_method } = req.body;
            if (!rental_id || !duration_days || !contact_mobile || !payment_method) {
                return next(new AppError('Please provide all required fields', 400));
            }

            const rental = await rentalRepository.findById(rental_id);
            if (!rental) return next(new AppError('Rental item not found', 404));

            const amount = rental.price_per_day * duration_days;
            const booking_no = `RENT-${Date.now()}`;

            const bookingId = await rentalRepository.createBooking({
                booking_no,
                user_id: req.user.id,
                rental_id,
                duration_days,
                amount,
                contact_mobile,
                notes,
                payment_method
            });

            const booking = await rentalRepository.findBookingById(bookingId);
            sendSuccess(res, 'Rental booking placed successfully', booking, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Create Rental
     */
    createAdmin = async (req, res, next) => {
        try {
            const rentalId = await rentalRepository.create(req.body);
            const rental = await rentalRepository.findById(rentalId);
            sendSuccess(res, 'Rental created successfully', rental, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Update Rental
     */
    updateAdmin = async (req, res, next) => {
        try {
            const success = await rentalRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Rental not found or no changes made', 404));
            const rental = await rentalRepository.findById(req.params.id);
            sendSuccess(res, 'Rental updated successfully', rental);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Delete Rental
     */
    deleteAdmin = async (req, res, next) => {
        try {
            const success = await rentalRepository.delete(req.params.id);
            if (!success) return next(new AppError('Rental not found', 404));
            sendSuccess(res, 'Rental deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new RentalController();
