const mysql = require('mysql2/promise');

async function test() {
    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_db'
    };

    try {
        const connection = await mysql.createConnection(config);
        console.log('Successfully connected to civilworks_db');
        const [rows] = await connection.query('SHOW TABLES');
        console.log('Tables in civilworks_db:', rows.map(r => Object.values(r)[0]));
        await connection.end();
    } catch (error) {
        console.error('Failed to connect to civilworks_db:', error.message);
    }
}

test();
