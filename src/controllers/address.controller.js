const addressRepository = require('../repositories/address.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class AddressController {
    /**
     * Get All User Addresses
     */
    getAll = async (req, res, next) => {
        try {
            const addresses = await addressRepository.findByUserId(req.user.id);
            sendSuccess(res, 'Addresses retrieved successfully', addresses);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Create Address
     */
    create = async (req, res, next) => {
        try {
            const addressId = await addressRepository.create({
                ...req.body,
                user_id: req.user.id
            });
            const address = await addressRepository.findById(addressId);
            sendSuccess(res, 'Address created successfully', address, 201);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Update Address
     */
    update = async (req, res, next) => {
        try {
            const success = await addressRepository.update(req.params.id, req.user.id, req.body);
            if (!success) return next(new AppError('Address not found', 404));
            const address = await addressRepository.findById(req.params.id);
            sendSuccess(res, 'Address updated successfully', address);
        } catch (error) {
            next(error);
        }
    };

    /**
     * Delete Address
     */
    delete = async (req, res, next) => {
        try {
            const success = await addressRepository.delete(req.params.id, req.user.id);
            if (!success) return next(new AppError('Address not found', 404));
            sendSuccess(res, 'Address deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new AddressController();
