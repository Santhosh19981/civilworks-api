const mysql = require('mysql2/promise');

async function listDatabases() {
    const connection = await mysql.createConnection({
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123'
    });

    try {
        const [rows] = await connection.query('SHOW DATABASES');
        console.log('Available Databases:');
        rows.forEach(row => console.log(`- ${row.Database}`));
    } catch (error) {
        console.error('Error listing databases:', error);
    } finally {
        await connection.end();
    }
}

listDatabases();
