const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function syncHelpersAndSkillsSchema() {
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
        // 1. subcategories.type includes 'helpers'
        const [typeCol] = await conn.query('SHOW COLUMNS FROM subcategories LIKE "type"');
        if (typeCol.length > 0) {
            const colType = typeCol[0].Type || '';
            if (!colType.includes("'helpers'")) {
                console.log('Adding "helpers" to subcategories.type enum...');
                await conn.query("ALTER TABLE subcategories MODIFY COLUMN type ENUM('selling','renting','services','helpers') NOT NULL");
                console.log('✅ Updated subcategories.type enum to include "helpers"');
            } else {
                console.log('✓ subcategories.type already includes "helpers"');
            }
        }

        // 2. products.skills
        const [skillCol] = await conn.query('SHOW COLUMNS FROM products LIKE "skills"');
        if (skillCol.length === 0) {
            console.log('Adding skills column to products table...');
            await conn.query('ALTER TABLE products ADD COLUMN skills TEXT NULL');
            console.log('✅ Added skills column to products table');
        } else {
            console.log('✓ products.skills already exists');
        }

        // 3. Ensure skills table exists
        await conn.query(`
            CREATE TABLE IF NOT EXISTS skills (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                image VARCHAR(500) NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✓ skills table verified');

        console.log('🎉 Schema sync completed successfully!');
    } catch (err) {
        console.error('Error during schema sync:', err);
    } finally {
        await conn.end();
    }
}

syncHelpersAndSkillsSchema();
