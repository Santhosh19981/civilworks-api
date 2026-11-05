const mysql = require('mysql2/promise');
const config = require('../src/config/app.config');

async function migrate() {
    console.log("Connecting to database:", config.db.name);
    const conn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.name
    });

    try {
        console.log("Starting safe schema migration...");

        // 1. Table: main_categories
        await conn.query(`
            CREATE TABLE IF NOT EXISTS main_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT NULL,
                image VARCHAR(255) NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("✓ Table 'main_categories' verified.");

        // Helper to check if column exists
        async function columnExists(tableName, columnName) {
            const [rows] = await conn.query(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [config.db.name, tableName, columnName]
            );
            return rows.length > 0;
        }

        // Helper to check if foreign key exists
        async function fkExists(tableName, fkName) {
            const [rows] = await conn.query(
                `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
                [config.db.name, tableName, fkName]
            );
            return rows.length > 0;
        }

        // 2. Modify categories
        if (!(await columnExists('categories', 'main_category_id'))) {
            await conn.query(`ALTER TABLE categories ADD COLUMN main_category_id INT NULL AFTER id`);
            console.log("✓ Added 'main_category_id' column to 'categories'.");
        }
        if (!(await columnExists('categories', 'description'))) {
            await conn.query(`ALTER TABLE categories ADD COLUMN description TEXT NULL AFTER name`);
            console.log("✓ Added 'description' column to 'categories'.");
        }
        if (!(await fkExists('categories', 'fk_category_main'))) {
            try {
                await conn.query(`ALTER TABLE categories ADD CONSTRAINT fk_category_main FOREIGN KEY (main_category_id) REFERENCES main_categories(id) ON DELETE RESTRICT`);
                console.log("✓ Added FK 'fk_category_main' to 'categories'.");
            } catch (err) {
                console.warn("Notice adding fk_category_main:", err.message);
            }
        }

        // 3. Modify subcategories
        if (!(await columnExists('subcategories', 'description'))) {
            await conn.query(`ALTER TABLE subcategories ADD COLUMN description TEXT NULL AFTER name`);
            console.log("✓ Added 'description' column to 'subcategories'.");
        }
        if (!(await columnExists('subcategories', 'type'))) {
            await conn.query(`ALTER TABLE subcategories ADD COLUMN type ENUM('selling', 'renting') NOT NULL DEFAULT 'selling' AFTER description`);
            console.log("✓ Added 'type' column to 'subcategories'.");
        }
        if (!(await columnExists('subcategories', 'measurement_type'))) {
            await conn.query(`ALTER TABLE subcategories ADD COLUMN measurement_type ENUM('weight', 'length', 'duration') NOT NULL DEFAULT 'weight' AFTER type`);
            console.log("✓ Added 'measurement_type' column to 'subcategories'.");
        }

        // 4. Table: units
        await conn.query(`
            CREATE TABLE IF NOT EXISTS units (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                unit_category ENUM('selling_weight', 'selling_length', 'renting_duration') NOT NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("✓ Table 'units' verified.");

        // 5. Modify products
        if (!(await columnExists('products', 'unit_id'))) {
            await conn.query(`ALTER TABLE products ADD COLUMN unit_id INT NULL AFTER subcategory_id`);
            console.log("✓ Added 'unit_id' column to 'products'.");
        }
        if (!(await fkExists('products', 'fk_product_unit'))) {
            try {
                await conn.query(`ALTER TABLE products ADD CONSTRAINT fk_product_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT`);
                console.log("✓ Added FK 'fk_product_unit' to 'products'.");
            } catch (err) {
                console.warn("Notice adding fk_product_unit:", err.message);
            }
        }

        // 6. Table: vendors and vendor_subcategories
        await conn.query(`
            CREATE TABLE IF NOT EXISTS vendors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                mobile VARCHAR(20) NOT NULL,
                email VARCHAR(255) NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("✓ Table 'vendors' verified.");

        await conn.query(`
            CREATE TABLE IF NOT EXISTS vendor_subcategories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL,
                subcategory_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
                FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE CASCADE,
                UNIQUE KEY unique_vendor_sub (vendor_id, subcategory_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log("✓ Table 'vendor_subcategories' verified.");

        // 7. Modify cart_items & order_items
        if (!(await columnExists('cart_items', 'rental_duration'))) {
            await conn.query(`ALTER TABLE cart_items ADD COLUMN rental_duration INT NULL DEFAULT NULL AFTER quantity`);
            console.log("✓ Added 'rental_duration' column to 'cart_items'.");
        }
        if (!(await columnExists('cart_items', 'unit_id'))) {
            await conn.query(`ALTER TABLE cart_items ADD COLUMN unit_id INT NULL DEFAULT NULL AFTER rental_duration`);
            console.log("✓ Added 'unit_id' column to 'cart_items'.");
        }

        if (!(await columnExists('order_items', 'unit_name'))) {
            await conn.query(`ALTER TABLE order_items ADD COLUMN unit_name VARCHAR(50) NULL AFTER price`);
            console.log("✓ Added 'unit_name' column to 'order_items'.");
        }
        if (!(await columnExists('order_items', 'rental_duration'))) {
            await conn.query(`ALTER TABLE order_items ADD COLUMN rental_duration INT NULL DEFAULT NULL AFTER unit_name`);
            console.log("✓ Added 'rental_duration' column to 'order_items'.");
        }
        if (!(await columnExists('order_items', 'product_type'))) {
            await conn.query(`ALTER TABLE order_items ADD COLUMN product_type ENUM('selling', 'renting') DEFAULT 'selling' AFTER rental_duration`);
            console.log("✓ Added 'product_type' column to 'order_items'.");
        }

        // ==========================================
        // BASELINE DATA SEEDING & RECORD MIGRATION
        // ==========================================
        console.log("\nEnsuring baseline data and relationships...");

        // Ensure default Main Categories exist
        const mainCatData = [
            { name: "Construction", description: "Heavy civil building materials, equipment, tools & site essentials", status: "active" },
            { name: "Interiors", description: "Interior fittings, architectural hardware, kitchen fittings & finishing", status: "active" }
        ];

        for (const mc of mainCatData) {
            const [existing] = await conn.query('SELECT id FROM main_categories WHERE name = ?', [mc.name]);
            if (existing.length === 0) {
                await conn.query('INSERT INTO main_categories (name, description, status) VALUES (?, ?, ?)', [mc.name, mc.description, mc.status]);
                console.log(`✓ Inserted main category: ${mc.name}`);
            }
        }

        const [[constructionRow]] = await conn.query("SELECT id FROM main_categories WHERE name = 'Construction'");
        const [[interiorsRow]] = await conn.query("SELECT id FROM main_categories WHERE name = 'Interiors'");
        const constructionId = constructionRow.id;
        const interiorsId = interiorsRow.id;

        // Ensure default Units exist
        const defaultUnits = [
            // SELLING / WEIGHT
            { name: 'Grams', unit_category: 'selling_weight' },
            { name: 'KG', unit_category: 'selling_weight' },
            { name: 'Ton', unit_category: 'selling_weight' },
            // SELLING / LENGTH
            { name: 'Meters', unit_category: 'selling_length' },
            { name: 'Sq Feet', unit_category: 'selling_length' },
            { name: 'Feet', unit_category: 'selling_length' },
            { name: 'Centimeters', unit_category: 'selling_length' },
            // RENTING / DURATION
            { name: 'Hours', unit_category: 'renting_duration' },
            { name: 'Days', unit_category: 'renting_duration' },
            { name: 'Weeks', unit_category: 'renting_duration' }
        ];

        for (const u of defaultUnits) {
            const [existing] = await conn.query('SELECT id FROM units WHERE name = ? AND unit_category = ?', [u.name, u.unit_category]);
            if (existing.length === 0) {
                await conn.query('INSERT INTO units (name, unit_category, status) VALUES (?, ?, ?)', [u.name, u.unit_category, 'active']);
                console.log(`✓ Inserted unit: ${u.name} (${u.unit_category})`);
            }
        }

        // Fetch unit IDs for linking
        const [[kgUnit]] = await conn.query("SELECT id FROM units WHERE name = 'KG' AND unit_category = 'selling_weight'");
        const [[meterUnit]] = await conn.query("SELECT id FROM units WHERE name = 'Meters' AND unit_category = 'selling_length'");
        const [[daysUnit]] = await conn.query("SELECT id FROM units WHERE name = 'Days' AND unit_category = 'renting_duration'");

        // Map existing categories to Main Categories
        // Categories: 'Civil & Interiors', 'Furniture & Architectural Hardware', 'Electrical', 'Plumbing', 'General Hardware & Tools'
        await conn.query('UPDATE categories SET main_category_id = ? WHERE name = ?', [constructionId, 'Civil & Interiors']);
        await conn.query('UPDATE categories SET main_category_id = ? WHERE name = ?', [interiorsId, 'Furniture & Architectural Hardware']);
        await conn.query('UPDATE categories SET main_category_id = ? WHERE name = ?', [constructionId, 'Electrical']);
        await conn.query('UPDATE categories SET main_category_id = ? WHERE name = ?', [constructionId, 'Plumbing']);
        await conn.query('UPDATE categories SET main_category_id = ? WHERE name = ?', [constructionId, 'General Hardware & Tools']);

        // In case any categories still have null main_category_id, set to Construction
        await conn.query('UPDATE categories SET main_category_id = ? WHERE main_category_id IS NULL', [constructionId]);
        console.log("✓ Categories linked to Main Categories.");

        // Update subcategories with types and measurement_types
        // Weight subcategories:
        await conn.query(`
            UPDATE subcategories 
            SET type = 'selling', measurement_type = 'weight' 
            WHERE name IN ('Cement', 'Tiling', 'Painting', 'Waterproofing', 'Adhesives (Fevicol)', 'Safety Equipment')
        `);

        // Length subcategories:
        await conn.query(`
            UPDATE subcategories 
            SET type = 'selling', measurement_type = 'length' 
            WHERE name IN ('Wires', 'CPVC Pipes & Fittings', 'Conduits & GI Boxes', 'Measuring Tools', 'Plywood, MDF & HDHMR')
        `);

        // Renting duration subcategories:
        await conn.query(`
            UPDATE subcategories 
            SET type = 'renting', measurement_type = 'duration' 
            WHERE name IN ('Construction Tools', 'Heavy Machinery', 'Power Tools', 'Concrete Equipment', 'Scaffolding & Formwork')
        `);

        // Ensure any remaining subcategories have proper type
        await conn.query(`UPDATE subcategories SET type = 'selling', measurement_type = 'weight' WHERE type IS NULL OR measurement_type IS NULL`);
        console.log("✓ Subcategories updated with type and measurement_type.");

        // Associate existing products with appropriate unit_id
        if (kgUnit && meterUnit && daysUnit) {
            // Products in length subcategories
            await conn.query(`
                UPDATE products p
                JOIN subcategories s ON p.subcategory_id = s.id
                SET p.unit_id = ?
                WHERE s.measurement_type = 'length' AND (p.unit_id IS NULL OR p.unit_id = 0)
            `, [meterUnit.id]);

            // Products in renting subcategories
            await conn.query(`
                UPDATE products p
                JOIN subcategories s ON p.subcategory_id = s.id
                SET p.unit_id = ?
                WHERE s.type = 'renting' AND (p.unit_id IS NULL OR p.unit_id = 0)
            `, [daysUnit.id]);

            // Remaining products -> KG
            await conn.query(`
                UPDATE products p
                SET p.unit_id = ?
                WHERE p.unit_id IS NULL OR p.unit_id = 0
            `, [kgUnit.id]);

            console.log("✓ Products associated with dynamic units.");
        }

        console.log("\nMigration & baseline data completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Migration error:", err);
        process.exit(1);
    }
}

migrate();
