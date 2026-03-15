const mysql = require('mysql2/promise');

async function check() {
    const connection = await mysql.createConnection({
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_prod'
    });

    try {
        const [cats] = await connection.query('SELECT COUNT(*) as count FROM categories');
        const [subs] = await connection.query('SELECT COUNT(*) as count FROM subcategories');
        const [prods] = await connection.query('SELECT COUNT(*) as count FROM products');
        
        console.log(`Categories: ${cats[0].count}`);
        console.log(`Subcategories: ${subs[0].count}`);
        console.log(`Products: ${prods[0].count}`);

        const [sample] = await connection.query(`
            SELECT p.name as product, s.name as sub, c.name as cat 
            FROM products p 
            JOIN subcategories s ON p.subcategory_id = s.id 
            JOIN categories c ON p.category_id = c.id 
            LIMIT 5
        `);
        console.log('Sample data:', JSON.stringify(sample, null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
