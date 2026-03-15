const mysql = require('mysql2/promise');
async function run() {
  try {
    const conn = await mysql.createConnection({
      host: '157.173.222.55',
      user: 'civilworks_user',
      password: 'Civilworks@123',
      database: 'civilworks_qa'
    });
    console.log("Connected to DB.");

    const [tables] = await conn.query('SHOW TABLES');
    console.log("Tables:", tables);

    const [descCat] = await conn.query('DESCRIBE categories');
    console.log("Categories Schema:", descCat);

    const [descProd] = await conn.query('DESCRIBE products');
    console.log("Products Schema:", descProd);

    process.exit(0);
  } catch(e) {
    console.error("Fatal Error:", e);
    process.exit(1);
  }
}
run();
