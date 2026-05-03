const homeServiceRepository = require('../repositories/home-service.repository');
const logger = require('../utils/logger');

class HomeServiceController {
    async getAll(req, res) {
        try {
            const services = await homeServiceRepository.findAll();
            res.json({ success: true, data: services });
        } catch (error) {
            logger.error('Error fetching home services: %O', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    async getActive(req, res) {
        try {
            const services = await homeServiceRepository.findActive();
            res.json({ success: true, data: services });
        } catch (error) {
            logger.error('Error fetching active home services: %O', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    async getById(req, res) {
        try {
            const service = await homeServiceRepository.findById(req.params.id);
            if (!service) {
                return res.status(404).json({ success: false, message: 'Home service not found' });
            }
            res.json({ success: true, data: service });
        } catch (error) {
            logger.error('Error fetching home service by ID: %O', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    async create(req, res) {
        try {
            const id = await homeServiceRepository.create(req.body);
            res.status(201).json({ success: true, data: { id, ...req.body } });
        } catch (error) {
            logger.error('Error creating home service: %O', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    async update(req, res) {
        try {
            const updated = await homeServiceRepository.update(req.params.id, req.body);
            if (!updated) {
                return res.status(404).json({ success: false, message: 'Home service not found or no changes made' });
            }
            res.json({ success: true, message: 'Home service updated successfully' });
        } catch (error) {
            logger.error('Error updating home service: %O', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    async delete(req, res) {
        try {
            const deleted = await homeServiceRepository.delete(req.params.id);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Home service not found' });
            }
            res.json({ success: true, message: 'Home service deleted successfully' });
        } catch (error) {
            logger.error('Error deleting home service: %O', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }

    async reorder(req, res) {
        try {
            const { orders } = req.body;
            if (!orders || !Array.isArray(orders)) {
                return res.status(400).json({ success: false, message: 'Invalid orders data' });
            }
            await homeServiceRepository.reorder(orders);
            res.json({ success: true, message: 'Services reordered successfully' });
        } catch (error) {
            logger.error('Error reordering home services: %O', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
}

module.exports = new HomeServiceController();
