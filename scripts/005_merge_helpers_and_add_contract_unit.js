const { pool } = require('../src/config/db.config');

async function runMigration() {
    console.log('--- Starting Migration: Merge Helpers and Add Contract Unit ---');

    // 1. Add "Till the contract completion" unit if not exists
    const [existingUnits] = await pool.query(
        "SELECT * FROM units WHERE LOWER(name) LIKE '%till the contract completion%' OR LOWER(name) LIKE '%contract completion%'"
    );

    let contractUnitId;
    if (existingUnits.length === 0) {
        const [insertRes] = await pool.query(
            "INSERT INTO units (name, unit_category, status) VALUES ('Till the contract completion', 'renting_duration', 'active')"
        );
        contractUnitId = insertRes.insertId;
        console.log(`✓ Inserted unit 'Till the contract completion' with ID: ${contractUnitId}`);
    } else {
        contractUnitId = existingUnits[0].id;
        console.log(`✓ Found existing 'Till the contract completion' unit with ID: ${contractUnitId}`);
    }

    // 2. Modify subcategories.type to allow enum('selling', 'renting', 'services')
    try {
        await pool.query("ALTER TABLE subcategories MODIFY COLUMN type ENUM('selling', 'renting', 'services') NOT NULL DEFAULT 'selling'");
        console.log("✓ Updated subcategories.type enum to ('selling', 'renting', 'services')");
    } catch (err) {
        console.warn("Could not alter subcategories enum (might already be varchar or altered):", err.message);
    }

    // 3. Find units for Day, Month, Piece, and Contract
    const [dayUnits] = await pool.query("SELECT id FROM units WHERE LOWER(name) = 'days' LIMIT 1");
    const dayUnitId = dayUnits.length > 0 ? dayUnits[0].id : contractUnitId;

    // 4. Migrate or insert helper products into products table mapped to appropriate categories & subcategories
    const helperProducts = [
        {
            name: 'Certified Senior Mason (AAC & Plaster)',
            category_id: 1, // Civil & Interiors
            subcategory_id: 1, // Cement
            unit_id: contractUnitId,
            price: 18000.00,
            stock: 10,
            description: 'Lead Mason providing complete brickwork, plastering, water leveling and structural AAC block masonry until project contract completion.',
            image: 'assets/images/helpers/mason.webp',
            status: 'active',
            featured: 1
        },
        {
            name: 'Master Flooring & Tile Worker',
            category_id: 1, // Civil & Interiors
            subcategory_id: 2, // Tiling
            unit_id: contractUnitId,
            price: 22000.00,
            stock: 8,
            description: 'Laser-level precision tiling specialist for Italian marble, granite, vitrified tiles and epoxy grouting until completion of contract.',
            image: 'assets/images/helpers/tileworker.jpg',
            status: 'active',
            featured: 1
        },
        {
            name: 'Professional Wall Painter & Finishing Crew',
            category_id: 1, // Civil & Interiors
            subcategory_id: 3, // Painting
            unit_id: contractUnitId,
            price: 16500.00,
            stock: 12,
            description: 'Full surface putty preparation, primer coating, texture painting and exterior weather-shield application for the entire contract.',
            image: 'assets/images/helpers/painter.jpg',
            status: 'active',
            featured: 1
        },
        {
            name: '10-Yr Guarantee Waterproofing Specialist',
            category_id: 1, // Civil & Interiors
            subcategory_id: 4, // Waterproofing
            unit_id: contractUnitId,
            price: 26000.00,
            stock: 6,
            description: 'Comprehensive terrace polymer membrane, sunken slab injection, pressure grouting and expansion joint sealing for the entire contract.',
            image: 'assets/images/helpers/waterproofing.jpg',
            status: 'active',
            featured: 1
        },
        {
            name: 'Master Carpenter & Joinery Craftsman',
            category_id: 2, // Furniture & Architectural Hardware
            subcategory_id: 9, // Wardrobe & Bed Fittings
            unit_id: contractUnitId,
            price: 28000.00,
            stock: 8,
            description: 'High-end modular wardrobe assembly, hydraulic bed fitting installation, wooden door framing and precision architectural hardware fitting till completion.',
            image: 'assets/images/helpers/carpenter.avif',
            status: 'active',
            featured: 1
        },
        {
            name: 'Govt Licensed Electrical Contractor',
            category_id: 3, // Electrical
            subcategory_id: 13, // Switches & Sockets
            unit_id: contractUnitId,
            price: 24000.00,
            stock: 10,
            description: 'Complete 3-phase DB panel dressing, conduit wiring, load balancing, earthing installation and switchboard wiring until full handover.',
            image: 'assets/images/helpers/electrician.jpg',
            status: 'active',
            featured: 1
        },
        {
            name: 'Certified Plumbing & Drainage Specialist',
            category_id: 4, // Plumbing
            subcategory_id: 16, // Sanitary & Bath Fittings
            unit_id: contractUnitId,
            price: 21000.00,
            stock: 10,
            description: 'Concealed CPVC/UPVC piping, pressure testing, wall mixer fixtures, sanitary ware installation and overhead tank hookup till contract sign-off.',
            image: 'assets/images/helpers/plumber.webp',
            status: 'active',
            featured: 1
        },
        {
            name: 'Certified MIG/ARC Welder & Fabricator',
            category_id: 5, // General Hardware & Tools
            subcategory_id: 18, // Construction Tools
            unit_id: contractUnitId,
            price: 25000.00,
            stock: 5,
            description: 'Structural I-beam erection, MS railing fabrication, safety grill welding, steel truss shed assembly serving whole contract.',
            image: 'assets/images/helpers/fabricator.jpg',
            status: 'active',
            featured: 1
        }
    ];

    for (const hp of helperProducts) {
        // Check if already exists by name
        const [exists] = await pool.query('SELECT id FROM products WHERE name = ?', [hp.name]);
        if (exists.length === 0) {
            const slug = hp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            await pool.query(
                `INSERT INTO products (name, slug, category_id, subcategory_id, unit_id, price, stock, description, image, status, featured)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [hp.name, slug, hp.category_id, hp.subcategory_id, hp.unit_id, hp.price, hp.stock, hp.description, hp.image, hp.status, hp.featured]
            );
            console.log(`✓ Inserted helper product: "${hp.name}" under Category ${hp.category_id}, Subcategory ${hp.subcategory_id}`);
        } else {
            console.log(`• Helper product "${hp.name}" already exists with ID: ${exists[0].id}`);
        }
    }

    console.log('--- Migration Completed Successfully ---');
    process.exit(0);
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
