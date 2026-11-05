const { pool } = require('../src/config/db.config');

async function run() {
    try {
        console.log('--- Checking helpers table structure ---');
        const [cols] = await pool.execute('DESCRIBE helpers');
        const colNames = cols.map(c => c.Field);

        if (!colNames.includes('main_category_id')) {
            console.log('Adding main_category_id to helpers...');
            await pool.execute('ALTER TABLE helpers ADD COLUMN main_category_id INT NULL');
        }

        if (!colNames.includes('category_id')) {
            console.log('Adding category_id to helpers...');
            await pool.execute('ALTER TABLE helpers ADD COLUMN category_id INT NULL');
        }

        if (!colNames.includes('subcategory_id')) {
            console.log('Adding subcategory_id to helpers...');
            await pool.execute('ALTER TABLE helpers ADD COLUMN subcategory_id INT NULL');
        }

        console.log('--- Assigning existing helpers to appropriate sectors ---');
        // Construction (main_category_id: 1)
        // Masons, Plumbers, Electricians, Painters, Tile Workers, Waterproofing, Fabricators, Construction Labor, AC Tech
        await pool.execute(`
            UPDATE helpers 
            SET main_category_id = 1, category_id = 1 
            WHERE service_name IN ('Mason', 'Plumber', 'Electrician', 'Painter', 'Tile Worker', 'Waterproofing Worker', 'Fabricator', 'Construction Labor', 'AC Technician')
        `);

        // Interiors (main_category_id: 2)
        // Carpenter
        await pool.execute(`
            UPDATE helpers 
            SET main_category_id = 2, category_id = 2 
            WHERE service_name IN ('Carpenter')
        `);

        console.log('--- Verification of helpers ---');
        const [rows] = await pool.execute(`
            SELECT h.id, h.service_name, h.main_category_id, mc.name as main_category_name 
            FROM helpers h 
            LEFT JOIN main_categories mc ON h.main_category_id = mc.id
        `);
        console.table(rows);

        console.log('Migration completed successfully!');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        process.exit(0);
    }
}

run();
