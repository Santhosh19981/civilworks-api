const mysql = require('mysql2/promise');
async function run() {
  try {
    const conn = await mysql.createConnection({
      host: '157.173.222.55',
      user: 'civilworks_user',
      password: 'Civilworks@123',
      database: 'civilworks_prod'
    });
    console.log("Connected to Prod DB.");

    const [tables] = await conn.query('SHOW TABLES LIKE "rental_categories"');
    console.log("Rental Categories Table:", tables);

    if (tables.length > 0) {
        const [rows] = await conn.query('SELECT name FROM rental_categories');
        console.log("Category Names:", rows.map(r => r.name));
    }

    const [rentals] = await conn.query('SELECT name FROM rentals LIMIT 5');
    console.log("Sample Rentals:", rentals.map(r => r.name));

    process.exit(0);
  } catch(e) {
    console.error("Fatal Error:", e);
    process.exit(1);
  }
}
run();
