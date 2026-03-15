const { pool } = require('../config/db.config');

class HelperRepository {
    async findAll(filters = {}) {
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 10;
        const offset = (page - 1) * limit;

        let query = 'FROM helpers WHERE 1=1';
        const params = [];

        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        } else {
            // query += ' AND status = "active"'; // Removed strict active filter for admin visibility unless specified
        }

        if (filters.search) {
            query += ' AND (service_name LIKE ? OR description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        // Get total count
        const [countRows] = await pool.execute(`SELECT COUNT(*) as total ${query}`, params);
        const total = countRows[0].total;

        // Get data
        const [rows] = await pool.query(
            `SELECT * ${query} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
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
        const [rows] = await pool.execute('SELECT * FROM helpers WHERE id = ?', [id]);
        return rows[0];
    }

    async create(helperData) {
        const { service_name, image, mobile, description, price_per_day } = helperData;
        const [result] = await pool.execute(
            'INSERT INTO helpers (service_name, image, mobile, description, price_per_day) VALUES (?, ?, ?, ?, ?)',
            [service_name, image, mobile, description, price_per_day]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['service_name', 'image', 'mobile', 'description', 'price_per_day', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
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
