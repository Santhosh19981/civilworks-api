const { pool } = require('../config/db.config');

class HomeServiceRepository {
    async findAll() {
        const [rows] = await pool.query(
            'SELECT * FROM home_services ORDER BY display_order ASC, created_at DESC'
        );
        return rows;
    }

    async findActive() {
        const [rows] = await pool.query(
            'SELECT * FROM home_services WHERE status = "active" ORDER BY display_order ASC, created_at DESC'
        );
        return rows;
    }

    async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM home_services WHERE id = ?', [id]);
        return rows[0];
    }

    async create(data) {
        const { type, title, subtitle, icon, related_ids, display_order, status } = data;
        const [result] = await pool.execute(
            'INSERT INTO home_services (type, title, subtitle, icon, related_ids, display_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [type, title, subtitle, icon, related_ids || '', display_order || 0, status || 'active']
        );
        return result.insertId;
    }

    async update(id, data) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (['type', 'title', 'subtitle', 'icon', 'related_ids', 'display_order', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE home_services SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM home_services WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    async reorder(idOrderMap) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const { id, order } of idOrderMap) {
                await connection.execute(
                    'UPDATE home_services SET display_order = ? WHERE id = ?',
                    [order, id]
                );
            }
            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = new HomeServiceRepository();
