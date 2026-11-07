/**
 * Migration 014: customer approval for vendor-completed subtasks, plus a shared comment thread.
 *
 * - Adds 'approval_pending' to order_service_subtasks.status. A vendor finishing a subtask now
 *   waits for the customer's approval instead of going straight to 'completed'.
 * - Creates sop_comments: review comments and discussion for subtasks and services.
 *
 * Both changes are additive and safe to run more than once.
 * Run: node scripts/014_subtask_approval_and_comments.js
 */
const { pool } = require('../src/config/db.config');

async function migrate() {
    console.log('--- Migration 014: subtask approval + Site Workflow comments ---');
    const conn = await pool.getConnection();
    try {
        const [statusCol] = await conn.query("SHOW COLUMNS FROM order_service_subtasks LIKE 'status'");
        if (!statusCol[0].Type.includes("'approval_pending'")) {
            console.log("Adding 'approval_pending' to order_service_subtasks.status...");
            await conn.query(
                "ALTER TABLE order_service_subtasks MODIFY COLUMN status " +
                "ENUM('pending','in_progress','approval_pending','completed') DEFAULT 'pending'"
            );
        } else {
            console.log("order_service_subtasks.status already includes 'approval_pending'.");
        }

        await conn.query(`
            CREATE TABLE IF NOT EXISTS sop_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                order_service_id INT NULL,
                subtask_id INT NULL,
                author_type ENUM('customer','vendor','admin','system') NOT NULL DEFAULT 'customer',
                author_id INT NULL,
                author_name VARCHAR(255) NULL,
                kind VARCHAR(30) NOT NULL DEFAULT 'comment',
                comment TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sop_comments_subtask (subtask_id),
                INDEX idx_sop_comments_service (order_service_id),
                INDEX idx_sop_comments_order (order_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('sop_comments table ready.');

        console.log('Migration 014 complete!');
    } catch (err) {
        console.error('Migration error:', err);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
}

migrate();
