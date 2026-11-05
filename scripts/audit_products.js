require('dotenv').config();
const { pool } = require('../src/config/db.config');

async function audit() {
    try {
        const [subcats] = await pool.query('SELECT s.id, s.name, s.category_id, s.type, s.measurement_type, c.name as cat_name FROM subcategories s JOIN categories c ON s.category_id = c.id');
        console.log('--- SUBCATEGORIES ---');
        subcats.forEach(s => console.log(`#${s.id} [${s.cat_name}] ${s.name} (${s.type} - ${s.measurement_type})`));

        const [prods] = await pool.query('SELECT p.id, p.name, p.category_id, p.subcategory_id, p.unit_id, u.name as unit_name, s.name as sub_name, c.name as cat_name FROM products p LEFT JOIN subcategories s ON p.subcategory_id = s.id LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN units u ON p.unit_id = u.id ORDER BY p.id');
        console.log('\n--- TOTAL PRODUCTS:', prods.length);
        const withoutSub = prods.filter(p => !p.subcategory_id);
        const withoutUnit = prods.filter(p => !p.unit_id);
        console.log('Products without subcategory:', withoutSub.length);
        console.log('Products without unit:', withoutUnit.length);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

audit();
