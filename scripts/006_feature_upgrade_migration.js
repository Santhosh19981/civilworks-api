const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function runMigration() {
    console.log('Connecting to database:', process.env.DB_NAME, 'at', process.env.DB_HOST);
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '157.173.222.55',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'civilworks_user',
        password: process.env.DB_PASSWORD || 'Civilworks@123',
        database: process.env.DB_NAME || 'civilworks_prod'
    });

    console.log('Connected successfully. Starting migration...');

    try {
        // 1. Add is_editable_order to subcategories if not exists
        const [subCols] = await conn.query('SHOW COLUMNS FROM subcategories LIKE "is_editable_order"');
        if (subCols.length === 0) {
            console.log('Adding is_editable_order to subcategories...');
            await conn.query('ALTER TABLE subcategories ADD COLUMN is_editable_order TINYINT(1) NOT NULL DEFAULT 0 AFTER measurement_type');
            console.log('Added is_editable_order column.');
        } else {
            console.log('Column is_editable_order already exists on subcategories.');
        }

        // 2. Create skills table
        console.log('Checking skills table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS skills (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                image VARCHAR(255) NOT NULL,
                status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('Skills table verified/created.');

        // 3. Create order_services table
        console.log('Checking order_services table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS order_services (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                subcategory_id INT NOT NULL,
                vendor_id INT NOT NULL,
                vendor_status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
                service_status ENUM('pending', 'in_progress', 'completed', 'cancelled', 'removed') NOT NULL DEFAULT 'pending',
                price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_order_id (order_id),
                INDEX idx_vendor_id (vendor_id),
                INDEX idx_subcategory_id (subcategory_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('order_services table verified/created.');

        // 4. Create project_conversations table
        console.log('Checking project_conversations table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS project_conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL UNIQUE,
                title VARCHAR(255) NULL,
                status ENUM('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
                last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_order_id (order_id),
                INDEX idx_last_message (last_message_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('project_conversations table verified/created.');

        // 5. Create conversation_participants table
        console.log('Checking conversation_participants table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS conversation_participants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id INT NOT NULL,
                user_id INT NULL,
                vendor_id INT NULL,
                participant_type ENUM('customer', 'vendor', 'admin') NOT NULL,
                status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_read_at TIMESTAMP NULL,
                INDEX idx_conversation (conversation_id),
                INDEX idx_user (user_id),
                INDEX idx_vendor (vendor_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('conversation_participants table verified/created.');

        // 6. Create project_messages table
        console.log('Checking project_messages table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS project_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id INT NOT NULL,
                sender_type ENUM('customer', 'vendor', 'system', 'admin') NOT NULL,
                sender_id INT NULL,
                sender_name VARCHAR(255) NOT NULL,
                message_type ENUM('text', 'image', 'video', 'audio', 'pdf', 'document', 'system') NOT NULL DEFAULT 'text',
                content TEXT NULL,
                file_url VARCHAR(500) NULL,
                file_name VARCHAR(255) NULL,
                file_size INT NULL,
                file_type VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_conversation (conversation_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('project_messages table verified/created.');

        // 7. Create notifications table
        console.log('Checking notifications table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                vendor_id INT NULL,
                target_type ENUM('customer', 'vendor', 'admin') NOT NULL,
                order_id INT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(50) NOT NULL DEFAULT 'general',
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                INDEX idx_vendor (vendor_id),
                INDEX idx_read (is_read)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('notifications table verified/created.');

        console.log('✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY.');
        await conn.end();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        await conn.end();
        process.exit(1);
    }
}

runMigration();
