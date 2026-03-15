const mysql = require('mysql2/promise');
async function run() {
  try {
    const conn = await mysql.createConnection({
      host: '157.173.222.55',
      user: 'civilworks_user',
      password: 'Civilworks@123'
    });
    console.log("Connected to DB.");

    try {
        console.log("Checking if PROD is empty...");
        const [prodRows] = await conn.query('SELECT count(*) as count FROM civilworks_prod.categories');
        if (prodRows[0].count === 0) {
            console.log("PROD is empty, restoring from QA...");
            await conn.query('INSERT IGNORE INTO civilworks_prod.categories SELECT * FROM civilworks_qa.categories');
            console.log("PROD restored.");
        } else {
            console.log("PROD already has data. Skipping restore.");
        }
    } catch(e) {
        console.error("Error restoring PROD:", e.message);
    }
    
    console.log("Truncating QA categories...");
    await conn.query('TRUNCATE TABLE civilworks_qa.categories');
    console.log("QA truncated.");

    process.exit(0);
  } catch(e) {
    console.error("Fatal Error:", e);
    process.exit(1);
  }
}
run();
