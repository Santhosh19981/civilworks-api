const mysql = require('mysql2/promise');

async function migrate() {
    const config = {
        host: '157.173.222.55',
        user: 'civilworks_user',
        password: 'Civilworks@123'
    };

    const dbs = ['civilworks_qa', 'civilworks_prod'];

    for (const db of dbs) {
        console.log(`Migrating database: ${db}`);
        try {
            const connection = await mysql.createConnection({ ...config, database: db });

            // 1. Create helper_member_services table
            console.log(`Creating helper_member_services table in ${db}...`);
            await connection.query(`
                CREATE TABLE IF NOT EXISTS helper_member_services (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    helper_member_id INT NOT NULL,
                    helper_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (helper_member_id) REFERENCES helper_members(id) ON DELETE CASCADE,
                    FOREIGN KEY (helper_id) REFERENCES helpers(id) ON DELETE CASCADE
                )
            `);

            // 2. Transfer existing helper_id from helper_members to the new table
            console.log(`Transferring existing data in ${db}...`);
            const [members] = await connection.query('SELECT id, helper_id FROM helper_members WHERE helper_id IS NOT NULL');
            for (const member of members) {
                // Check if already exists to prevent duplicates if script rerun
                const [exists] = await connection.query(
                    'SELECT id FROM helper_member_services WHERE helper_member_id = ? AND helper_id = ?',
                    [member.id, member.helper_id]
                );
                if (exists.length === 0) {
                    await connection.query(
                        'INSERT INTO helper_member_services (helper_member_id, helper_id) VALUES (?, ?)',
                        [member.id, member.helper_id]
                    );
                }
            }

            console.log(`Successfully migrated ${db}`);
            await connection.end();
        } catch (error) {
            console.error(`Migration failed for ${db}:`, error);
        }
    }
}

migrate();
