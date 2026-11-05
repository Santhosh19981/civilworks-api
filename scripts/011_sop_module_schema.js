const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function syncSOPSchema() {
    const dbName = process.env.DB_NAME || 'civilworks_qa';
    console.log(`Connecting to ${dbName} on ${process.env.DB_HOST || '157.173.222.55'}:${process.env.DB_PORT || 3306}...`);

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '157.173.222.55',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'civilworks_user',
        password: process.env.DB_PASSWORD || 'Civilworks@123',
        database: dbName
    });

    console.log(`Connected to ${dbName} successfully. Starting SOP schema sync...`);

    try {
        // 1. Alter orders table to add project_name if not exists
        const [ordCols] = await conn.query('SHOW COLUMNS FROM orders LIKE "project_name"');
        if (ordCols.length === 0) {
            console.log('Adding project_name to orders table...');
            await conn.query('ALTER TABLE orders ADD COLUMN project_name VARCHAR(255) NULL AFTER order_no');
            console.log('✅ Added project_name to orders');
        } else {
            console.log('✓ orders.project_name already exists');
        }

        // 2. Alter order_services table
        const serviceCols = [
            { name: 'sequence_order', def: 'INT DEFAULT 1' },
            { name: 'description', def: 'TEXT NULL' },
            { name: 'start_date', def: 'DATE NULL' },
            { name: 'end_date', def: 'DATE NULL' },
            { name: 'progress_percent', def: 'INT DEFAULT 0' }
        ];

        for (const col of serviceCols) {
            const [c] = await conn.query(`SHOW COLUMNS FROM order_services LIKE "${col.name}"`);
            if (c.length === 0) {
                console.log(`Adding ${col.name} to order_services...`);
                await conn.query(`ALTER TABLE order_services ADD COLUMN ${col.name} ${col.def}`);
                console.log(`✅ Added ${col.name} to order_services`);
            } else {
                console.log(`✓ order_services.${col.name} already exists`);
            }
        }

        // 3. Create order_service_subtasks table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS order_service_subtasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_service_id INT NOT NULL,
                order_id INT NOT NULL,
                vendor_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NULL,
                start_date DATE NULL,
                end_date DATE NULL,
                status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
                sequence_order INT DEFAULT 1,
                completed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_order_service (order_service_id),
                INDEX idx_order (order_id),
                INDEX idx_vendor (vendor_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✓ order_service_subtasks table verified');

        // 4. Create subtask_proof_images table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS subtask_proof_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subtask_id INT NOT NULL,
                image_url VARCHAR(500) NOT NULL,
                original_name VARCHAR(255) NULL,
                file_size INT NULL,
                uploaded_by_type ENUM('vendor', 'customer', 'admin') DEFAULT 'vendor',
                uploaded_by_id INT NULL,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_subtask (subtask_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✓ subtask_proof_images table verified');

        // 5. Create service_completion_requests table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS service_completion_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_service_id INT NOT NULL,
                order_id INT NOT NULL,
                vendor_id INT NOT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                request_note TEXT NULL,
                rejection_reason TEXT NULL,
                reviewed_by_user_id INT NULL,
                reviewed_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_order_service (order_service_id),
                INDEX idx_order (order_id),
                INDEX idx_vendor (vendor_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✓ service_completion_requests table verified');

        console.log('🎉 SOP Schema sync completed successfully!');
    } catch (err) {
        console.error('Error during SOP schema sync:', err);
    } finally {
        await conn.end();
    }
}

syncSOPSchema();
