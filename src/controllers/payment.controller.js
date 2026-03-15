const paymentRepository = require('../repositories/payment.repository');
const orderRepository = require('../repositories/order.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class PaymentController {
    /**
     * Initiate Payment (Customer)
     */
    initiate = async (req, res, next) => {
        try {
            const { reference_type, reference_id, amount, payment_method } = req.body;
            if (!reference_type || !reference_id || !amount) {
                return next(new AppError('Reference and amount are required', 400));
            }

            const transaction_id = `TXN-${Date.now()}`;

            const paymentId = await paymentRepository.create({
                transaction_id,
                reference_type,
                reference_id,
                user_id: req.user.id,
                payment_method,
                amount,
                status: payment_method === 'cod' ? 'pending' : 'pending'
            });

            const payment = await paymentRepository.findById(paymentId);
            sendSuccess(res, 'Payment initiated', payment);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Verify Payment (Customer)
     */
    verify = async (req, res, next) => {
        try {
            const { payment_id, status, gateway_response } = req.body;
            if (!payment_id || !status) return next(new AppError('Payment ID and status are required', 400));

            const payment = await paymentRepository.findById(payment_id);
            if (!payment) return next(new AppError('Payment not found', 404));

            await paymentRepository.updateStatus(payment_id, status, gateway_response);

            // If payment successful, update the reference order/booking
            if (status === 'paid') {
                if (payment.reference_type === 'order') {
                    await orderRepository.updateStatus(payment.reference_id, 'confirmed');
                }
                // Handle rentals/helpers status update if needed
            }

            sendSuccess(res, 'Payment verified successfully');
        } catch (error) {
            next(error);
        }
    };

    /**
     * Admin: Get All Payments
     */
    getAllAdmin = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const filters = { ...req.query };
            delete filters.page;
            delete filters.limit;

            const result = await paymentRepository.findAll(filters, page, limit);
            sendSuccess(res, 'Payments retrieved successfully', result.data, 200, result.pagination);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new PaymentController();
