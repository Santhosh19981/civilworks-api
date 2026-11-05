const { pool } = require('../config/db.config');

class SubcategoryRepository {
    async findAll(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT s.*, c.name as category_name, c.main_category_id, mc.name as main_category_name 
            FROM subcategories s 
            JOIN categories c ON s.category_id = c.id 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id 
            WHERE 1=1
        `;
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM subcategories s 
            JOIN categories c ON s.category_id = c.id 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id 
            WHERE 1=1
        `;
        const params = [];

        if (filters.category_id) {
            query += ' AND s.category_id = ?';
            countQuery += ' AND s.category_id = ?';
            params.push(filters.category_id);
        }

        if (filters.main_category_id) {
            const matchCond = ' AND (c.main_category_id = ? OR EXISTS (SELECT 1 FROM category_main_categories cmc WHERE cmc.category_id = c.id AND cmc.main_category_id = ?))';
            query += matchCond;
            countQuery += matchCond;
            params.push(filters.main_category_id, filters.main_category_id);
        }

        if (filters.status) {
            query += ' AND s.status = ?';
            countQuery += ' AND s.status = ?';
            params.push(filters.status);
        }

        if (filters.type) {
            query += ' AND s.type = ?';
            countQuery += ' AND s.type = ?';
            params.push(filters.type);
        }

        if (filters.search) {
            query += ' AND (s.name LIKE ? OR s.description LIKE ? OR c.name LIKE ? OR mc.name LIKE ?)';
            countQuery += ' AND (s.name LIKE ? OR s.description LIKE ? OR c.name LIKE ? OR mc.name LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
        }

        const [[{ total }]] = await pool.execute(countQuery, params);

        query += ' ORDER BY s.id ASC LIMIT ? OFFSET ?';
        const [rows] = await pool.execute(query, [...params, limit.toString(), offset.toString()]);

        return {
            data: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async findById(id) {
        const [rows] = await pool.execute(`
            SELECT s.*, c.name as category_name, c.main_category_id, mc.name as main_category_name 
            FROM subcategories s 
            JOIN categories c ON s.category_id = c.id 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id 
            WHERE s.id = ?
        `, [id]);
        return rows[0];
    }

    async create(subcategoryData) {
        const {
            category_id,
            name,
            image = null,
            description = null,
            type = 'selling',
            measurement_type = 'weight',
            status = 'active',
            is_editable_order = 0
        } = subcategoryData;

        const [result] = await pool.execute(
            'INSERT INTO subcategories (category_id, name, image, description, type, measurement_type, status, is_editable_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [category_id, name, image, description, type, measurement_type, status, is_editable_order ? 1 : 0]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['category_id', 'name', 'image', 'description', 'type', 'measurement_type', 'status', 'is_editable_order'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'is_editable_order' ? (value ? 1 : 0) : value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE subcategories SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async countDependentProducts(id) {
        const [[{ count }]] = await pool.execute(
            'SELECT COUNT(*) as count FROM products WHERE subcategory_id = ?',
            [id]
        );
        return count;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM subcategories WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new SubcategoryRepository();
