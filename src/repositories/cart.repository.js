const { pool } = require('../config/db.config');

class CartRepository {
    async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT ci.*, p.name, p.price, p.image, p.stock FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.user_id = ?',
            [userId]
        );
        return rows;
    }

    async findItem(userId, productId) {
        const [rows] = await pool.execute(
            'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );
        return rows[0];
    }

    async addItem(userId, productId, quantity = 1) {
        const [result] = await pool.execute(
            'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
            [userId, productId, quantity]
        );
        return result.insertId;
    }

    async updateQuantity(id, userId, quantity) {
        const [result] = await pool.execute(
            'UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?',
            [quantity, id, userId]
        );
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
