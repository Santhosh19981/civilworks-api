const { pool } = require('../config/db.config');

class SkillRepository {
    async findAll(page = 1, limit = 50, filters = {}) {
        const offset = (page - 1) * limit;
        let query = 'SELECT * FROM skills WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM skills WHERE 1=1';
        const params = [];

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
        const [rows] = await pool.execute('SELECT * FROM skills WHERE id = ?', [id]);
        return rows[0] || null;
    }

    async create(data) {
        const { name, image, status = 'active' } = data;
        const [result] = await pool.execute(
            'INSERT INTO skills (name, image, status) VALUES (?, ?, ?)',
            [name, image, status]
        );
        return result.insertId;
    }

    async update(id, data) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (['name', 'image', 'status'].includes(key) && value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return true;

        values.push(id);
        const [result] = await pool.execute(
            `UPDATE skills SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM skills WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new SkillRepository();
