const mysql = require('mysql2/promise');

async function migrate() {
    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_qa'
    };

    try {
        const connection = await mysql.createConnection(config);
        console.log('Connected to QA database.');

        console.log('Creating helper_members table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS helper_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                helper_id INT NOT NULL,
                experience VARCHAR(100),
                mobile VARCHAR(20),
                image VARCHAR(255),
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (helper_id) REFERENCES helpers(id) ON DELETE CASCADE
            )
        `);
        console.log('Table helper_members created successfully.');

        await connection.end();
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
