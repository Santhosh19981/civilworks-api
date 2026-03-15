const mysql = require('mysql2/promise');
const config = {
    host: '157.173.222.55',
    user: 'civilworks_user',
    password: 'Civilworks@123',
    database: 'civilworks_qa'
};

async function migrate() {
    const connection = await mysql.createConnection(config);
    try {
        console.log('Creating rental_categories table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS rental_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                icon VARCHAR(255),
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log('Checking for rental_category_id in rentals table...');
        const [columns] = await connection.query('SHOW COLUMNS FROM rentals LIKE "rental_category_id"');
        if (columns.length === 0) {
            console.log('Adding rental_category_id to rentals table...');
            await connection.query('ALTER TABLE rentals ADD COLUMN rental_category_id INT, ADD FOREIGN KEY (rental_category_id) REFERENCES rental_categories(id)');
        } else {
            console.log('rental_category_id already exists in rentals table.');
        }

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
