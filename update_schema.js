const mysql = require('mysql2/promise');
const conf = require('./src/config/app.config.js');

async function run() {
    const p = mysql.createPool({
        host: conf.db.host,
        user: conf.db.user,
        password: conf.db.password,
        database: conf.db.name
    });

    try {
        console.log('Modifying orders table...');
        await p.query("ALTER TABLE orders ADD COLUMN order_type ENUM('product', 'service', 'rental', 'helper') DEFAULT 'product' AFTER address_id;");
        
        console.log('Modifying order_items table...');
        await p.query("ALTER TABLE order_items MODIFY product_id INT NULL;");
        await p.query("ALTER TABLE order_items ADD COLUMN service_id INT NULL AFTER product_id, ADD COLUMN rental_id INT NULL AFTER service_id, ADD COLUMN helper_id INT NULL AFTER rental_id;");
        
        console.log('Schema updated successfully.');
    } catch(e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

run();
