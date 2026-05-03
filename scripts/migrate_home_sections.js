const mysql = require('mysql2/promise');

async function run() {
  try {
    const conn = await mysql.createConnection({
      host: '157.173.222.55',
      user: 'civilworks_user',
      password: 'Civilworks@123',
      database: 'civilworks_qa'
    });

    console.log('Creating tables...');
    
    await conn.query(`
      CREATE TABLE IF NOT EXISTS home_sections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS home_section_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        section_id INT,
        item_id INT,
        item_type ENUM('product', 'rental'),
        order_index INT DEFAULT 0,
        FOREIGN KEY (section_id) REFERENCES home_sections(id) ON DELETE CASCADE
      )
    `);

    // Insert default sections if they don't exist
    const [rows] = await conn.query('SELECT * FROM home_sections');
    if (rows.length === 0) {
        await conn.query("INSERT INTO home_sections (name, title, order_index) VALUES ('Featured Products', 'Featured Products', 1)");
        await conn.query("INSERT INTO home_sections (name, title, order_index) VALUES ('Popular Rentals', 'Popular Rentals', 2)");
    }

    console.log('Tables created and default data inserted successfully');
    process.exit(0);
  } catch (e) {
    console.error('Error during migration:', e);
    process.exit(1);
  }
}

run();
