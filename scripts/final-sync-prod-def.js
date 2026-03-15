const mysql = require('mysql2/promise');
const fs = require('fs');

async function sync() {
    const logFile = 'D:\\Civil works applicaitons\\civilworks-api\\sync_prod_log.txt';
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\n');
    };

    fs.writeFileSync(logFile, '--- SYNC SCRIPT START ---\n');

    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123'
    };

    try {
        log('Connecting to civilworks_qa...');
        const qaConn = await mysql.createConnection({ ...config, database: 'civilworks_qa' });
        log('Connected to QA.');

        log('Connecting to civilworks_prod...');
        const prodConn = await mysql.createConnection({ ...config, database: 'civilworks_prod' });
        log('Connected to civilworks_prod.');

        log('Ensuring rental_categories table exists in civilworks_prod...');
        await prodConn.query(`
            CREATE TABLE IF NOT EXISTS rental_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                icon VARCHAR(255),
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        log('Table rental_categories ensured.');

        log('Ensuring rental_category_id exists in civilworks_prod.rentals...');
        const [columns] = await prodConn.query('SHOW COLUMNS FROM rentals LIKE "rental_category_id"');
        if (columns.length === 0) {
            await prodConn.query('ALTER TABLE rentals ADD COLUMN rental_category_id INT, ADD FOREIGN KEY (rental_category_id) REFERENCES rental_categories(id)');
            log('Added rental_category_id to prod rentals.');
        } else {
            log('Column rental_category_id already exists.');
        }

        log('Clearing Prod rental data...');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 0');
        await prodConn.query('TRUNCATE TABLE rentals');
        await prodConn.query('TRUNCATE TABLE rental_categories');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 1');
        log('Prod data cleared.');

        log('Fetching data from QA...');
        const [categories] = await qaConn.query('SELECT * FROM rental_categories');
        const [rentals] = await qaConn.query('SELECT * FROM rentals');
        log(`Fetched ${categories.length} categories and ${rentals.length} rentals.`);

        log(`Syncing categories...`);
        for (const cat of categories) {
            await prodConn.query(
                'INSERT INTO rental_categories (id, name, icon, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [cat.id, cat.name, cat.icon, cat.status, cat.created_at, cat.updated_at]
            );
        }
        log('Categories synced.');

        log(`Syncing rentals...`);
        for (const rental of rentals) {
            await prodConn.query(
                'INSERT INTO rentals (id, rental_category_id, name, image, mobile, description, price_per_day, status, featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [rental.id, rental.rental_category_id, rental.name, rental.image, rental.mobile, rental.description, rental.price_per_day, rental.status, rental.featured, rental.created_at, rental.updated_at]
            );
        }
        log('Rentals synced.');

        log('--- SYNC SCRIPT SUCCESS ---');
        await qaConn.end();
        await prodConn.end();
    } catch (error) {
        log('--- SYNC SCRIPT ERROR ---');
        log(error.stack);
    }
}

sync();
