require('dotenv').config();
const { pool } = require('../src/config/db.config');

async function check() {
    try {
        const [rentingProducts] = await pool.query(`
            SELECT p.id, p.name, p.category_id, p.subcategory_id, p.unit_id, s.name as sub_name, s.type 
            FROM products p 
            LEFT JOIN subcategories s ON p.subcategory_id = s.id 
            WHERE s.type = 'renting'
        `);
        console.log('PRODUCTS WITH RENTING SUBCATEGORY:', rentingProducts);

        const [rentalsCols] = await pool.query('DESCRIBE rentals');
        console.log('RENTALS COLUMNS:', rentalsCols.map(c => ({ Field: c.Field, Type: c.Type })));

        const [rentalCats] = await pool.query('SELECT * FROM rental_categories');
        console.log('RENTAL CATEGORIES:', rentalCats);

        const [rentals] = await pool.query('SELECT * FROM rentals');
        console.log('RENTALS COUNT:', rentals.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
