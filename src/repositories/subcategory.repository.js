const { pool } = require('../config/db.config');

class SubcategoryRepository {
    async findAll(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT s.*, c.name as category_name 
            FROM subcategories s 
            JOIN categories c ON s.category_id = c.id 
            WHERE 1=1`;
        const params = [];

        if (filters.category_id) {
            query += ' AND s.category_id = ?';
            params.push(filters.category_id);
        }

        // Get total count
        const [[{ total }]] = await pool.execute('SELECT COUNT(*) as total FROM subcategories');

        // Get paginated data
        query += ' ORDER BY s.updated_at DESC LIMIT ? OFFSET ?';
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
        const [rows] = await pool.execute(
            'SELECT s.*, c.name as category_name FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE s.id = ?', 
            [id]
        );
        return rows[0];
    }

    async create(subcategoryData) {
        const { category_id, name, status = 'active' } = subcategoryData;
        const [result] = await pool.execute(
            'INSERT INTO subcategories (category_id, name, status) VALUES (?, ?, ?)',
            [category_id, name, status]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['category_id', 'name', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
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

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM subcategories WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new SubcategoryRepository();
