const mysql = require('mysql2/promise');
require('dotenv').config();

async function syncMissingColumns() {
    const config = {
        host: process.env.DB_HOST || '157.173.222.55',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'civilworks_user',
        password: process.env.DB_PASSWORD || 'Civilworks@123',
        database: process.env.DB_NAME || (process.env.NODE_ENV === 'qa' ? 'civilworks_qa' : 'civilworks_qa')
    };

    console.log(`Connecting to ${config.database} on ${config.host}...`);
    const conn = await mysql.createConnection(config);

    try {
        // 1. subcategories.image
        const [subCols] = await conn.query('DESCRIBE subcategories');
        const subColNames = subCols.map(c => c.Field);
        if (!subColNames.includes('image')) {
            console.log('Adding image column to subcategories...');
            await conn.query('ALTER TABLE subcategories ADD COLUMN image VARCHAR(255) NULL AFTER name');
            console.log('✅ Added image to subcategories');
        } else {
            console.log('✓ subcategories.image already exists');
        }

        // 2. orders.order_type
        const [orderCols] = await conn.query('DESCRIBE orders');
        const orderColNames = orderCols.map(c => c.Field);
        if (!orderColNames.includes('order_type')) {
            console.log('Adding order_type column to orders...');
            await conn.query("ALTER TABLE orders ADD COLUMN order_type ENUM('product','service','rental','helper') DEFAULT 'product' AFTER user_id");
            console.log('✅ Added order_type to orders');
        } else {
            console.log('✓ orders.order_type already exists');
        }

        // 3. order_items service_id, rental_id, helper_id
        const [itemCols] = await conn.query('DESCRIBE order_items');
        const itemColNames = itemCols.map(c => c.Field);
        if (!itemColNames.includes('service_id')) {
            console.log('Adding service_id to order_items...');
            await conn.query('ALTER TABLE order_items ADD COLUMN service_id INT NULL AFTER product_id');
            console.log('✅ Added service_id to order_items');
        }
        if (!itemColNames.includes('rental_id')) {
            console.log('Adding rental_id to order_items...');
            await conn.query('ALTER TABLE order_items ADD COLUMN rental_id INT NULL AFTER service_id');
            console.log('✅ Added rental_id to order_items');
        }
        if (!itemColNames.includes('helper_id')) {
            console.log('Adding helper_id to order_items...');
            await conn.query('ALTER TABLE order_items ADD COLUMN helper_id INT NULL AFTER rental_id');
            console.log('✅ Added helper_id to order_items');
        }

        // 4. home_services table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS home_services (
              id INT NOT NULL AUTO_INCREMENT,
              type ENUM('Categories','Rental','Helpers') NOT NULL,
              title VARCHAR(255) NOT NULL,
              subtitle VARCHAR(255) DEFAULT NULL,
              icon VARCHAR(100) DEFAULT NULL,
              related_ids TEXT,
              display_order INT DEFAULT '0',
              status ENUM('active','inactive') DEFAULT 'active',
              created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Verified home_services table');

        console.log('\n🎉 ALL MISSING QA SCHEMAS AND COLUMNS SYNCHRONIZED SUCCESSFULLY!');
    } catch (err) {
        console.error('❌ Error syncing schema:', err);
        throw err;
    } finally {
        await conn.end();
    }
}

syncMissingColumns()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
