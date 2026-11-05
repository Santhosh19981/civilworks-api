const { pool } = require('../config/db.config');

class OrderRepository {
    async createOrder(orderData, connection = null) {
        const executor = connection || pool;
        const { order_no, user_id, address_id, order_type = 'product', subtotal, tax_amount, delivery_charge, total_amount, payment_method, notes } = orderData;

        const [result] = await executor.execute(
            'INSERT INTO orders (order_no, user_id, address_id, order_type, subtotal, tax_amount, delivery_charge, total_amount, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [order_no, user_id, address_id, order_type, subtotal, tax_amount, delivery_charge, total_amount, payment_method, notes]
        );
        return result.insertId;
    }

    async createOrderItem(itemData, connection = null) {
        const executor = connection || pool;
        const {
            order_id,
            product_id = null,
            service_id = null,
            rental_id = null,
            helper_id = null,
            quantity = 1,
            price = 0,
            unit_name = null,
            rental_duration = null,
            product_type = 'selling'
        } = itemData;

        await executor.execute(
            'INSERT INTO order_items (order_id, product_id, service_id, rental_id, helper_id, quantity, price, unit_name, rental_duration, product_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [order_id, product_id, service_id, rental_id, helper_id, quantity, price, unit_name, rental_duration, product_type]
        );
    }

    async findByUserId(userId, orderType = null) {
        let query = `SELECT o.*, 
                    a.full_name as address_name, a.mobile as address_mobile, 
                    a.address_line_1, a.address_line_2, a.landmark, a.city, a.state, a.pincode 
             FROM orders o 
             LEFT JOIN addresses a ON o.address_id = a.id 
             WHERE o.user_id = ?`;
        const params = [userId];
        if (orderType) {
            query += ' AND o.order_type = ?';
            params.push(orderType);
        }
        query += ' ORDER BY o.created_at DESC';
        const [rows] = await pool.execute(query, params);
        return rows;
    }

    async findServicesByOrderId(orderId) {
        const query = `
            SELECT os.*, 
                   COALESCE(NULLIF(os.service_name, ''), (SELECT p.name FROM products p WHERE p.subcategory_id = s.id LIMIT 1), s.name) as service_name,
                   s.name as subcategory_name, s.is_editable_order, s.image as subcategory_image,
                   c.name as category_name, mc.name as main_category_name,
                   v.name as vendor_name, v.mobile as vendor_mobile, v.email as vendor_email
            FROM order_services os
            JOIN subcategories s ON os.subcategory_id = s.id
            LEFT JOIN categories c ON s.category_id = c.id
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id
            LEFT JOIN vendors v ON os.vendor_id = v.id
            WHERE os.order_id = ? AND (os.service_status IS NULL OR os.service_status != 'removed')
            ORDER BY os.id ASC
        `;
        const [rows] = await pool.execute(query, [orderId]);
        return rows;
    }

    async addOrderService(serviceData, connection = null) {
        const executor = connection || pool;
        const { order_id, subcategory_id, vendor_id, service_name = null, vendor_status = 'pending', service_status = 'pending', price = 0, notes = null, sequence_order = null } = serviceData;
        let seq = sequence_order;
        if (!seq) {
            const [seqRows] = await executor.execute('SELECT COALESCE(MAX(sequence_order), 0) + 1 AS next_seq FROM order_services WHERE order_id = ?', [order_id]);
            seq = seqRows[0]?.next_seq || 1;
        }
        const [result] = await executor.execute(
            'INSERT INTO order_services (order_id, subcategory_id, vendor_id, service_name, vendor_status, service_status, price, notes, sequence_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [order_id, subcategory_id, vendor_id, service_name, vendor_status, service_status, price, notes, seq]
        );
        return result.insertId;
    }

    async updateOrderService(serviceId, updateData, connection = null) {
        const executor = connection || pool;
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['vendor_id', 'vendor_status', 'service_status', 'service_name', 'price', 'notes'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(serviceId);
        const [result] = await executor.execute(
            `UPDATE order_services SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async findAll(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let query = `SELECT o.*, u.name as user_name, u.mobile as user_mobile, 
                            a.full_name as address_name, a.mobile as address_mobile, 
                            a.address_line_1, a.address_line_2, a.landmark, a.city, a.state, a.pincode 
                     FROM orders o 
                     JOIN users u ON o.user_id = u.id 
                     LEFT JOIN addresses a ON o.address_id = a.id`;
        let countQuery = 'SELECT COUNT(*) as total FROM orders o JOIN users u ON o.user_id = u.id';
        const params = [];
        const conditions = [];

        if (filters.status) {
            conditions.push('o.order_status = ?');
            params.push(filters.status);
        }

        if (filters.search) {
            conditions.push('(o.order_no LIKE ? OR u.name LIKE ?)');
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        if (conditions.length > 0) {
            const conditionStr = ' WHERE ' + conditions.join(' AND ');
            query += conditionStr;
            countQuery += conditionStr;
        }

        // Get total count
        const [[{ total }]] = await pool.execute(countQuery, params);

        // Add pagination to query
        query += ' ORDER BY o.updated_at DESC LIMIT ? OFFSET ?';
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
            'SELECT o.*, u.name as user_name, u.mobile as user_mobile, a.full_name, a.mobile as address_mobile, a.address_line_1, a.address_line_2, a.landmark, a.city, a.state, a.pincode FROM orders o JOIN users u ON o.user_id = u.id LEFT JOIN addresses a ON o.address_id = a.id WHERE o.id = ? OR o.order_no = ?',
            [id, id]
        );
        return rows[0];
    }

    async findItemsByOrderId(orderId) {
        const query = `
            SELECT oi.*, 
                   COALESCE(p.name, hs.title, r.name, h.service_name) as product_name, 
                   COALESCE(p.image, s.image, c.icon, hs.icon, r.image, h.image) as image,
                   u.name as current_unit_name,
                   s.type as current_subcategory_type,
                   COALESCE(mc.name, rmc.name, hmc.name, 'Construction') as main_category_name,
                   COALESCE(c.main_category_id, r.main_category_id, h.main_category_id, 1) as main_category_id
            FROM order_items oi 
            LEFT JOIN products p ON oi.product_id = p.id 
            LEFT JOIN subcategories s ON p.subcategory_id = s.id
            LEFT JOIN categories c ON COALESCE(p.category_id, s.category_id) = c.id
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id
            LEFT JOIN units u ON p.unit_id = u.id
            LEFT JOIN home_services hs ON oi.service_id = hs.id
            LEFT JOIN rentals r ON oi.rental_id = r.id
            LEFT JOIN main_categories rmc ON r.main_category_id = rmc.id
            LEFT JOIN helpers h ON oi.helper_id = h.id
            LEFT JOIN main_categories hmc ON h.main_category_id = hmc.id
            WHERE oi.order_id = ?
        `;
        const [rows] = await pool.execute(query, [orderId]);
        return rows;
    }

    async updateStatus(id, status) {
        const [result] = await pool.execute(
            'UPDATE orders SET order_status = ? WHERE id = ?',
            [status, id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = new OrderRepository();
