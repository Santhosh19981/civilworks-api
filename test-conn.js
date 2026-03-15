const mysql = require('mysql2/promise');
async function run() {
    try {
        console.log("Connecting...");
        const connection = await mysql.createConnection({
            host: '157.173.222.55',
            user: 'civilworks_user',
            password: 'Civilworks@123',
            database: 'civilworks_qa',
            connectTimeout: 10000
        });
        console.log("Connected!");
        const [rows] = await connection.query('SELECT 1');
        console.log("Query success!", rows);
        await connection.end();
        process.exit(0);
    } catch (e) {
        console.error("Connection failed:", e.message);
        process.exit(1);
    }
}
run();
