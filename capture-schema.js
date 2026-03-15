const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
  try {
    const conn = await mysql.createConnection({
      host: '157.173.222.55',
      user: 'civilworks_user',
      password: 'Civilworks@123',
      database: 'civilworks_qa'
    });

    const [catCols] = await conn.query('SHOW COLUMNS FROM categories');
    const [prodCols] = await conn.query('SHOW COLUMNS FROM products');

    const output = {
        categories: catCols,
        products: prodCols
    };

    fs.writeFileSync('schema-output.json', JSON.stringify(output, null, 2), 'utf8');
    console.log("Schema written to schema-output.json");
    process.exit(0);
  } catch(e) {
    fs.writeFileSync('schema-error.txt', e.stack, 'utf8');
    process.exit(1);
  }
}
run();
