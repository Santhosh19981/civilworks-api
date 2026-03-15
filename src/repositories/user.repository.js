const { pool } = require('../config/db.config');

class UserRepository {
    async findById(id) {
        const [rows] = await pool.execute(
            'SELECT u.*, r.name as role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?',
            [id]
        );
        return rows[0];
    }

    async findByEmail(email) {
        const [rows] = await pool.execute(
            'SELECT u.*, r.name as role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.email = ?',
            [email]
        );
        return rows[0];
    }

    async findByMobile(mobile) {
        const [rows] = await pool.execute(
            'SELECT u.*, r.name as role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.mobile = ?',
            [mobile]
        );
        return rows[0];
    }

    async create(userData) {
        const { name, email, mobile, password, role_id = 4, permissions = null } = userData; // Default to 4 (customer)
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, mobile, password, role_id, permissions) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, mobile, password, role_id, permissions]
        );
        return result.insertId;
    }

    async updateProfile(id, updateData) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updateData)) {
            if (['name', 'email', 'mobile', 'image', 'role_id', 'permissions', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return false;

        values.push(id);
        const [result] = await pool.execute(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async updatePassword(id, hashedPassword) {
        const [result] = await pool.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, id]
        );
        return result.affectedRows > 0;
    }

    async findAll(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [];

        if (filters.role) {
            conditions.push('r.name = ?');
            params.push(filters.role);
        }

        if (filters.isEmployee) {
            conditions.push('u.role_id IN (1, 2, 3)');
        }

        if (filters.search) {
            conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)');
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM users u LEFT JOIN roles r ON u.role_id = r.id ${whereClause}`,
            params
        );
        const total = countResult[0].total;

        // Get paginated data
        const [rows] = await pool.execute(
            `SELECT u.id, u.name, u.email, u.mobile, u.image, u.permissions, u.status, r.name as role,
             (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as totalOrders,
             (SELECT IFNULL(SUM(total_amount), 0) FROM orders WHERE user_id = u.id) as totalSpent
             FROM users u 
             LEFT JOIN roles r ON u.role_id = r.id 
             ${whereClause} 
             ORDER BY u.updated_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit.toString(), offset.toString()]
        );

        return {
            data: rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        };
    }
}

module.exports = new UserRepository();
