const { pool } = require('./src/config/db.config');

const setupTable = async () => {
    try {
        const query = `
        CREATE TABLE IF NOT EXISTS home_services (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type ENUM('Categories', 'Rental', 'Helpers') NOT NULL,
            title VARCHAR(255) NOT NULL,
            subtitle VARCHAR(255),
            icon VARCHAR(100),
            related_ids TEXT,
            display_order INT DEFAULT 0,
            status ENUM('active', 'inactive') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`;
        await pool.execute(query);
        console.log('home_services table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
};

setupTable();
