require('dotenv').config();
const { pool } = require('../src/config/db.config');

async function migrate() {
    const conn = await pool.getConnection();
    try {
        console.log('🚀 Starting Migration: Units Expansion & Rentals Hierarchy Integration...');
        await conn.beginTransaction();

        // 1. Expand columns in units and subcategories
        console.log('1. Altering units.unit_category and subcategories.measurement_type to VARCHAR(50)...');
        await conn.query(`ALTER TABLE units MODIFY COLUMN unit_category VARCHAR(50) NOT NULL`);
        await conn.query(`ALTER TABLE subcategories MODIFY COLUMN measurement_type VARCHAR(50) NOT NULL DEFAULT 'weight'`);
        console.log('✓ Columns altered successfully.');

        // 2. Seed additional standard units
        console.log('2. Seeding standard quantity and volume units...');
        const newUnits = [
            // Quantity / Count
            { name: 'Piece', unit_category: 'selling_quantity' },
            { name: 'Nos', unit_category: 'selling_quantity' },
            { name: 'Box', unit_category: 'selling_quantity' },
            { name: 'Pack', unit_category: 'selling_quantity' },
            { name: 'Bundle', unit_category: 'selling_quantity' },
            { name: 'Carton', unit_category: 'selling_quantity' },
            { name: 'Roll', unit_category: 'selling_quantity' },
            { name: 'Set', unit_category: 'selling_quantity' },
            // Volume / Liquids
            { name: 'Liter', unit_category: 'selling_volume' },
            { name: 'Milliliter', unit_category: 'selling_volume' },
            { name: 'Gallon', unit_category: 'selling_volume' },
            { name: 'Drum', unit_category: 'selling_volume' },
            { name: 'Barrel', unit_category: 'selling_volume' },
            // Additional Length/Area & Duration
            { name: 'Sq Yard', unit_category: 'selling_length' },
            { name: 'Month', unit_category: 'renting_duration' },
            { name: 'Shift', unit_category: 'renting_duration' },
        ];

        for (const u of newUnits) {
            const [[existing]] = await conn.query('SELECT id FROM units WHERE name = ? AND unit_category = ?', [u.name, u.unit_category]);
            if (!existing) {
                await conn.query('INSERT INTO units (name, unit_category, status) VALUES (?, ?, "active")', [u.name, u.unit_category]);
                console.log(`  + Seeded unit: ${u.name} (${u.unit_category})`);
            }
        }

        // 3. Add hierarchy columns to rentals table if not present
        console.log('3. Updating rentals table schema with hierarchy columns...');
        const [rentalCols] = await conn.query('DESCRIBE rentals');
        const colNames = rentalCols.map(c => c.Field);

        if (!colNames.includes('main_category_id')) {
            await conn.query('ALTER TABLE rentals ADD COLUMN main_category_id INT NULL AFTER rental_category_id');
            await conn.query('ALTER TABLE rentals ADD CONSTRAINT fk_rentals_main_cat FOREIGN KEY (main_category_id) REFERENCES main_categories(id) ON DELETE SET NULL');
            console.log('  + Added main_category_id column to rentals');
        }
        if (!colNames.includes('category_id')) {
            await conn.query('ALTER TABLE rentals ADD COLUMN category_id INT NULL AFTER main_category_id');
            await conn.query('ALTER TABLE rentals ADD CONSTRAINT fk_rentals_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL');
            console.log('  + Added category_id column to rentals');
        }
        if (!colNames.includes('subcategory_id')) {
            await conn.query('ALTER TABLE rentals ADD COLUMN subcategory_id INT NULL AFTER category_id');
            await conn.query('ALTER TABLE rentals ADD CONSTRAINT fk_rentals_subcat FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL');
            console.log('  + Added subcategory_id column to rentals');
        }
        if (!colNames.includes('unit_id')) {
            await conn.query('ALTER TABLE rentals ADD COLUMN unit_id INT NULL AFTER subcategory_id');
            await conn.query('ALTER TABLE rentals ADD CONSTRAINT fk_rentals_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL');
            console.log('  + Added unit_id column to rentals');
        }

        // 4. Ensure Category "Machinery & Equipment Rental" exists under Construction
        console.log('4. Ensuring Category "Machinery & Equipment Rental" exists under Construction...');
        const [[constructionMain]] = await conn.query('SELECT id FROM main_categories WHERE name LIKE "%Construction%" LIMIT 1');
        const mainCatId = constructionMain ? constructionMain.id : 1;

        let [[machineryCat]] = await conn.query('SELECT id FROM categories WHERE name = "Machinery & Equipment Rental"');
        if (!machineryCat) {
            const [catResult] = await conn.query(
                'INSERT INTO categories (main_category_id, name, description, status) VALUES (?, ?, ?, "active")',
                [mainCatId, 'Machinery & Equipment Rental', 'Heavy machinery, earthmoving equipment, power tools, and formwork available for rent']
            );
            machineryCat = { id: catResult.insertId };
            console.log(`  + Created category "Machinery & Equipment Rental" with ID: ${machineryCat.id}`);
        } else {
            await conn.query('UPDATE categories SET main_category_id = ? WHERE id = ?', [mainCatId, machineryCat.id]);
            console.log(`  ✓ Category "Machinery & Equipment Rental" found with ID: ${machineryCat.id}`);
        }

        // 5. Ensure the 4 rental Subcategories exist under "Machinery & Equipment Rental"
        console.log('5. Ensuring rental subcategories exist under "Machinery & Equipment Rental"...');
        const rentalSubcats = [
            { name: 'Heavy Machinery', type: 'renting', measurement_type: 'duration', description: 'Excavators, backhoes, bulldozers, and cranes' },
            { name: 'Power Tools', type: 'renting', measurement_type: 'duration', description: 'Jackhammers, drillers, breakers, and cutting machines' },
            { name: 'Scaffolding & Formwork', type: 'renting', measurement_type: 'duration', description: 'H-frame scaffolding, staging sets, and props' },
            { name: 'Concrete Equipment', type: 'renting', measurement_type: 'duration', description: 'Concrete mixers, vibrators, and compactors' }
        ];

        const subcatMap = {};
        for (const sub of rentalSubcats) {
            let [[foundSub]] = await conn.query('SELECT id FROM subcategories WHERE name = ? AND category_id = ?', [sub.name, machineryCat.id]);
            if (!foundSub) {
                const [subRes] = await conn.query(
                    'INSERT INTO subcategories (category_id, name, description, type, measurement_type, status) VALUES (?, ?, ?, ?, ?, "active")',
                    [machineryCat.id, sub.name, sub.description, sub.type, sub.measurement_type]
                );
                subcatMap[sub.name] = subRes.insertId;
                console.log(`  + Created subcategory "${sub.name}" with ID: ${subRes.insertId}`);
            } else {
                await conn.query('UPDATE subcategories SET type = "renting", measurement_type = "duration" WHERE id = ?', [foundSub.id]);
                subcatMap[sub.name] = foundSub.id;
                console.log(`  ✓ Subcategory "${sub.name}" mapped with ID: ${foundSub.id}`);
            }
        }

        // 6. Get Days unit ID
        const [[daysUnit]] = await conn.query('SELECT id FROM units WHERE name = "Days" LIMIT 1');
        const daysUnitId = daysUnit ? daysUnit.id : null;

        // 7. Map existing rental records to the hierarchy
        console.log('6. Mapping rental records to hierarchy and units...');
        const rentalMappings = [
            { namePattern: '%JCB%', subName: 'Heavy Machinery' },
            { namePattern: '%Excavator%', subName: 'Heavy Machinery' },
            { namePattern: '%Jackhammer%', subName: 'Power Tools' },
            { namePattern: '%Mixer%', subName: 'Concrete Equipment' },
            { namePattern: '%Scaffolding%', subName: 'Scaffolding & Formwork' }
        ];

        for (const m of rentalMappings) {
            const subId = subcatMap[m.subName];
            if (subId) {
                await conn.query(
                    `UPDATE rentals 
                     SET main_category_id = ?, category_id = ?, subcategory_id = ?, unit_id = ? 
                     WHERE name LIKE ?`,
                    [mainCatId, machineryCat.id, subId, daysUnitId, m.namePattern]
                );
                console.log(`  ✓ Mapped rentals matching "${m.namePattern}" -> Subcategory: ${m.subName} (#${subId})`);
            }
        }

        // 8. Also ensure matching product records exist in products table so that GET /api/v1/products?subcategory_id=... returns them!
        console.log('7. Syncing rental assets into unified products catalog...');
        const [allRentals] = await conn.query('SELECT * FROM rentals');
        for (const r of allRentals) {
            if (!r.subcategory_id) continue;
            const [[existingProd]] = await conn.query('SELECT id FROM products WHERE name = ?', [r.name]);
            const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            if (!existingProd) {
                await conn.query(
                    `INSERT INTO products (category_id, subcategory_id, unit_id, name, slug, description, price, stock, image, status, featured)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [r.category_id, r.subcategory_id, r.unit_id || daysUnitId, r.name, `${slug}-${Date.now()}`, r.description, r.price_per_day, 10, r.image, 'active', r.featured || 0]
                );
                console.log(`  + Synced rental "${r.name}" to products catalog.`);
            } else {
                await conn.query(
                    `UPDATE products 
                     SET category_id = ?, subcategory_id = ?, unit_id = ?, price = ?, image = ?, description = ? 
                     WHERE id = ?`,
                    [r.category_id, r.subcategory_id, r.unit_id || daysUnitId, r.price_per_day, r.image, r.description, existingProd.id]
                );
                console.log(`  ✓ Updated synced product "${r.name}" (#${existingProd.id}).`);
            }
        }

        await conn.commit();
        console.log('✅ Migration & Hierarchy Integration completed successfully!');
        process.exit(0);
    } catch (error) {
        await conn.rollback();
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        conn.release();
    }
}

migrate();
