const settingsRepository = require('../repositories/settings.repository');
const { sendSuccess } = require('../utils/response.helper');
const { AppError } = require('../middlewares/error.middleware');

class SettingsController {
    getSettings = async (req, res, next) => {
        try {
            const settings = await settingsRepository.getSettings();
            sendSuccess(res, 'Settings retrieved successfully', settings);
        } catch (error) {
            next(error);
        }
    };

    updateSettings = async (req, res, next) => {
        try {
            const settings = await settingsRepository.getSettings();
            const success = await settingsRepository.updateSettings(settings.id, req.body);
            if (!success) return next(new AppError('Failed to update settings', 400));

            const updated = await settingsRepository.getSettings();
            sendSuccess(res, 'Settings updated successfully', updated);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = new SettingsController();
