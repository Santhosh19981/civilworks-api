const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
    const logFile = 'D:\\Civil works applicaitons\\civilworks-api\\compare_results.txt';
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\n');
    };

    fs.writeFileSync(logFile, '--- SCHEMA COMPARISON START ---\n');

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

        log('QA Tables: ' + qaTables.map(t => Object.values(t)[0]).join(', '));
        log('Prod Tables: ' + prodTables.map(t => Object.values(t)[0]).join(', '));

        const tablesToCheck = ['helpers', 'helper_members', 'helper_bookings'];
        for (const table of tablesToCheck) {
            log(`\n--- ${table} ---`);
            try {
                const [qaDesc] = await qa.query(`DESCRIBE ${table}`);
                log('QA Schema: ' + JSON.stringify(qaDesc));
            } catch (e) { log('QA: Table missing'); }
            
            try {
                const [prodDesc] = await prod.query(`DESCRIBE ${table}`);
                log('Prod Schema: ' + JSON.stringify(prodDesc));
            } catch (e) { log('Prod: Table missing'); }
        }

        await qa.end();
        await prod.end();
        log('--- SCHEMA COMPARISON END ---');
    } catch (e) {
        log('Error: ' + e.message);
    }
}
run();
