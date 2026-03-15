const mysql = require('mysql2/promise');

async function run() {
    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123'
    };

    try {
        const qa = await mysql.createConnection({ ...config, database: 'civilworks_qa' });
        const prod = await mysql.createConnection({ ...config, database: 'civilworks_prod' });

        const [qaTables] = await qa.query('SHOW TABLES');
        const [prodTables] = await prod.query('SHOW TABLES');

        console.log('QA Tables:', qaTables.map(t => Object.values(t)[0]));
        console.log('Prod Tables:', prodTables.map(t => Object.values(t)[0]));

        const tablesToCheck = ['helpers', 'helper_members', 'helper_bookings'];
        for (const table of tablesToCheck) {
            console.log(`\n--- ${table} ---`);
            try {
                const [qaDesc] = await qa.query(`DESCRIBE ${table}`);
                console.log('QA Schema:', JSON.stringify(qaDesc));
            } catch (e) { console.log('QA: Table missing'); }
            
            try {
                const [prodDesc] = await prod.query(`DESCRIBE ${table}`);
                console.log('Prod Schema:', JSON.stringify(prodDesc));
            } catch (e) { console.log('Prod: Table missing'); }
        }

        await qa.end();
        await prod.end();
    } catch (e) {
        console.error(e);
    }
}
run();
