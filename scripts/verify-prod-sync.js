const mysql = require('mysql2/promise');

async function verify() {
    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_prod'
    };

    try {
        const connection = await mysql.createConnection(config);
        console.log('--- VERIFICATION START ---');
        
        const [tables] = await connection.query('SHOW TABLES LIKE "rental_categories"');
        if (tables.length > 0) {
            console.log('SUCCESS: rental_categories table exists.');
            const [rows] = await connection.query('SELECT COUNT(*) as count FROM rental_categories');
            console.log(`Rental Categories Count: ${rows[0].count}`);
        } else {
            console.log('FAILURE: rental_categories table NOT found.');
        }

        const [rowsRentals] = await connection.query('SELECT COUNT(*) as count FROM rentals');
        console.log(`Rentals Count: ${rowsRentals[0].count}`);

        await connection.end();
        console.log('--- VERIFICATION END ---');
    } catch (error) {
        console.error('Verification failed:', error.message);
    }
}

verify();
