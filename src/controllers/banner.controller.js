const bannerRepository = require('../repositories/banner.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class BannerController {
    getAll = async (req, res, next) => {
        try {
            const banners = await bannerRepository.findAll();
            sendSuccess(res, 'Banners retrieved successfully', banners);
        } catch (error) {
            next(error);
        }
    };

    create = async (req, res, next) => {
        try {
            const bannerId = await bannerRepository.create(req.body);
            const banner = await bannerRepository.findById(bannerId);
            sendSuccess(res, 'Banner created successfully', banner, 201);
        } catch (error) {
            next(error);
        }
    };

    update = async (req, res, next) => {
        try {
            const success = await bannerRepository.update(req.params.id, req.body);
            if (!success) return next(new AppError('Banner not found', 404));
            const banner = await bannerRepository.findById(req.params.id);
            sendSuccess(res, 'Banner updated successfully', banner);
        } catch (error) {
            next(error);
        }
    };

    delete = async (req, res, next) => {
        try {
            const success = await bannerRepository.delete(req.params.id);
            if (!success) return next(new AppError('Banner not found', 404));
            sendSuccess(res, 'Banner deleted successfully');
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new BannerController();
