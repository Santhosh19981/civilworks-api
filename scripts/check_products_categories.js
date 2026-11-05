require('dotenv').config();
const { pool } = require('../src/config/db.config');

async function check() {
    try {
        const [categories] = await pool.query('SELECT c.id, c.name, c.main_category_id, mc.name as main_name FROM categories c LEFT JOIN main_categories mc ON c.main_category_id = mc.id');
        console.log('CATEGORIES:', categories);

        const [subcategories] = await pool.query('SELECT s.id, s.name, s.category_id, s.type, s.measurement_type, c.name as cat_name FROM subcategories s LEFT JOIN categories c ON s.category_id = c.id');
        console.log('SUBCATEGORIES COUNT:', subcategories.length);
        console.log('RENTING SUBCATEGORIES:', subcategories.filter(s => s.type === 'renting'));

        const [jcb] = await pool.query('SELECT p.id, p.name, p.category_id, p.subcategory_id, p.unit_id, p.price, p.status FROM products p WHERE p.name LIKE "%JCB%" OR p.name LIKE "%Caterpillar%"');
        console.log('JCB/CAT IN PRODUCTS:', jcb);

        const [rentals] = await pool.query('SELECT r.id, r.name, r.main_category_id, r.category_id, r.subcategory_id, r.unit_id FROM rentals r');
        console.log('RENTALS:', rentals);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
