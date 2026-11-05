require('dotenv').config();
const { pool } = require('../src/config/db.config');

async function fixData() {
    const conn = await pool.getConnection();
    try {
        console.log('🚀 Starting Data Clean-Up: Subcategory Types, Units & Product Associations...');
        await conn.beginTransaction();

        // 1. Update subcategories that are naturally piece/quantity-based
        console.log('1. Updating subcategory measurement types to quantity and volume...');
        const quantitySubcats = [
            'Door Locks & Hardware',
            'Hinges, Channels & Handles',
            'Kitchen Systems & Accessories',
            'Wardrobe & Bed Fittings',
            'Switches & Sockets',
            'Lighting',
            'Sanitary & Bath Fittings',
            'Safety Equipment',
            'Fasteners & Screws'
        ];

        for (const name of quantitySubcats) {
            await conn.query('UPDATE subcategories SET measurement_type = "quantity" WHERE name = ?', [name]);
            console.log(`  ✓ Updated "${name}" to measurement_type='quantity'`);
        }

        const volumeSubcats = [
            'Overhead Water Tanks',
            'Liquid Admixtures'
        ];

        for (const name of volumeSubcats) {
            await conn.query('UPDATE subcategories SET measurement_type = "volume" WHERE name = ?', [name]);
            console.log(`  ✓ Updated "${name}" to measurement_type='volume'`);
        }

        // 2. Fetch standard Piece and Days units
        const [[pieceUnit]] = await conn.query('SELECT id FROM units WHERE name = "Piece" LIMIT 1');
        const [[daysUnit]] = await conn.query('SELECT id FROM units WHERE name = "Days" LIMIT 1');
        const [[kgUnit]] = await conn.query('SELECT id FROM units WHERE name = "KG" LIMIT 1');

        // 3. Assign Piece unit to quantity subcategories where products currently have weight units
        console.log('2. Re-assigning appropriate units to products in quantity subcategories...');
        if (pieceUnit) {
            const [qSubRows] = await conn.query('SELECT id FROM subcategories WHERE measurement_type = "quantity"');
            const qSubIds = qSubRows.map(r => r.id);
            if (qSubIds.length > 0) {
                const [updateResult] = await conn.query(
                    `UPDATE products 
                     SET unit_id = ? 
                     WHERE subcategory_id IN (${qSubIds.join(',')}) AND (unit_id IS NULL OR unit_id IN (SELECT id FROM units WHERE unit_category = 'selling_weight'))`,
                    [pieceUnit.id]
                );
                console.log(`  ✓ Updated ${updateResult.affectedRows} quantity products to "Piece" unit (#${pieceUnit.id}).`);
            }
        }

        // 4. Ensure rental products have Days unit
        if (daysUnit) {
            const [rSubRows] = await conn.query('SELECT id FROM subcategories WHERE type = "renting"');
            const rSubIds = rSubRows.map(r => r.id);
            if (rSubIds.length > 0) {
                const [rentUpdate] = await conn.query(
                    `UPDATE products 
                     SET unit_id = ? 
                     WHERE subcategory_id IN (${rSubIds.join(',')}) AND (unit_id IS NULL OR unit_id NOT IN (SELECT id FROM units WHERE unit_category = 'renting_duration'))`,
                    [daysUnit.id]
                );
                console.log(`  ✓ Updated ${rentUpdate.affectedRows} rental products to "Days" unit (#${daysUnit.id}).`);
            }
        }

        await conn.commit();
        console.log('✅ Subcategory types and product units successfully synchronized!');
        process.exit(0);
    } catch (err) {
        await conn.rollback();
        console.error('❌ Data clean-up failed:', err);
        process.exit(1);
    } finally {
        conn.release();
    }
}

fixData();
