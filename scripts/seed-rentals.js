const mysql = require('mysql2/promise');

const rentalCategories = [
    { name: 'Heavy Machinery', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { name: 'Power Tools', icon: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.7-3.7a1 1 0 000-1.4l-1.6-1.6a1 1 0 00-1.4 0l-3.7 3.7z' },
    { name: 'Scaffolding & Formwork', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { name: 'Concrete Equipment', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' }
];

const rentals = [
    {
        categoryName: 'Heavy Machinery',
        name: 'JCB 3DX Backhoe Loader',
        mobile: '+91 9876543210',
        description: 'High-performance backhoe loader for excavation and loading tasks.',
        price_per_day: 5500.00,
        image: 'https://images.unsplash.com/photo-1579412691515-6807865f375b?auto=format&fit=crop&q=80&w=800'
    },
    {
        categoryName: 'Heavy Machinery',
        name: 'Caterpillar 320 GC Excavator',
        mobile: '+91 9876543210',
        description: 'Large hydraulic excavator for heavy-duty earthmoving and trenching.',
        price_per_day: 12500.00,
        image: 'https://images.unsplash.com/photo-1541625602330-2277a1cd1f59?auto=format&fit=crop&q=80&w=800'
    },
    {
        categoryName: 'Power Tools',
        name: 'Bosch Professional Jackhammer',
        mobile: '+91 9876543211',
        description: 'Heavy-duty demolition hammer for breaking concrete and asphalt.',
        price_per_day: 850.00,
        image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=800'
    },
    {
        categoryName: 'Concrete Equipment',
        name: 'Concrete Mixer 10/7 (Diesel)',
        mobile: '+91 9876543212',
        description: 'Robust concrete mixer for on-site mixing of cement and aggregates.',
        price_per_day: 1800.00,
        image: 'https://images.unsplash.com/photo-1533038590840-1cde6e668a91?auto=format&fit=crop&q=80&w=800'
    },
    {
        categoryName: 'Scaffolding & Formwork',
        name: 'H-Frame Scaffolding Set',
        mobile: '+91 9876543213',
        description: 'Standard H-frame scaffolding for building access and work at heights.',
        price_per_day: 60.00,
        image: 'https://images.unsplash.com/photo-1582298538104-fe2e74c27f59?auto=format&fit=crop&q=80&w=800'
    }
];

async function seed() {
    const connection = await mysql.createConnection({
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_qa'
    });

    try {
        console.log('Clearing existing rental data...');
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('TRUNCATE TABLE rentals');
        await connection.query('TRUNCATE TABLE rental_categories');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Seeding rental categories...');
        const categoryMap = {};
        for (const cat of rentalCategories) {
            const [result] = await connection.query(
                'INSERT INTO rental_categories (name, icon) VALUES (?, ?)',
                [cat.name, cat.icon]
            );
            categoryMap[cat.name] = result.insertId;
            console.log(`Inserted Category: ${cat.name}`);
        }

        console.log('Seeding rentals...');
        for (const rental of rentals) {
            const categoryId = categoryMap[rental.categoryName];
            await connection.query(
                'INSERT INTO rentals (rental_category_id, name, mobile, description, price_per_day, image) VALUES (?, ?, ?, ?, ?, ?)',
                [categoryId, rental.name, rental.mobile, rental.description, rental.price_per_day, rental.image]
            );
            console.log(`Inserted Rental: ${rental.name}`);
        }

        console.log('Seeding completed successfully.');
    } catch (error) {
        console.error('Seeding failed:', error);
    } finally {
        await connection.end();
    }
}

seed();
