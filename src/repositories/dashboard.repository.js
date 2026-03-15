const { pool } = require('../config/db.config');

class DashboardRepository {
    async getStats() {
        // Simple queries without parameters
        const baseQueries = {
            totalProducts: 'SELECT COUNT(*) as count FROM products',
            totalRentals: 'SELECT COUNT(*) as count FROM rentals',
            totalHelpers: 'SELECT COUNT(*) as count FROM helpers',
            totalOrders: 'SELECT COUNT(*) as count FROM orders',
            totalRevenue: 'SELECT SUM(total_amount) as total FROM orders WHERE payment_status = "paid"',
            pendingOrders: 'SELECT COUNT(*) as count FROM orders WHERE order_status = "pending"',
            lowStockProducts: 'SELECT COUNT(*) as count FROM products WHERE stock < 5',
            overdueRentals: "SELECT COUNT(*) as count FROM rental_bookings WHERE booking_status = 'ongoing' AND DATE_ADD(created_at, INTERVAL duration_days DAY) < NOW()"
        };

        const [roleCounts] = await pool.query('SELECT r.name, COUNT(u.id) as count FROM roles r LEFT JOIN users u ON r.id = u.role_id GROUP BY r.name');
        
        const keys = Object.keys(baseQueries);
        const results = await Promise.all(
            keys.map(key => pool.query(baseQueries[key]))
        );

        const stats = {};
        
        // Add roles counts dynamically
        roleCounts.forEach(role => {
            stats[`role_${role.name}`] = role.count || 0;
        });
        // Keep the old totalCustomers for backward compatibility
        stats.totalCustomers = stats.role_customer || 0;

        results.forEach(([rows], index) => {
            const key = keys[index];
            if (key === 'totalRevenue') {
                stats[key] = parseFloat(rows[0].total || 0).toFixed(2);
            } else {
                stats[key] = rows[0].count || 0;
            }
        });

        return stats;
    }

    async getRecentOrders(limit = 10) {
        const [rows] = await pool.query(
            'SELECT o.*, u.name as user_name FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT ?',
            [limit]
        );
        return rows;
    }

    async getOrderTypeDistribution() {
        const [rows] = await pool.query(
            'SELECT order_status, COUNT(*) as count FROM orders GROUP BY order_status'
        );
        return rows;
    }

    async getPaymentMethodDistribution() {
        const [rows] = await pool.query(
            'SELECT payment_method, COUNT(*) as count FROM orders GROUP BY payment_method'
        );
        return rows;
    }

    async getCategoryDistribution() {
        const [rows] = await pool.query(
            'SELECT c.name, COUNT(p.id) as count FROM categories c LEFT JOIN products p ON c.id = p.category_id GROUP BY c.name'
        );
        return rows;
    }

    async getMonthlyOrderDistribution() {
        const [rows] = await pool.query(
            "SELECT DATE_FORMAT(created_at, '%b') as month, COUNT(*) as count FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) GROUP BY month ORDER BY MIN(created_at)"
        );
        return rows;
    }

    async getRevenueReport(days = 30) {
        const [rows] = await pool.query(
            'SELECT DATE(created_at) as date, SUM(total_amount) as revenue FROM orders WHERE payment_status = "paid" AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY DATE(created_at) ORDER BY date ASC',
            [days]
        );
        return rows;
    }

    async getMonthlyRevenueDistribution() {
        const [rows] = await pool.query(
            "SELECT DATE_FORMAT(created_at, '%b') as month, SUM(total_amount) as total FROM orders WHERE payment_status = 'paid' AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) GROUP BY month ORDER BY MIN(created_at)"
        );
        return rows;
    }

    async getPaymentIntelligence() {
        const queries = {
            liquidity: "SELECT SUM(amount) as total FROM payments WHERE status = 'paid'",
            settlements: "SELECT SUM(amount) as total FROM payments WHERE payment_method != 'cod' AND status = 'paid'",
            collections: "SELECT SUM(amount) as total FROM payments WHERE payment_method = 'cod' AND status = 'paid'",
            reversals: "SELECT SUM(amount) as total FROM payments WHERE status = 'Refunded'",
            totalCount: "SELECT COUNT(*) as count FROM payments"
        };

        const keys = Object.keys(queries);
        const results = await Promise.all(
            keys.map(key => pool.query(queries[key]))
        );

        const intelligence = {};
        results.forEach(([rows], index) => {
            const key = keys[index];
            if (key === 'totalCount') {
                intelligence[key] = rows[0].count || 0;
            } else {
                intelligence[key] = parseFloat(rows[0].total || 0).toFixed(2);
            }
        });

        return intelligence;
    }

    async getBestSellers(limit = 10) {
        const [rows] = await pool.query(`
            SELECT 
                p.name, 
                SUM(oi.quantity) as qty, 
                SUM(oi.quantity * oi.price) as revenue 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.payment_status = 'paid'
            GROUP BY p.id, p.name
            ORDER BY revenue DESC
            LIMIT ?
        `, [limit]);
        return rows;
    }
}

module.exports = new DashboardRepository();
