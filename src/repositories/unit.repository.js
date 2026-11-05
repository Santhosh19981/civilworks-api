const { pool } = require('../config/db.config');

class UnitRepository {
    async findAll(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        let query = 'SELECT * FROM units WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM units WHERE 1=1';
        const params = [];

        if (filters.unit_category) {
            query += ' AND unit_category = ?';
            countQuery += ' AND unit_category = ?';
            params.push(filters.unit_category);
        }

        if (filters.status) {
            query += ' AND status = ?';
            countQuery += ' AND status = ?';
            params.push(filters.status);
        }

        if (filters.search) {
            query += ' AND name LIKE ?';
            countQuery += ' AND name LIKE ?';
            params.push(`%${filters.search}%`);
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
        const [rows] = await pool.execute('SELECT * FROM units WHERE id = ?', [id]);
        return rows[0];
    }

    async create(data) {
        const { name, unit_category, status = 'active' } = data;
        const [result] = await pool.execute(
            'INSERT INTO units (name, unit_category, status) VALUES (?, ?, ?)',
            [name, unit_category, status]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['name', 'unit_category', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE units SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async countDependentProducts(id) {
        const [[{ count }]] = await pool.execute(
            'SELECT COUNT(*) as count FROM products WHERE unit_id = ?',
            [id]
        );
        return count;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM units WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new UnitRepository();
