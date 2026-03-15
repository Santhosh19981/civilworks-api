const mysql = require('mysql2/promise');

const helperServices = [
    { name: 'Mason' },
    { name: 'Electrician' },
    { name: 'Plumber' },
    { name: 'Carpenter' },
    { name: 'Painter' },
    { name: 'Tile Worker' },
    { name: 'Waterproofing Worker' },
    { name: 'Fabricator' },
    { name: 'Construction Labor' },
    { name: 'AC Technician' }
];

const helperMembers = [
    { name: 'Rajesh Kumar', service: 'Mason', mobile: '9876543210', experience: '8 Years' },
    { name: 'Suresh Reddy', service: 'Electrician', mobile: '9876543211', experience: '6 Years' },
    { name: 'Mahesh Patel', service: 'Plumber', mobile: '9876543212', experience: '7 Years' },
    { name: 'Ravi Sharma', service: 'Carpenter', mobile: '9876543213', experience: '5 Years' },
    { name: 'Imran Khan', service: 'Painter', mobile: '9876543214', experience: '6 Years' },
    { name: 'Arjun Singh', service: 'Tile Worker', mobile: '9876543215', experience: '4 Years' },
    { name: 'Manoj Kumar', service: 'Waterproofing Worker', mobile: '9876543216', experience: '5 Years' },
    { name: 'Ramesh Yadav', service: 'Construction Labor', mobile: '9876543217', experience: '3 Years' },
    { name: 'Deepak Verma', service: 'Electrician', mobile: '9876543218', experience: '4 Years' },
    { name: 'Ajay Patel', service: 'Carpenter', mobile: '9876543219', experience: '6 Years' },
    { name: 'Salman Sheikh', service: 'Painter', mobile: '9876543220', experience: '7 Years' },
    { name: 'Kiran Naik', service: 'Tile Worker', mobile: '9876543221', experience: '5 Years' },
    { name: 'Sunil Gupta', service: 'Plumber', mobile: '9876543222', experience: '8 Years' },
    { name: 'Rohit Sharma', service: 'Mason', mobile: '9876543223', experience: '10 Years' },
    { name: 'Naveen Kumar', service: 'AC Technician', mobile: '9876543224', experience: '6 Years' }
];

async function seed() {
    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123',
        database: 'civilworks_qa'
    };

    try {
        const connection = await mysql.createConnection(config);
        console.log('Connected to QA database.');

        console.log('Clearing existing data...');
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('TRUNCATE TABLE helper_members');
        await connection.query('TRUNCATE TABLE helpers');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Seeding Helper Services...');
        const serviceMap = {};
        for (const service of helperServices) {
            const [result] = await connection.query(
                'INSERT INTO helpers (service_name, price_per_day, status) VALUES (?, ?, ?)',
                [service.name, 500.00, 'active']
            );
            serviceMap[service.name] = result.insertId;
            console.log(`Inserted service: ${service.name} (ID: ${result.insertId})`);
        }

        console.log('Seeding Helper Members...');
        for (const member of helperMembers) {
            const helper_id = serviceMap[member.service];
            if (helper_id) {
                const image = `assets/helpers/${member.service.toLowerCase().replace(/ /g, '')}1.jpg`;
                await connection.query(
                    'INSERT INTO helper_members (name, helper_id, experience, mobile, image, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [member.name, helper_id, member.experience, member.mobile, image, 'active']
                );
                console.log(`Inserted member: ${member.name} for ${member.service}`);
            } else {
                console.warn(`Service not found for member: ${member.name} (${member.service})`);
            }
        }

        console.log('Seeding completed successfully.');
        await connection.end();
    } catch (error) {
        console.error('Seeding failed:', error);
    }
}

seed();
