/**
 * Script to reset the admin password to Admin@123
 * Run: node scripts/reset-admin-password.js
 */
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function resetAdminPassword() {
    const password = 'Admin@123';
    const hash = await bcrypt.hash(password, 10);
    console.log('Generated hash:', hash);

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // Check if admin exists
    const [rows] = await connection.execute(
        "SELECT u.id, u.email, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = 'admin@civilworks.in'"
    );

    if (rows.length === 0) {
        // Insert fresh admin user
        await connection.execute(
            "INSERT INTO users (name, email, mobile, password, role_id, status) VALUES (?, ?, ?, ?, ?, ?)",
            ['Super Admin', 'admin@civilworks.in', '9876543210', hash, 1, 'active']
        );
        console.log('✅ Admin user created with password: Admin@123');
    } else {
        // Update existing admin password
        await connection.execute(
            "UPDATE users SET password = ? WHERE email = 'admin@civilworks.in'",
            [hash]
        );
        console.log('✅ Admin password updated to: Admin@123');
        console.log('   User:', rows[0]);
    }

    await connection.end();
}

resetAdminPassword().catch(console.error);
