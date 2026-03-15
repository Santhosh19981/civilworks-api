const mysql = require('mysql2/promise');
const fs = require('fs');

async function sync() {
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync('sync-log.txt', msg + '\n');
    };

    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123'
    };

    try {
        log('Attempting to connect to QA and Prod...');
        const qaConn = await mysql.createConnection({ ...config, database: 'civilworks_qa' });
        log('Connected to QA.');
        
        // Try civilworks_db
        let prodConn;
        try {
            prodConn = await mysql.createConnection({ ...config, database: 'civilworks_db' });
            log('Connected to civilworks_db (Prod).');
        } catch (e) {
            log('Failed to connect to civilworks_db: ' + e.message);
            log('Trying civilworks_prod...');
            prodConn = await mysql.createConnection({ ...config, database: 'civilworks_prod' });
            log('Connected to civilworks_prod.');
        }

        log('Ensuring rental_categories table exists in Prod...');
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

        log('Ensuring rental_category_id exists in Prod rentals table...');
        const [columns] = await prodConn.query('SHOW COLUMNS FROM rentals LIKE "rental_category_id"');
        if (columns.length === 0) {
            await prodConn.query('ALTER TABLE rentals ADD COLUMN rental_category_id INT, ADD FOREIGN KEY (rental_category_id) REFERENCES rental_categories(id)');
        }

        log('Clearing existing rental data in Prod...');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 0');
        await prodConn.query('TRUNCATE TABLE rentals');
        await prodConn.query('TRUNCATE TABLE rental_categories');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 1');

        log('Fetching data from QA...');
        const [categories] = await qaConn.query('SELECT * FROM rental_categories');
        const [rentals] = await qaConn.query('SELECT * FROM rentals');

        log(`Syncing ${categories.length} categories...`);
        for (const cat of categories) {
            await prodConn.query(
                'INSERT INTO rental_categories (id, name, icon, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [cat.id, cat.name, cat.icon, cat.status, cat.created_at, cat.updated_at]
            );
        }

        log(`Syncing ${rentals.length} rentals...`);
        for (const rental of rentals) {
            await prodConn.query(
                'INSERT INTO rentals (id, rental_category_id, name, image, mobile, description, price_per_day, status, featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [rental.id, rental.rental_category_id, rental.name, rental.image, rental.mobile, rental.description, rental.price_per_day, rental.status, rental.featured, rental.created_at, rental.updated_at]
            );
        }

        log('Synchronization completed successfully.');
    } catch (error) {
        log('Synchronization failed: ' + error.stack);
    }
}

sync();
