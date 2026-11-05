const { pool } = require('../config/db.config');
const slugify = require('slugify');

class RentalRepository {
    async findAll(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT r.*, 
                   COALESCE(s.name, rc.name) as display_category_name,
                   rc.name as legacy_category_name,
                   mc.name as main_category_name,
                   c.name as category_name,
                   s.name as subcategory_name,
                   s.type as subcategory_type,
                   u.name as unit_name
            FROM rentals r 
            LEFT JOIN rental_categories rc ON r.rental_category_id = rc.id 
            LEFT JOIN main_categories mc ON r.main_category_id = mc.id
            LEFT JOIN categories c ON r.category_id = c.id
            LEFT JOIN subcategories s ON r.subcategory_id = s.id
            LEFT JOIN units u ON r.unit_id = u.id
            WHERE 1=1`;
        let countQuery = 'SELECT COUNT(*) as total FROM rentals r WHERE 1=1';
        const params = [];

        if (filters.main_category_id) {
            const matchCond = ' AND (r.main_category_id = ? OR EXISTS (SELECT 1 FROM category_main_categories cmc WHERE cmc.category_id = r.category_id AND cmc.main_category_id = ?))';
            query += matchCond;
            countQuery += matchCond;
            params.push(filters.main_category_id, filters.main_category_id);
        }

        if (filters.category_id) {
            query += ' AND r.category_id = ?';
            countQuery += ' AND r.category_id = ?';
            params.push(filters.category_id);
        }

        if (filters.subcategory_id) {
            query += ' AND r.subcategory_id = ?';
            countQuery += ' AND r.subcategory_id = ?';
            params.push(filters.subcategory_id);
        }

        if (filters.rental_category_id) {
            query += ' AND r.rental_category_id = ?';
            countQuery += ' AND r.rental_category_id = ?';
            params.push(filters.rental_category_id);
        }

        if (filters.status) {
            query += ' AND r.status = ?';
            countQuery += ' AND r.status = ?';
            params.push(filters.status);
        }

        if (filters.featured !== undefined) {
            query += ' AND r.featured = ?';
            countQuery += ' AND r.featured = ?';
            params.push(filters.featured ? 1 : 0);
        }

        if (filters.search) {
            query += ' AND (r.name LIKE ? OR r.description LIKE ?)';
            countQuery += ' AND (r.name LIKE ? OR r.description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        // Get total count
        const [[{ total }]] = await pool.execute(countQuery, params);

        // Add pagination to query
        query += ' ORDER BY r.updated_at DESC LIMIT ? OFFSET ?';
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
            `SELECT r.*, 
                    COALESCE(s.name, rc.name) as display_category_name,
                    rc.name as legacy_category_name,
                    mc.name as main_category_name,
                    c.name as category_name,
                    s.name as subcategory_name,
                    s.type as subcategory_type,
                    u.name as unit_name
             FROM rentals r 
             LEFT JOIN rental_categories rc ON r.rental_category_id = rc.id 
             LEFT JOIN main_categories mc ON r.main_category_id = mc.id
             LEFT JOIN categories c ON r.category_id = c.id
             LEFT JOIN subcategories s ON r.subcategory_id = s.id
             LEFT JOIN units u ON r.unit_id = u.id
             WHERE r.id = ?`,
            [id]
        );
        return rows[0];
    }

    async create(rentalData) {
        const {
            main_category_id = null,
            category_id = null,
            subcategory_id = null,
            unit_id = null,
            rental_category_id = null,
            name,
            image = '',
            mobile = '',
            description = '',
            price_per_day = 0,
            status = 'active',
            featured = false
        } = rentalData;

        const [result] = await pool.execute(
            `INSERT INTO rentals 
             (main_category_id, category_id, subcategory_id, unit_id, rental_category_id, name, image, mobile, description, price_per_day, status, featured) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                main_category_id,
                category_id,
                subcategory_id,
                unit_id,
                rental_category_id,
                name,
                image,
                mobile,
                description,
                price_per_day,
                status,
                featured ? 1 : 0
            ]
        );

        const rentalId = result.insertId;

        // Automatically sync to products catalog if subcategory_id is provided
        if (subcategory_id && category_id) {
            try {
                const slug = slugify(name, { lower: true, strict: true });
                await pool.execute(
                    `INSERT INTO products 
                     (category_id, subcategory_id, unit_id, name, slug, description, price, stock, image, status, featured)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [category_id, subcategory_id, unit_id, name, `${slug}-${Date.now()}`, description, price_per_day, 10, image, status, featured ? 1 : 0]
                );
            } catch (syncErr) {
                console.warn('Syncing rental to products warning:', syncErr.message);
            }
        }

        return rentalId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        const allowed = [
            'main_category_id',
            'category_id',
            'subcategory_id',
            'unit_id',
            'rental_category_id',
            'name',
            'image',
            'mobile',
            'description',
            'price_per_day',
            'status',
            'featured'
        ];

        for (const [key, value] of Object.entries(updateData)) {
            if (allowed.includes(key)) {
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

        // Update corresponding product record if it exists
        try {
            const updated = await this.findById(id);
            if (updated && updated.name) {
                const [matchingProds] = await pool.execute('SELECT id FROM products WHERE name = ?', [updated.name]);
                if (matchingProds.length > 0) {
                    await pool.execute(
                        `UPDATE products 
                         SET category_id = ?, subcategory_id = ?, unit_id = ?, price = ?, image = ?, description = ?, status = ?
                         WHERE name = ?`,
                        [
                            updated.category_id || null,
                            updated.subcategory_id || null,
                            updated.unit_id || null,
                            updated.price_per_day,
                            updated.image,
                            updated.description,
                            updated.status,
                            updated.name
                        ]
                    );
                } else if (updated.subcategory_id && updated.category_id) {
                    const slug = slugify(updated.name, { lower: true, strict: true });
                    await pool.execute(
                        `INSERT INTO products 
                         (category_id, subcategory_id, unit_id, name, slug, description, price, stock, image, status, featured)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            updated.category_id,
                            updated.subcategory_id,
                            updated.unit_id,
                            updated.name,
                            `${slug}-${Date.now()}`,
                            updated.description,
                            updated.price_per_day,
                            10,
                            updated.image,
                            updated.status,
                            updated.featured ? 1 : 0
                        ]
                    );
                }
            }
        } catch (syncErr) {
            console.warn('Syncing rental update to products warning:', syncErr.message);
        }

        return result.affectedRows > 0;
    }

    async delete(id) {
        const rental = await this.findById(id);
        if (rental) {
            try {
                await pool.execute('DELETE FROM products WHERE name = ?', [rental.name]);
            } catch (err) {
                console.warn('Deleting synced product warning:', err.message);
            }
        }
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
            `SELECT rb.*, r.name as rental_name, r.image as rental_image, u.name as user_name, u.email as user_email 
             FROM rental_bookings rb 
             JOIN rentals r ON rb.rental_id = r.id 
             JOIN users u ON rb.user_id = u.id 
             WHERE rb.id = ?`,
            [id]
        );
        return rows[0];
    }

    async findBookingsByUser(userId) {
        const [rows] = await pool.execute(
            `SELECT rb.*, r.name as rental_name, r.image as rental_image 
             FROM rental_bookings rb 
             JOIN rentals r ON rb.rental_id = r.id 
             WHERE rb.user_id = ? 
             ORDER BY rb.created_at DESC`,
            [userId]
        );
        return rows;
    }
}

module.exports = new RentalRepository();
