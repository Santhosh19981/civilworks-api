const { pool } = require('../config/db.config');

class CartRepository {
    async findByUserId(userId) {
        const [rows] = await pool.execute(`
            SELECT 
                ci.*, 
                p.name, 
                p.price, 
                p.image, 
                p.stock,
                s.type as subcategory_type,
                s.measurement_type,
                u.name as unit_name,
                u.unit_category,
                c.main_category_id,
                COALESCE(mc.name, 'Construction') as main_category_name
            FROM cart_items ci 
            JOIN products p ON ci.product_id = p.id 
            LEFT JOIN subcategories s ON p.subcategory_id = s.id
            LEFT JOIN categories c ON COALESCE(p.category_id, s.category_id) = c.id
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id
            LEFT JOIN units u ON COALESCE(ci.unit_id, p.unit_id) = u.id
            WHERE ci.user_id = ?
            ORDER BY ci.created_at DESC
        `, [userId]);
        return rows;
    }

    async findItem(userId, productId) {
        const [rows] = await pool.execute(
            'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );
        return rows[0];
    }

    async findItemByItemId(id, userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM cart_items WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        return rows[0];
    }

    async addItem(userId, productId, quantity = 1, rentalDuration = null, unitId = null) {
        const [result] = await pool.execute(
            'INSERT INTO cart_items (user_id, product_id, quantity, rental_duration, unit_id) VALUES (?, ?, ?, ?, ?)',
            [userId, productId, quantity, rentalDuration, unitId]
        );
        return result.insertId;
    }

    async updateQuantity(id, userId, quantity, rentalDuration = null) {
        let sql = 'UPDATE cart_items SET quantity = ?';
        const params = [quantity];
        if (rentalDuration !== null) {
            sql += ', rental_duration = ?';
            params.push(rentalDuration);
        }
        sql += ' WHERE id = ? AND user_id = ?';
        params.push(id, userId);

        const [result] = await pool.execute(sql, params);
        return result.affectedRows > 0;
    }

    async removeItem(id, userId) {
        const [result] = await pool.execute('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [id, userId]);
        return result.affectedRows > 0;
    }

    async clearCart(userId) {
        await pool.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    }
}

module.exports = new CartRepository();
