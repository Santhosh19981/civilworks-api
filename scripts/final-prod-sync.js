const mysql = require('mysql2/promise');

async function sync() {
    console.log('--- FINAL PRODUCTION SYNC START ---');
    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123'
    };

    let qaConn, prodConn;
    try {
        console.log('Connecting to civilworks_qa...');
        qaConn = await mysql.createConnection({ ...config, database: 'civilworks_qa' });
        console.log('Connected to QA.');

        console.log('Connecting to civilworks_prod...');
        prodConn = await mysql.createConnection({ ...config, database: 'civilworks_prod' });
        console.log('Connected to civilworks_prod.');

        console.log('Ensuring rental_categories table exists in Prod...');
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

        console.log('Ensuring rental_category_id exists in Prod rentals table...');
        const [columns] = await prodConn.query('SHOW COLUMNS FROM rentals LIKE "rental_category_id"');
        if (columns.length === 0) {
            await prodConn.query('ALTER TABLE rentals ADD COLUMN rental_category_id INT, ADD FOREIGN KEY (rental_category_id) REFERENCES rental_categories(id)');
            console.log('Added rental_category_id to prod rentals.');
        }

        console.log('Clearing Prod rental data...');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 0');
        await prodConn.query('TRUNCATE TABLE rentals');
        await prodConn.query('TRUNCATE TABLE rental_categories');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Fetching from QA...');
        const [categories] = await qaConn.query('SELECT * FROM rental_categories');
        const [rentals] = await qaConn.query('SELECT * FROM rentals');

        console.log(`Syncing ${categories.length} categories...`);
        for (const cat of categories) {
            await prodConn.query(
                'INSERT INTO rental_categories (id, name, icon, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [cat.id, cat.name, cat.icon, cat.status, cat.created_at, cat.updated_at]
            );
        }

        console.log(`Syncing ${rentals.length} rentals...`);
        for (const rental of rentals) {
            await prodConn.query(
                'INSERT INTO rentals (id, rental_category_id, name, image, mobile, description, price_per_day, status, featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [rental.id, rental.rental_category_id, rental.name, rental.image, rental.mobile, rental.description, rental.price_per_day, rental.status, rental.featured, rental.created_at, rental.updated_at]
            );
        }

        console.log('--- FINAL PRODUCTION SYNC SUCCESS ---');
    } catch (error) {
        console.error('--- FINAL PRODUCTION SYNC ERROR ---');
        console.error(error);
    } finally {
        if (qaConn) await qaConn.end();
        if (prodConn) await prodConn.end();
    }
}

sync();
