const homeSectionRepository = require('../repositories/home-section.repository');
const { sendSuccess, sendError } = require('../utils/response.helper');

class HomeSectionController {
    async getAll(req, res) {
        try {
            const sections = await homeSectionRepository.findAll();
            sendSuccess(res, 'Home sections retrieved', sections);
        } catch (error) {
            sendError(res, error.message);
        }
    }

    async getActive(req, res) {
        try {
            const sections = await homeSectionRepository.findActiveWithItems();
            sendSuccess(res, 'Active home sections retrieved', sections);
        } catch (error) {
            sendError(res, error.message);
        }
    }

    async getById(req, res) {
        try {
            const section = await homeSectionRepository.findById(req.params.id);
            if (!section) return sendError(res, 'Section not found', 404);
            
            // Also fetch items for this section
            const sectionsWithItems = await homeSectionRepository.findActiveWithItems();
            const fullSection = sectionsWithItems.find(s => s.id == req.params.id) || section;
            
            sendSuccess(res, 'Home section retrieved', fullSection);
        } catch (error) {
            sendError(res, error.message);
        }
    }

    async create(req, res) {
        try {
            const id = await homeSectionRepository.create(req.body);
            sendSuccess(res, 'Home section created successfully', { id });
        } catch (error) {
            sendError(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const { name, title, status, order_index, items } = req.body;
            await homeSectionRepository.updateSection(req.params.id, { name, title, status, order_index });
            
            if (items) {
                await homeSectionRepository.updateItems(req.params.id, items);
            }
            
            sendSuccess(res, 'Home section updated successfully');
        } catch (error) {
            sendError(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const deleted = await homeSectionRepository.delete(req.params.id);
            if (!deleted) return sendError(res, 'Section not found', 404);
            sendSuccess(res, 'Home section deleted successfully');
        } catch (error) {
            sendError(res, error.message);
        }
    }
}

module.exports = new HomeSectionController();
