const { pool } = require('../src/config/db.config');

async function migrate() {
    console.log('Starting category_main_categories migration...');
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Create junction table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS category_main_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category_id INT NOT NULL,
                main_category_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_cat_main (category_id, main_category_id),
                CONSTRAINT fk_cmc_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
                CONSTRAINT fk_cmc_main FOREIGN KEY (main_category_id) REFERENCES main_categories(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✓ Table category_main_categories verified/created.');

        // 2. Seed existing associations from categories table
        const [result] = await connection.query(`
            INSERT IGNORE INTO category_main_categories (category_id, main_category_id)
            SELECT id, main_category_id FROM categories WHERE main_category_id IS NOT NULL;
        `);
        console.log(`✓ Seeded ${result.affectedRows} existing category associations into category_main_categories.`);

        await connection.commit();
        console.log('✓ Migration completed successfully!');

        // Query and display existing mappings
        const [mappings] = await connection.query(`
            SELECT cmc.id, c.name as category_name, mc.name as main_category_name, cmc.category_id, cmc.main_category_id
            FROM category_main_categories cmc
            JOIN categories c ON cmc.category_id = c.id
            JOIN main_categories mc ON cmc.main_category_id = mc.id
            ORDER BY cmc.category_id, cmc.main_category_id
        `);
        console.log('Current category_main_categories mappings:', mappings);

        process.exit(0);
    } catch (err) {
        await connection.rollback();
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        connection.release();
    }
}

migrate();
