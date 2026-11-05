const { pool } = require('../src/config/db.config');

async function migrate() {
    console.log('--- Checking & adding Plus Membership & Next Service Handover columns ---');
    const conn = await pool.getConnection();
    try {
        // 1. users table columns
        const [userCols] = await conn.query("SHOW COLUMNS FROM users LIKE 'is_plus_member'");
        if (userCols.length === 0) {
            console.log('Adding is_plus_member, plus_membership_plan, plus_membership_expiry to users...');
            await conn.query('ALTER TABLE users ADD COLUMN is_plus_member TINYINT(1) DEFAULT 0 AFTER role');
            await conn.query('ALTER TABLE users ADD COLUMN plus_membership_plan VARCHAR(50) NULL AFTER is_plus_member');
            await conn.query('ALTER TABLE users ADD COLUMN plus_membership_expiry DATETIME NULL AFTER plus_membership_plan');
        } else {
            console.log('users Plus membership columns already exist.');
        }

        // 2. order_service_subtasks columns
        const [subtaskCols] = await conn.query("SHOW COLUMNS FROM order_service_subtasks LIKE 'next_order_service_id'");
        if (subtaskCols.length === 0) {
            console.log('Adding next_order_service_id and next_vendor_id to order_service_subtasks...');
            await conn.query('ALTER TABLE order_service_subtasks ADD COLUMN next_order_service_id INT NULL AFTER end_date');
            await conn.query('ALTER TABLE order_service_subtasks ADD COLUMN next_vendor_id INT NULL AFTER next_order_service_id');
        } else {
            console.log('order_service_subtasks next vendor handover columns already exist.');
        }

        console.log('Migration 013 complete!');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

migrate();

