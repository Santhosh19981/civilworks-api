const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function verify() {
    const logFile = 'D:\\Civil works applicaitons\\civilworks-api\\sync_verify.txt';
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\n');
    };

    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_prod'
    };

    try {
        const connection = await mysql.createConnection(config);
        log('--- VERIFICATION START ---');
        
        const [tables] = await connection.query('SHOW TABLES LIKE "rental_categories"');
        if (tables.length > 0) {
            log('SUCCESS: rental_categories table exists.');
            const [rows] = await connection.query('SELECT COUNT(*) as count FROM rental_categories');
            log(`Rental Categories Count: ${rows[0].count}`);
        } else {
            log('FAILURE: rental_categories table NOT found.');
        }

        const [rowsRentals] = await connection.query('SELECT COUNT(*) as count FROM rentals');
        log(`Rentals Count: ${rowsRentals[0].count}`);

        await connection.end();
        log('--- VERIFICATION END ---');
    } catch (error) {
        log('Verification failed: ' + error.message);
    }
}

verify();
