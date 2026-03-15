const { pool } = require('../config/db.config');

class RentalRepository {
    async findAll(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT r.*, rc.name as category_name 
            FROM rentals r 
            LEFT JOIN rental_categories rc ON r.rental_category_id = rc.id 
            WHERE 1=1`;
        let countQuery = 'SELECT COUNT(*) as total FROM rentals WHERE 1=1';
        const params = [];

        if (filters.rental_category_id) {
            query += ' AND r.rental_category_id = ?';
            countQuery += ' AND rental_category_id = ?';
            params.push(filters.rental_category_id);
        }

        if (filters.featured !== undefined) {
            query += ' AND featured = ?';
            countQuery += ' AND featured = ?';
            params.push(filters.featured ? 1 : 0);
        }

        if (filters.search) {
            query += ' AND (name LIKE ? OR description LIKE ?)';
            countQuery += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        // Get total count
        const [[{ total }]] = await pool.execute(countQuery, params);

        // Add pagination to query
        query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
        const queryParams = [...params, limit.toString(), offset.toString()];

        const [rows] = await pool.execute(query, queryParams);
        
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
        const [rows] = await pool.execute(
            `SELECT r.*, rc.name as category_name 
             FROM rentals r 
             LEFT JOIN rental_categories rc ON r.rental_category_id = rc.id 
             WHERE r.id = ?`,
            [id]
        );
        return rows[0];
    }

    async create(rentalData) {
        const { rental_category_id, name, image, mobile, description, price_per_day, featured = false } = rentalData;
        const [result] = await pool.execute(
            'INSERT INTO rentals (rental_category_id, name, image, mobile, description, price_per_day, featured) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [rental_category_id, name, image, mobile, description, price_per_day, featured ? 1 : 0]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['rental_category_id', 'name', 'image', 'mobile', 'description', 'price_per_day', 'status', 'featured'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'featured' ? (value ? 1 : 0) : value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE rentals SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM rentals WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    // Rental Bookings
    async createBooking(bookingData) {
        const { booking_no, user_id, rental_id, duration_days, amount, contact_mobile, notes, payment_method } = bookingData;
        const [result] = await pool.execute(
            'INSERT INTO rental_bookings (booking_no, user_id, rental_id, duration_days, amount, contact_mobile, notes, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [booking_no, user_id, rental_id, duration_days, amount, contact_mobile, notes, payment_method]
        );
        return result.insertId;
    }

    async findBookingById(id) {
        const [rows] = await pool.execute(
            'SELECT rb.*, r.name as rental_name, u.name as user_name FROM rental_bookings rb JOIN rentals r ON rb.rental_id = r.id JOIN users u ON rb.user_id = u.id WHERE rb.id = ?',
            [id]
        );
        return rows[0];
    }
}

module.exports = new RentalRepository();
