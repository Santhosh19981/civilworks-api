const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function seedBuildRunData() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'civilworks'
        });

        console.log('Connected. Emptying existing home_services...');
        await connection.execute('TRUNCATE TABLE home_services');

        const services = [
            {
                type: 'Categories',
                title: 'Interiors',
                subtitle: 'Modular kitchens, wardrobes',
                icon: 'bed-outline',
                related_ids: '',
                display_order: 1,
                status: 'active'
            },
            {
                type: 'Categories',
                title: 'Construction',
                subtitle: 'Cement, steel, bricks',
                icon: 'home-outline',
                related_ids: '',
                display_order: 2,
                status: 'active'
            },
            {
                type: 'Categories',
                title: 'Decor',
                subtitle: 'Paints, wallpapers, lighting',
                icon: 'color-palette-outline',
                related_ids: '',
                display_order: 3,
                status: 'active'
            },
            {
                type: 'Categories',
                title: 'Smart Home',
                subtitle: 'Locks, cameras, automation',
                icon: 'hardware-chip-outline',
                related_ids: '',
                display_order: 4,
                status: 'active'
            },
            {
                type: 'Rental',
                title: 'Plumbing',
                subtitle: 'Pipes, fittings, tools',
                icon: 'water-outline',
                related_ids: '',
                display_order: 5,
                status: 'active'
            },
            {
                type: 'Helpers',
                title: 'Electrical',
                subtitle: 'Wires, switches, hires',
                icon: 'flash-outline',
                related_ids: '',
                display_order: 6,
                status: 'active'
            }
        ];

        console.log('Inserting BuildRun categories...');
        for (const s of services) {
            await connection.execute(
                'INSERT INTO home_services (type, title, subtitle, icon, related_ids, display_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [s.type, s.title, s.subtitle, s.icon, s.related_ids, s.display_order, s.status]
            );
        }

        console.log('Successfully seeded BuildRun data!');

    } catch (error) {
        console.error('Error seeding data:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
        process.exit();
    }
}

seedBuildRunData();
