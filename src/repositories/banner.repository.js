const { pool } = require('../config/db.config');

class BannerRepository {
    async findAll() {
        const [rows] = await pool.execute('SELECT * FROM banners WHERE status = "active" ORDER BY sort_order ASC');
        return rows;
    }

    async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM banners WHERE id = ?', [id]);
        return rows[0];
    }

    async create(bannerData) {
        const { title, image, type, redirect_type, redirect_id, sort_order = 0 } = bannerData;
        const [result] = await pool.execute(
            'INSERT INTO banners (title, image, type, redirect_type, redirect_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
            [title, image, type, redirect_type, redirect_id, sort_order]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['title', 'image', 'type', 'redirect_type', 'redirect_id', 'status', 'sort_order'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE banners SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM banners WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new BannerRepository();
