const { pool } = require('../config/db.config');

class AddressRepository {
    async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [userId]
        );
        return rows;
    }

    async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM addresses WHERE id = ?', [id]);
        return rows[0];
    }

    async create(addressData) {
        const { user_id, full_name, mobile, address_line_1, address_line_2, city, state, pincode, landmark, is_default = false } = addressData;

        // If this is default, unset other defaults
        if (is_default) {
            await pool.execute('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [user_id]);
        }

        const [result] = await pool.execute(
            'INSERT INTO addresses (user_id, full_name, mobile, address_line_1, address_line_2, city, state, pincode, landmark, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [user_id, full_name, mobile, address_line_1, address_line_2, city, state, pincode, landmark, is_default ? 1 : 0]
        );
        return result.insertId;
    }

    async update(id, userId, updateData) {
        const fields = [];
        const values = [];

        if (updateData.is_default) {
            await pool.execute('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
        }

        for (const [key, value] of Object.entries(updateData)) {
            if (['full_name', 'mobile', 'address_line_1', 'address_line_2', 'city', 'state', 'pincode', 'landmark', 'is_default'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'is_default' ? (value ? 1 : 0) : value);
            }
        }

        if (fields.length === 0) return false;
        values.push(id, userId);
        const [result] = await pool.execute(
            `UPDATE addresses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id, userId) {
        const [result] = await pool.execute('DELETE FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
        return result.affectedRows > 0;
    }
}

module.exports = new AddressRepository();
