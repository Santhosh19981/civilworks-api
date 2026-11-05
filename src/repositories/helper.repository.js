const { pool } = require('../config/db.config');

class HelperRepository {
    async findAll(filters = {}) {
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 10;
        const offset = (page - 1) * limit;

        let query = `
            FROM helpers h 
            LEFT JOIN main_categories mc ON h.main_category_id = mc.id 
            LEFT JOIN categories c ON h.category_id = c.id 
            LEFT JOIN subcategories s ON h.subcategory_id = s.id 
            WHERE 1=1
        `;
        const params = [];

        if (filters.main_category_id) {
            query += ' AND (h.main_category_id = ? OR EXISTS (SELECT 1 FROM category_main_categories cmc WHERE cmc.category_id = h.category_id AND cmc.main_category_id = ?))';
            params.push(filters.main_category_id, filters.main_category_id);
        }

        if (filters.category_id) {
            query += ' AND h.category_id = ?';
            params.push(filters.category_id);
        }

        if (filters.subcategory_id) {
            query += ' AND h.subcategory_id = ?';
            params.push(filters.subcategory_id);
        }

        if (filters.status) {
            query += ' AND h.status = ?';
            params.push(filters.status);
        }

        if (filters.search) {
            query += ' AND (h.service_name LIKE ? OR h.description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        // Get total count
        const [countRows] = await pool.execute(`SELECT COUNT(*) as total ${query}`, params);
        const total = countRows[0].total;

        // Get data
        const [rows] = await pool.query(
            `SELECT h.*, mc.name as main_category_name, c.name as category_name, s.name as subcategory_name ${query} ORDER BY h.updated_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
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
        const [rows] = await pool.execute(`
            SELECT h.*, mc.name as main_category_name, c.name as category_name, s.name as subcategory_name 
            FROM helpers h 
            LEFT JOIN main_categories mc ON h.main_category_id = mc.id 
            LEFT JOIN categories c ON h.category_id = c.id 
            LEFT JOIN subcategories s ON h.subcategory_id = s.id 
            WHERE h.id = ?
        `, [id]);
        return rows[0];
    }

    async create(helperData) {
        const service_name = helperData.service_name || helperData.serviceName || helperData.name || '';
        const image = helperData.image || null;
        const mobile = helperData.mobile || null;
        const description = helperData.description || '';
        const price_per_day = helperData.price_per_day || helperData.pricePerDay || 0;
        const main_category_id = helperData.main_category_id || helperData.mainCategoryId || null;
        const category_id = helperData.category_id || helperData.categoryId || null;
        const subcategory_id = helperData.subcategory_id || helperData.subcategoryId || null;
        const status = helperData.status || 'Active';

        const [result] = await pool.execute(
            'INSERT INTO helpers (service_name, image, mobile, description, price_per_day, main_category_id, category_id, subcategory_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [service_name, image, mobile, description, price_per_day, main_category_id, category_id, subcategory_id, status]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const normalized = {};
        if (updateData.service_name !== undefined || updateData.serviceName !== undefined || updateData.name !== undefined) {
            normalized.service_name = updateData.service_name || updateData.serviceName || updateData.name;
        }
        if (updateData.image !== undefined) normalized.image = updateData.image;
        if (updateData.mobile !== undefined) normalized.mobile = updateData.mobile;
        if (updateData.description !== undefined) normalized.description = updateData.description;
        if (updateData.price_per_day !== undefined || updateData.pricePerDay !== undefined) {
            normalized.price_per_day = updateData.price_per_day !== undefined ? updateData.price_per_day : updateData.pricePerDay;
        }
        if (updateData.main_category_id !== undefined || updateData.mainCategoryId !== undefined) {
            normalized.main_category_id = updateData.main_category_id !== undefined ? updateData.main_category_id : updateData.mainCategoryId;
        }
        if (updateData.category_id !== undefined || updateData.categoryId !== undefined) {
            normalized.category_id = updateData.category_id !== undefined ? updateData.category_id : updateData.categoryId;
        }
        if (updateData.subcategory_id !== undefined || updateData.subcategoryId !== undefined) {
            normalized.subcategory_id = updateData.subcategory_id !== undefined ? updateData.subcategory_id : updateData.subcategoryId;
        }
        if (updateData.status !== undefined) normalized.status = updateData.status;

        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(normalized)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE helpers SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM helpers WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    // Helper Bookings
    async createBooking(bookingData) {
        const { booking_no, user_id, helper_id, members_count, booking_date, total_amount, contact_mobile, payment_method } = bookingData;
        const [result] = await pool.execute(
            'INSERT INTO helper_bookings (booking_no, user_id, helper_id, members_count, booking_date, total_amount, contact_mobile, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [booking_no, user_id, helper_id, members_count, booking_date, total_amount, contact_mobile, payment_method]
        );
        return result.insertId;
    }

    async findBookingById(id) {
        const [rows] = await pool.execute(
            'SELECT hb.*, h.service_name, u.name as user_name FROM helper_bookings hb JOIN helpers h ON hb.helper_id = h.id JOIN users u ON hb.user_id = u.id WHERE hb.id = ?',
            [id]
        );
        return rows[0];
    }
}

module.exports = new HelperRepository();
