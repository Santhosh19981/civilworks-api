const { pool } = require('../config/db.config');

class MainCategoryRepository {
    async findAll(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        let query = 'SELECT * FROM main_categories WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM main_categories WHERE 1=1';
        const params = [];

        if (filters.status) {
            query += ' AND status = ?';
            countQuery += ' AND status = ?';
            params.push(filters.status);
        }

        if (filters.search) {
            query += ' AND (name LIKE ? OR description LIKE ?)';
            countQuery += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        const [[{ total }]] = await pool.execute(countQuery, params);

        query += ' ORDER BY id ASC LIMIT ? OFFSET ?';
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
        const [rows] = await pool.execute('SELECT * FROM main_categories WHERE id = ?', [id]);
        return rows[0];
    }

    async findByName(name) {
        const [rows] = await pool.execute('SELECT * FROM main_categories WHERE name = ?', [name]);
        return rows[0];
    }

    async create(data) {
        const { name, description = null, image = null, status = 'active' } = data;
        const [result] = await pool.execute(
            'INSERT INTO main_categories (name, description, image, status) VALUES (?, ?, ?, ?)',
            [name, description, image, status]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['name', 'description', 'image', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE main_categories SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async countDependentCategories(id) {
        const [[{ count }]] = await pool.execute(
            'SELECT COUNT(*) as count FROM categories WHERE main_category_id = ?',
            [id]
        );
        return count;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM main_categories WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new MainCategoryRepository();
