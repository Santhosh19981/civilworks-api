const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function syncQaSchema() {
    const dbName = process.env.DB_NAME || 'civilworks_qa';
    console.log(`Connecting to ${dbName} on ${process.env.DB_HOST || '157.173.222.55'}...`);

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '157.173.222.55',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'civilworks_user',
        password: process.env.DB_PASSWORD || 'Civilworks@123',
        database: dbName
    });

    console.log(`Connected to ${dbName} successfully. Starting sync...`);

    try {
        // 1. subcategories.is_editable_order
        const [subCols] = await conn.query('SHOW COLUMNS FROM subcategories LIKE "is_editable_order"');
        if (subCols.length === 0) {
            console.log('Adding is_editable_order to subcategories...');
            await conn.query('ALTER TABLE subcategories ADD COLUMN is_editable_order TINYINT(1) NOT NULL DEFAULT 0');
            console.log('✅ Added is_editable_order to subcategories');
        } else {
            console.log('✓ subcategories.is_editable_order already exists');
        }

        // 2. vendors.image
        const [venCols] = await conn.query('SHOW COLUMNS FROM vendors LIKE "image"');
        if (venCols.length === 0) {
            console.log('Adding image to vendors...');
            await conn.query('ALTER TABLE vendors ADD COLUMN image VARCHAR(500) NULL');
            console.log('✅ Added image to vendors');
        } else {
            console.log('✓ vendors.image already exists');
        }

        // 2b. order_items.product_id nullable
        console.log('Ensuring order_items.product_id is nullable...');
        await conn.query('ALTER TABLE order_items MODIFY COLUMN product_id INT NULL DEFAULT NULL');
        console.log('✅ Verified order_items.product_id is nullable');

        // 2c. orders.payment_method varchar(50)
        console.log('Ensuring orders.payment_method is VARCHAR(50)...');
        await conn.query("ALTER TABLE orders MODIFY COLUMN payment_method VARCHAR(50) NOT NULL DEFAULT 'cod'");
        console.log('✅ Verified orders.payment_method is VARCHAR(50)');

        // 3. skills table
        console.log('Verifying skills table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`skills\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
              \`image\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
              \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Verified skills table');

        // 4. order_services table
        console.log('Verifying order_services table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`order_services\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`order_id\` int NOT NULL,
              \`subcategory_id\` int NOT NULL,
              \`service_name\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`vendor_id\` int NOT NULL,
              \`vendor_status\` enum('pending','accepted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
              \`service_status\` enum('pending','in_progress','completed','cancelled','removed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
              \`price\` decimal(10,2) NOT NULL DEFAULT '0.00',
              \`notes\` text COLLATE utf8mb4_unicode_ci,
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              KEY \`idx_order_id\` (\`order_id\`),
              KEY \`idx_vendor_id\` (\`vendor_id\`),
              KEY \`idx_subcategory_id\` (\`subcategory_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Verified order_services table');

        // 5. project_conversations table
        console.log('Verifying project_conversations table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`project_conversations\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`order_id\` int NOT NULL,
              \`title\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`status\` enum('active','completed','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
              \`last_message_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              UNIQUE KEY \`order_id\` (\`order_id\`),
              KEY \`idx_order_id\` (\`order_id\`),
              KEY \`idx_last_message\` (\`last_message_at\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Verified project_conversations table');

        // 6. conversation_participants table
        console.log('Verifying conversation_participants table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`conversation_participants\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`conversation_id\` int NOT NULL,
              \`user_id\` int DEFAULT NULL,
              \`vendor_id\` int DEFAULT NULL,
              \`participant_type\` enum('customer','vendor','admin') COLLATE utf8mb4_unicode_ci NOT NULL,
              \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
              \`joined_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`last_read_at\` timestamp NULL DEFAULT NULL,
              \`completed_at\` datetime DEFAULT NULL,
              PRIMARY KEY (\`id\`),
              KEY \`idx_conversation\` (\`conversation_id\`),
              KEY \`idx_user\` (\`user_id\`),
              KEY \`idx_vendor\` (\`vendor_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Verified conversation_participants table');

        // 7. project_messages table
        console.log('Verifying project_messages table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`project_messages\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`conversation_id\` int NOT NULL,
              \`sender_type\` enum('customer','vendor','system','admin') COLLATE utf8mb4_unicode_ci NOT NULL,
              \`sender_id\` int DEFAULT NULL,
              \`sender_name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
              \`message_type\` enum('text','image','video','audio','pdf','document','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text',
              \`content\` text COLLATE utf8mb4_unicode_ci,
              \`file_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`file_name\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`file_size\` int DEFAULT NULL,
              \`file_type\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              KEY \`idx_conversation\` (\`conversation_id\`),
              KEY \`idx_created\` (\`created_at\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Verified project_messages table');

        // 8. notifications table
        console.log('Verifying notifications table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`notifications\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`user_id\` int DEFAULT NULL,
              \`vendor_id\` int DEFAULT NULL,
              \`target_type\` enum('customer','vendor','admin') COLLATE utf8mb4_unicode_ci NOT NULL,
              \`order_id\` int DEFAULT NULL,
              \`service_id\` int DEFAULT NULL,
              \`title\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
              \`message\` text COLLATE utf8mb4_unicode_ci NOT NULL,
              \`type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
              \`is_read\` tinyint(1) NOT NULL DEFAULT '0',
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              KEY \`idx_user\` (\`user_id\`),
              KEY \`idx_vendor\` (\`vendor_id\`),
              KEY \`idx_read\` (\`is_read\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Verified notifications table');

        // 9. users dynamic profile columns (all defaulted to NULL until filled)
        console.log('Verifying users dynamic profile columns...');
        await conn.query('ALTER TABLE users MODIFY COLUMN name VARCHAR(255) NULL DEFAULT NULL');
        const userColsToAdd = [
            { name: 'designation', def: 'VARCHAR(255) NULL DEFAULT NULL' },
            { name: 'organization', def: 'VARCHAR(255) NULL DEFAULT NULL' },
            { name: 'site_location', def: 'VARCHAR(255) NULL DEFAULT NULL' },
            { name: 'safety_clearance', def: 'VARCHAR(100) NULL DEFAULT NULL' },
            { name: 'preferences', def: 'JSON NULL DEFAULT NULL' }
        ];
        for (const col of userColsToAdd) {
            const [existing] = await conn.query(`SHOW COLUMNS FROM users LIKE "${col.name}"`);
            if (existing.length === 0) {
                await conn.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.def}`);
                console.log(`✅ Added users.${col.name}`);
            } else {
                await conn.query(`ALTER TABLE users MODIFY COLUMN ${col.name} ${col.def}`);
                console.log(`✓ users.${col.name} verified as NULL default`);
            }
        }

        console.log('\n🎉 ALL MISSING QA FEATURES & CHAT TABLES SYNCHRONIZED SUCCESSFULLY!');
    } catch (err) {
        console.error('❌ Error syncing schema:', err);
        throw err;
    } finally {
        await conn.end();
    }
}

syncQaSchema()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
