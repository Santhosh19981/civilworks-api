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
        const { order_id, product_id = null, service_id = null, rental_id = null, helper_id = null, quantity, price } = itemData;

        await executor.execute(
            'INSERT INTO order_items (order_id, product_id, service_id, rental_id, helper_id, quantity, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [order_id, product_id, service_id, rental_id, helper_id, quantity, price]
        );
    }

    async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    async findAll(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let query = 'SELECT o.*, u.name as user_name FROM orders o JOIN users u ON o.user_id = u.id';
        let countQuery = 'SELECT COUNT(*) as total FROM orders o';
        const params = [];
        const conditions = [];

        if (filters.status) {
            conditions.push('o.order_status = ?');
            params.push(filters.status);
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
            'SELECT o.*, u.name as user_name, a.full_name, a.mobile as address_mobile, a.address_line_1, a.address_line_2, a.city, a.state, a.pincode FROM orders o JOIN users u ON o.user_id = u.id LEFT JOIN addresses a ON o.address_id = a.id WHERE o.id = ?',
            [id]
        );
        return rows[0];
    }

    async findItemsByOrderId(orderId) {
        const query = `
            SELECT oi.*, 
                   COALESCE(p.name, hs.title, r.name, h.name) as product_name, 
                   COALESCE(p.image, hs.image, r.image, h.image) as image
            FROM order_items oi 
            LEFT JOIN products p ON oi.product_id = p.id 
            LEFT JOIN home_services hs ON oi.service_id = hs.id
            LEFT JOIN rentals r ON oi.rental_id = r.id
            LEFT JOIN helpers h ON oi.helper_id = h.id
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
