const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_prod'
    });

    try {
        console.log("Updating schema...");

        // Revert parent_id from categories if it exists
        try {
            await connection.query('ALTER TABLE categories DROP CONSTRAINT fk_category_parent');
            console.log("Dropped category parent FK.");
        } catch(e) {}
        try {
            await connection.query('ALTER TABLE categories DROP COLUMN parent_id');
            console.log("Dropped parent_id column from categories.");
        } catch(e) {}

        // Create subcategories table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS subcategories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            )
        `);
        console.log("Table subcategories created or already exists.");

        // Add subcategory_id to products
        try {
            await connection.query('ALTER TABLE products ADD COLUMN subcategory_id INT NULL AFTER category_id');
            console.log("Column subcategory_id added to products.");
        } catch(e) {
            console.log("Column subcategory_id might already exist.");
        }

        try {
            await connection.query('ALTER TABLE products ADD CONSTRAINT fk_product_subcategory FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL');
            console.log("FK constraint fk_product_subcategory added.");
        } catch(e) {
            console.log("FK constraint fk_product_subcategory might already exist.");
        }

        console.log("Schema update complete!");
        process.exit(0);
    } catch(e) {
        console.error("Error updating schema:", e);
        process.exit(1);
    }
}
run();
