const { pool } = require('../config/db.config');

class VendorRepository {
    async findAll(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        let query = `SELECT DISTINCT v.* FROM vendors v`;
        let countQuery = `SELECT COUNT(DISTINCT v.id) as total FROM vendors v`;
        const params = [];
        const conditions = [];

        if (filters.subcategory_id) {
            query += ` JOIN vendor_subcategories vs ON v.id = vs.vendor_id`;
            countQuery += ` JOIN vendor_subcategories vs ON v.id = vs.vendor_id`;
            conditions.push(`vs.subcategory_id = ?`);
            params.push(filters.subcategory_id);
        }

        if (filters.status) {
            conditions.push(`v.status = ?`);
            params.push(filters.status);
        }

        if (filters.search) {
            conditions.push(`(v.name LIKE ? OR v.mobile LIKE ? OR v.email LIKE ?)`);
            params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        const [[{ total }]] = await pool.execute(countQuery, params);

        query += ' ORDER BY v.id ASC LIMIT ? OFFSET ?';
        const [rows] = await pool.execute(query, [...params, limit.toString(), offset.toString()]);

        // Attach mapped services for each vendor
        for (const vendor of rows) {
            vendor.services = await this.getServicesByVendorId(vendor.id);
        }

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
        const [rows] = await pool.execute('SELECT * FROM vendors WHERE id = ?', [id]);
        if (rows.length === 0) return null;
        const vendor = rows[0];
        vendor.services = await this.getServicesByVendorId(vendor.id);
        return vendor;
    }

    async getServicesByVendorId(vendorId) {
        const [rows] = await pool.execute(`
            SELECT s.id, s.name, s.category_id, c.name as category_name
            FROM vendor_subcategories vs
            JOIN subcategories s ON vs.subcategory_id = s.id
            LEFT JOIN categories c ON s.category_id = c.id
            WHERE vs.vendor_id = ?
            ORDER BY s.name ASC
        `, [vendorId]);
        return rows;
    }

    async create(vendorData, serviceIds = []) {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
            const { name, mobile, email = null, image = null, status = 'active' } = vendorData;
            const [result] = await connection.execute(
                'INSERT INTO vendors (name, mobile, email, image, status) VALUES (?, ?, ?, ?, ?)',
                [name, mobile, email, image, status]
            );
            const vendorId = result.insertId;

            if (Array.isArray(serviceIds) && serviceIds.length > 0) {
                for (const subId of serviceIds) {
                    await connection.execute(
                        'INSERT INTO vendor_subcategories (vendor_id, subcategory_id) VALUES (?, ?)',
                        [vendorId, subId]
                    );
                }
            }

            await connection.commit();
            connection.release();
            return vendorId;
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    }

    async update(id, updateData, serviceIds = null) {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updateData)) {
                if (['name', 'mobile', 'email', 'image', 'status'].includes(key)) {
                    fields.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (fields.length > 0) {
                values.push(id);
                await connection.execute(
                    `UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`,
                    values
                );
            }

            if (Array.isArray(serviceIds)) {
                await connection.execute('DELETE FROM vendor_subcategories WHERE vendor_id = ?', [id]);
                for (const subId of serviceIds) {
                    await connection.execute(
                        'INSERT INTO vendor_subcategories (vendor_id, subcategory_id) VALUES (?, ?)',
                        [id, subId]
                    );
                }
            }

            await connection.commit();
            connection.release();
            return true;
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    }

    async delete(id) {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
            await connection.execute('DELETE FROM vendor_subcategories WHERE vendor_id = ?', [id]);
            await connection.execute('DELETE FROM conversation_participants WHERE vendor_id = ?', [id]);
            await connection.execute('DELETE FROM notifications WHERE vendor_id = ?', [id]);
            await connection.execute('UPDATE order_services SET vendor_id = NULL WHERE vendor_id = ?', [id]);
            const [result] = await connection.execute('DELETE FROM vendors WHERE id = ?', [id]);
            await connection.commit();
            connection.release();
            return result.affectedRows > 0;
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    }
}

module.exports = new VendorRepository();
