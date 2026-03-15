const express = require('express');
const router = express.Router();
const subcategoryController = require('../controllers/subcategory.controller');

router.get('/', subcategoryController.getAll);
router.get('/:id', subcategoryController.getById);

// Admin Routes (Add authentication middleware if needed later)
router.post('/admin', subcategoryController.create);
router.put('/admin/:id', subcategoryController.update);
router.delete('/admin/:id', subcategoryController.delete);

module.exports = router;
