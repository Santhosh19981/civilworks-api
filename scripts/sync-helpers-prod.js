const mysql = require('mysql2/promise');
const fs = require('fs');

async function sync() {
    const logFile = 'D:\\Civil works applicaitons\\civilworks-api\\sync_helpers_prod.txt';
    const log = (msg) => {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\n');
    };

    fs.writeFileSync(logFile, '--- HELPERS SYNC START ---\n');

    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123'
    };

    try {
        log('Connecting to civilworks_qa...');
        const qaConn = await mysql.createConnection({ ...config, database: 'civilworks_qa' });
        log('Connected to QA.');

        log('Connecting to civilworks_prod...');
        const prodConn = await mysql.createConnection({ ...config, database: 'civilworks_prod' });
        log('Connected to Prod.');

        log('Ensuring tables exist in Prod...');
        // Table: helpers
        await prodConn.query(`
            CREATE TABLE IF NOT EXISTS helpers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                service_name VARCHAR(255) NOT NULL,
                image VARCHAR(255),
                mobile VARCHAR(20),
                description TEXT,
                price_per_day DECIMAL(10,2) NOT NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Table: helper_members
        await prodConn.query(`
            CREATE TABLE IF NOT EXISTS helper_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                helper_id INT NOT NULL,
                experience VARCHAR(100),
                mobile VARCHAR(20),
                image VARCHAR(255),
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (helper_id) REFERENCES helpers(id) ON DELETE CASCADE
            )
        `);
        log('Schema ensured.');

        log('Clearing Prod data...');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 0');
        await prodConn.query('TRUNCATE TABLE helper_members');
        await prodConn.query('TRUNCATE TABLE helpers');
        await prodConn.query('SET FOREIGN_KEY_CHECKS = 1');
        log('Prod data cleared.');

        log('Fetching data from QA...');
        const [services] = await qaConn.query('SELECT * FROM helpers');
        const [members] = await qaConn.query('SELECT * FROM helper_members');
        log(`Fetched ${services.length} services and ${members.length} members.`);

        log('Syncing services...');
        for (const s of services) {
            await prodConn.query(
                'INSERT INTO helpers (id, service_name, image, mobile, description, price_per_day, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [s.id, s.service_name, s.image, s.mobile, s.description, s.price_per_day, s.status, s.created_at, s.updated_at]
            );
        }
        log('Services synced.');

        log('Syncing helper members...');
        for (const m of members) {
            await prodConn.query(
                'INSERT INTO helper_members (id, name, helper_id, experience, mobile, image, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [m.id, m.name, m.helper_id, m.experience, m.mobile, m.image, m.status, m.created_at, m.updated_at]
            );
        }
        log('Members synced.');

        log('--- HELPERS SYNC SUCCESS ---');
        await qaConn.end();
        await prodConn.end();
    } catch (error) {
        log('--- HELPERS SYNC ERROR ---');
        log(error.stack);
    }
}

sync();
