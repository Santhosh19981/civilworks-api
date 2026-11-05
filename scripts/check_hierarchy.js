const { pool } = require('../src/config/db.config');

async function run() {
    try {
        console.log('=== MAIN CATEGORIES ===');
        const [mains] = await pool.execute('SELECT id, name FROM main_categories ORDER BY id');
        console.table(mains);

        console.log('=== CATEGORIES ===');
        const [cats] = await pool.execute(`
            SELECT c.id, c.name, c.main_category_id, mc.name as main_category_name 
            FROM categories c 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id 
            ORDER BY c.main_category_id, c.id
        `);
        console.table(cats);

        console.log('=== SUBCATEGORIES ===');
        const [subs] = await pool.execute(`
            SELECT s.id, s.name, s.category_id, c.name as category_name, c.main_category_id, s.type, s.measurement_type 
            FROM subcategories s 
            LEFT JOIN categories c ON s.category_id = c.id 
            ORDER BY c.main_category_id, s.category_id, s.id
        `);
        console.table(subs);

        console.log('=== PRODUCTS SAMPLE MAPPING CHECK ===');
        const [prods] = await pool.execute(`
            SELECT p.id, p.name, p.category_id, c.name as cat_name, c.main_category_id, mc.name as main_cat_name, p.subcategory_id, s.name as sub_name, s.category_id as sub_cat_id
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id
            LEFT JOIN subcategories s ON p.subcategory_id = s.id 
            WHERE p.category_id != s.category_id OR c.main_category_id IS NULL OR p.category_id IS NULL OR p.subcategory_id IS NULL
        `);
        console.log('Misaligned products (where p.category_id != s.category_id):', prods.length);
        if (prods.length > 0) {
            console.table(prods.slice(0, 15));
        }

        console.log('=== HELPERS MAPPING CHECK ===');
        const [helpers] = await pool.execute(`
            SELECT * FROM helpers LIMIT 10
        `);
        console.table(helpers);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

run();
