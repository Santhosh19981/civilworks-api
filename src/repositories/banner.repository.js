const { pool } = require('../config/db.config');

class BannerRepository {
    async findAll(filters = {}) {
        let query = `
            SELECT b.*, mc.name AS main_category_name 
            FROM banners b
            LEFT JOIN main_categories mc ON b.main_category_id = mc.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.main_category_id) {
            query += ' AND b.main_category_id = ?';
            params.push(Number(filters.main_category_id));
        }

        // If not admin requesting 'all', filter by active status
        if (!filters.all) {
            query += ' AND b.status = "active"';
        }

        query += ' ORDER BY b.sort_order ASC, b.id DESC';

        const [rows] = await pool.execute(query, params);
        return rows;
    }

    async findById(id) {
        const query = `
            SELECT b.*, mc.name AS main_category_name 
            FROM banners b
            LEFT JOIN main_categories mc ON b.main_category_id = mc.id
            WHERE b.id = ?
        `;
        const [rows] = await pool.execute(query, [id]);
        return rows[0];
    }

    async create(bannerData) {
        const {
            main_category_id = null,
            tag = null,
            title,
            subtitle = null,
            cta = 'Explore',
            cta_link = '/tabs/products',
            assurance_badge = '100% Quality Guaranteed',
            image,
            type = 'category',
            redirect_type = null,
            redirect_id = null,
            status = 'active',
            sort_order = 0
        } = bannerData;

        const [result] = await pool.execute(
            `INSERT INTO banners (
                main_category_id, tag, title, subtitle, cta, cta_link, 
                assurance_badge, image, type, redirect_type, redirect_id, status, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                main_category_id ? Number(main_category_id) : null,
                tag,
                title,
                subtitle,
                cta,
                cta_link,
                assurance_badge,
                image,
                type,
                redirect_type,
                redirect_id,
                status,
                Number(sort_order) || 0
            ]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const allowedFields = [
            'main_category_id', 'tag', 'title', 'subtitle', 'cta', 'cta_link',
            'assurance_badge', 'image', 'type', 'redirect_type', 'redirect_id', 'status', 'sort_order'
        ];

        const banner = await this.findById(id);
        if (!banner) return false;

        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                if (key === 'main_category_id') {
                    values.push(value ? Number(value) : null);
                } else if (key === 'sort_order') {
                    values.push(Number(value) || 0);
                } else {
                    values.push(value);
                }
            }
        }

        if (fields.length === 0) return true;
        values.push(id);

        await pool.execute(
            `UPDATE banners SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return true;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM banners WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new BannerRepository();
