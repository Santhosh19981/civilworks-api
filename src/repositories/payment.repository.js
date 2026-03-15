const { pool } = require('../config/db.config');

class PaymentRepository {
    async create(paymentData) {
        const { transaction_id, reference_type, reference_id, user_id, payment_method, amount, status = 'pending' } = paymentData;
        const [result] = await pool.execute(
            'INSERT INTO payments (transaction_id, reference_type, reference_id, user_id, payment_method, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [transaction_id, reference_type, reference_id, user_id, payment_method, amount, status]
        );
        return result.insertId;
    }

    async findById(id) {
        const [rows] = await pool.execute('SELECT p.*, u.name as user_name FROM payments p JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]);
        return rows[0];
    }

    async findAll(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let query = 'SELECT p.*, u.name as user_name FROM payments p JOIN users u ON p.user_id = u.id';
        let countQuery = 'SELECT COUNT(*) as total FROM payments p';
        const params = [];

        if (filters.status) {
            query += ' WHERE p.status = ?';
            countQuery += ' WHERE status = ?';
            params.push(filters.status);
        }

        // Get total count
        const [[{ total }]] = await pool.execute(countQuery, params);

        // Add pagination to query
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
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

    async updateStatus(id, status, gatewayResponse = null) {
        const [result] = await pool.execute(
            'UPDATE payments SET status = ?, gateway_response = ? WHERE id = ?',
            [status, gatewayResponse ? JSON.stringify(gatewayResponse) : null, id]
        );
        return result.affectedRows > 0;
    }
}

module.exports = new PaymentRepository();
