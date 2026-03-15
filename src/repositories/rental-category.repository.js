const { pool } = require('../config/db.config');

class RentalCategoryRepository {
    async findAll(page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        
        // Get total count
        const [[{ total }]] = await pool.execute('SELECT COUNT(*) as total FROM rental_categories');
        
        // Get paginated data
        const [rows] = await pool.execute(
            'SELECT * FROM rental_categories ORDER BY updated_at DESC LIMIT ? OFFSET ?',
            [limit.toString(), offset.toString()]
        );
        
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
        const [rows] = await pool.execute('SELECT * FROM rental_categories WHERE id = ?', [id]);
        return rows[0];
    }

    async create(categoryData) {
        const { name, icon } = categoryData;
        const [result] = await pool.execute(
            'INSERT INTO rental_categories (name, icon) VALUES (?, ?)',
            [name, icon]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['name', 'icon', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE rental_categories SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM rental_categories WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new RentalCategoryRepository();
