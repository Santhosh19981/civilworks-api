const http = require('http');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const app = require('../src/app');
const config = require('../src/config/app.config');
const { pool } = require('../src/config/db.config');

let server;
const PORT = 5056;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let adminToken = '';

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (path.includes('/admin') && adminToken && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${adminToken}`;
        }

        const reqOpts = {
            method: options.method || 'GET',
            headers
        };

        const req = http.request(url, reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Starting Full Test Suite for Units Expansion & Rentals Hierarchy Integration...\n');
    
    server = http.createServer(app);
    await new Promise(resolve => server.listen(PORT, resolve));
    console.log(`✓ Test server running on http://localhost:${PORT}`);

    try {
        // Step 0: Generate Admin Token
        console.log('--- Step 0: Authenticating Admin ---');
        adminToken = jwt.sign(
            { id: 1, email: 'admin@civilworks.com', role: 'super_admin' },
            config.jwt.secret,
            { expiresIn: '1h' }
        );
        console.log('✓ Admin token generated.');

        // Test 1: Unit Creation with selling_quantity and selling_volume
        console.log('\n--- Test 1: Unit Creation with New Categories ---');
        const unitQuantityRes = await request('/units/admin', {
            method: 'POST',
            body: { name: 'Test Box Unit', unit_category: 'selling_quantity', status: 'active' }
        });
        assert(unitQuantityRes.status === 201, `Failed to create selling_quantity unit: ${JSON.stringify(unitQuantityRes.body)}`);
        assert(unitQuantityRes.body.data.unit_category === 'selling_quantity', 'Unit category should be selling_quantity');
        const testQuantityUnitId = unitQuantityRes.body.data.id;
        console.log(`✓ Created unit #${testQuantityUnitId} with category 'selling_quantity'`);

        const unitVolumeRes = await request('/units/admin', {
            method: 'POST',
            body: { name: 'Test Drum Unit', unit_category: 'selling_volume', status: 'active' }
        });
        assert(unitVolumeRes.status === 201, `Failed to create selling_volume unit: ${JSON.stringify(unitVolumeRes.body)}`);
        assert(unitVolumeRes.body.data.unit_category === 'selling_volume', 'Unit category should be selling_volume');
        const testVolumeUnitId = unitVolumeRes.body.data.id;
        console.log(`✓ Created unit #${testVolumeUnitId} with category 'selling_volume'`);

        // Test 2: Subcategory Creation with quantity and volume measurement types
        console.log('\n--- Test 2: Subcategory Creation with quantity & volume ---');
        const subQuantityRes = await request('/subcategories/admin', {
            method: 'POST',
            body: {
                category_id: 1,
                name: 'Fasteners & Screws',
                type: 'selling',
                measurement_type: 'quantity',
                status: 'active'
            }
        });
        assert(subQuantityRes.status === 201, `Failed to create quantity subcategory: ${JSON.stringify(subQuantityRes.body)}`);
        assert(subQuantityRes.body.data.measurement_type === 'quantity', 'measurement_type must be quantity');
        const testQuantitySubId = subQuantityRes.body.data.id;
        console.log(`✓ Created subcategory #${testQuantitySubId} with measurement_type='quantity'`);

        const subVolumeRes = await request('/subcategories/admin', {
            method: 'POST',
            body: {
                category_id: 1,
                name: 'Liquid Admixtures',
                type: 'selling',
                measurement_type: 'volume',
                status: 'active'
            }
        });
        assert(subVolumeRes.status === 201, `Failed to create volume subcategory: ${JSON.stringify(subVolumeRes.body)}`);
        assert(subVolumeRes.body.data.measurement_type === 'volume', 'measurement_type must be volume');
        const testVolumeSubId = subVolumeRes.body.data.id;
        console.log(`✓ Created subcategory #${testVolumeSubId} with measurement_type='volume'`);

        // Test 3: Compatibility Validation: Compatible Unit passes, Incompatible fails
        console.log('\n--- Test 3: Product & Unit Compatibility Validation ---');
        // Valid quantity product
        const prodQuantityOk = await request('/products/admin', {
            method: 'POST',
            body: {
                category_id: 1,
                subcategory_id: testQuantitySubId,
                unit_id: testQuantityUnitId,
                name: 'Drywall Screws 25mm (Box of 500)',
                price: 350.00,
                stock: 100
            }
        });
        assert(prodQuantityOk.status === 201, `Valid quantity product creation failed: ${JSON.stringify(prodQuantityOk.body)}`);
        const testQuantityProdId = prodQuantityOk.body.data.id;
        console.log(`✓ Product #${testQuantityProdId} created successfully with compatible quantity unit.`);

        // Incompatible product: attaching selling_volume unit to quantity subcategory should fail with 400
        const prodQuantityMismatch = await request('/products/admin', {
            method: 'POST',
            body: {
                category_id: 1,
                subcategory_id: testQuantitySubId,
                unit_id: testVolumeUnitId, // Mismatched volume unit!
                name: 'Mismatched Screws with Drum Unit',
                price: 200.00,
                stock: 10
            }
        });
        assert(prodQuantityMismatch.status === 400, `Expected 400 for mismatched unit, got ${prodQuantityMismatch.status}`);
        console.log(`✓ Mismatched unit rejected properly with 400 Bad Request: "${prodQuantityMismatch.body.message}"`);

        // Test 4: Rentals Module Integration & Hierarchy Mapping
        console.log('\n--- Test 4: Rentals Hierarchy Mapping & Subcategory Filtering ---');
        const [[heavyMachSub]] = await pool.query('SELECT id, category_id FROM subcategories WHERE name = "Heavy Machinery" LIMIT 1');
        assert(heavyMachSub, 'Heavy Machinery subcategory should exist');

        // Query rentals by subcategory_id
        const rentalsBySub = await request(`/rentals?subcategory_id=${heavyMachSub.id}`);
        assert(rentalsBySub.status === 200, `Failed to get rentals by subcategory: ${rentalsBySub.status}`);
        assert(rentalsBySub.body.data.length >= 2, `Expected at least 2 rentals in Heavy Machinery, found ${rentalsBySub.body.data.length}`);
        const rentalNames = rentalsBySub.body.data.map(r => r.name);
        assert(rentalNames.some(n => n.includes('JCB')), 'Heavy Machinery rentals must include JCB');
        assert(rentalNames.some(n => n.includes('Excavator')), 'Heavy Machinery rentals must include Excavator');
        console.log(`✓ GET /api/v1/rentals?subcategory_id=${heavyMachSub.id} returned:`, rentalNames);

        // Query products by subcategory_id for Heavy Machinery
        const productsBySub = await request(`/products?subcategory_id=${heavyMachSub.id}`);
        assert(productsBySub.status === 200, `Failed to get products by subcategory: ${productsBySub.status}`);
        assert(productsBySub.body.data.length >= 2, `Expected at least 2 products in Heavy Machinery, found ${productsBySub.body.data.length}`);
        const prodNames = productsBySub.body.data.map(p => p.name);
        assert(prodNames.some(n => n.includes('JCB')), 'Products under Heavy Machinery must include JCB');
        assert(prodNames.some(n => n.includes('Excavator')), 'Products under Heavy Machinery must include Excavator');
        console.log(`✓ GET /api/v1/products?subcategory_id=${heavyMachSub.id} returned:`, prodNames);

        // Query rentals by Main Category 1 (Construction)
        const rentalsByMain = await request('/rentals?main_category_id=1');
        assert(rentalsByMain.status === 200, `Failed to get rentals by main category: ${rentalsByMain.status}`);
        assert(rentalsByMain.body.data.length >= 5, `Expected 5 mapped rentals under Construction, found ${rentalsByMain.body.data.length}`);
        console.log(`✓ GET /api/v1/rentals?main_category_id=1 successfully returned all ${rentalsByMain.body.data.length} construction rentals with hierarchy joins.`);

        // Test 5: Clean up test artifacts
        console.log('\n--- Test 5: Cleanup Test Data ---');
        await pool.query('DELETE FROM products WHERE id = ?', [testQuantityProdId]);
        await pool.query('DELETE FROM subcategories WHERE id IN (?, ?)', [testQuantitySubId, testVolumeSubId]);
        await pool.query('DELETE FROM units WHERE id IN (?, ?)', [testQuantityUnitId, testVolumeUnitId]);
        console.log('✓ Cleaned up test products, subcategories, and units.');

        console.log('\n======================================================');
        console.log('🎉 ALL INTEGRATION TESTS PASSED WITH ZERO FAILURES! 🎉');
        console.log('======================================================\n');
        
        server.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed:', err);
        if (server) server.close();
        process.exit(1);
    }
}

runTests();
