const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config/app.config');
const { pool } = require('../src/config/db.config');

let server;
const PORT = 5055;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let adminToken = '';

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        // If path has /admin, automatically attach admin authorization if not explicitly provided
        if (path.includes('/admin') && adminToken && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${adminToken}`;
        }

        const reqOpts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers
        };

        const req = http.request(reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
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
    console.log('=== STARTING 18 SCENARIO VERIFICATION ===\n');
    let passed = 0;
    let failed = 0;

    function assert(cond, desc) {
        if (cond) {
            console.log(`[PASS] ${desc}`);
            passed++;
        } else {
            console.error(`[FAIL] ${desc}`);
            failed++;
        }
    }

    try {
        // Find an active admin user or create test admin
        const [adminUsers] = await pool.execute(
            "SELECT u.id, u.email FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE (r.name = 'admin' OR u.role_id = 1) AND u.status = 'active' LIMIT 1"
        );

        let adminUserId = 1;
        if (adminUsers.length > 0) {
            adminUserId = adminUsers[0].id;
        } else {
            const [anyUser] = await pool.execute("SELECT id FROM users LIMIT 1");
            if (anyUser.length > 0) adminUserId = anyUser[0].id;
        }

        adminToken = jwt.sign({ id: adminUserId }, config.jwt.secret, { expiresIn: '2h' });

        // Start temp server
        await new Promise((resolve) => {
            server = app.listen(PORT, resolve);
        });

        // Test 1: Main Category GET & Admin GET
        const res1 = await request('/main-categories');
        assert(res1.status === 200 && Array.isArray(res1.body.data) && res1.body.data.length >= 2,
            'Test 1: GET /main-categories returns active Main Categories (Construction, Interiors)');

        const constrMain = res1.body.data.find(m => m.name.toLowerCase().includes('construction'));
        const interMain = res1.body.data.find(m => m.name.toLowerCase().includes('interior'));
        assert(constrMain && interMain, 'Test 1b: Baseline sectors Construction & Interiors identified');

        // Test 2: Category creation requiring main_category_id (with valid admin token)
        const res2Fail = await request('/categories/admin', {
            method: 'POST',
            body: { name: 'Invalid Category No Main' }
        });
        assert(res2Fail.status === 400 && res2Fail.body.message.includes('Main Category'),
            `Test 2: Category creation without main_category_id fails with 400: "${res2Fail.body.message}"`);

        // Test 3: Categories filtered by main_category_id (Strict Isolation)
        const res3Constr = await request(`/categories?main_category_id=${constrMain.id}`);
        const res3Inter = await request(`/categories?main_category_id=${interMain.id}`);
        assert(res3Constr.status === 200 && res3Inter.status === 200, 'Test 3: Categories can be queried by main_category_id');
        
        const constrCatIds = new Set(res3Constr.body.data.map(c => c.id));
        const interCatIds = new Set(res3Inter.body.data.map(c => c.id));
        const overlap = [...constrCatIds].filter(id => interCatIds.has(id));
        assert(overlap.length === 0, 'Test 3b: Zero overlap between Construction and Interiors categories (Strict Isolation)');

        // Test 4: Subcategory creation with type and conditional measurement_type
        const testCatId = res3Constr.body.data[0].id;
        const res4 = await request('/subcategories/admin', {
            method: 'POST',
            body: {
                name: 'Automated Test Rental Subcategory',
                category_id: testCatId,
                type: 'renting',
                measurement_type: 'duration'
            }
        });
        assert(res4.status === 201 && res4.body.data.type === 'renting', 'Test 4: Subcategory created with type=renting and measurement_type=duration');
        const testRentalSubId = res4.body.data.id;

        // Test 5: Units GET & Admin Unit creation
        const res5Units = await request('/units');
        assert(res5Units.status === 200 && res5Units.body.data.length >= 10, 'Test 5: GET /units returns standard measurement units');
        
        const weightUnit = res5Units.body.data.find(u => u.unit_category === 'selling_weight');
        const durationUnit = res5Units.body.data.find(u => u.unit_category === 'renting_duration');
        assert(weightUnit && durationUnit, 'Test 5b: Both selling_weight and renting_duration units found in master units');

        // Test 6 & 7: Product creation unit compatibility validation
        // Attempting to create a Renting product with a Weight unit MUST FAIL
        const res7Fail = await request('/products/admin', {
            method: 'POST',
            body: {
                name: 'Faulty Incompatible Product',
                category_id: testCatId,
                subcategory_id: testRentalSubId,
                unit_id: weightUnit.id, // Incompatible! Rental subcategory requires renting_duration
                price: 500,
                stock: 10
            }
        });
        assert(res7Fail.status === 400 && res7Fail.body.message.includes('Invalid unit'),
            `Test 7: Incompatible unit rejected by backend: "${res7Fail.body.message}"`);

        // Creating with proper duration unit MUST SUCCEED
        const res6Pass = await request('/products/admin', {
            method: 'POST',
            body: {
                name: 'Automated Verified Rental Rig',
                category_id: testCatId,
                subcategory_id: testRentalSubId,
                unit_id: durationUnit.id, // Compatible!
                price: 1500,
                stock: 5,
                status: 'active'
            }
        });
        assert(res6Pass.status === 201 && res6Pass.body.data && res6Pass.body.data.unit_id === durationUnit.id,
            'Test 6: Compatible product created successfully with proper unit association');
        const testRentalProductId = res6Pass.body?.data?.id;

        // Test 8: Vendor creation with multi-select services (subcategories)
        const res8 = await request('/vendors/admin', {
            method: 'POST',
            body: {
                name: 'Apex Automated Test Rig Services',
                mobile: '9876543210',
                email: 'apex@example.com',
                services: [testRentalSubId]
            }
        });
        assert(res8.status === 201 && res8.body.data.services.some(s => s.id == testRentalSubId),
            'Test 8: Vendor created with subcategory services mapped');
        const testVendorId = res8.body.data.id;

        // Test 9: Vendor listing filtered by subcategory_id
        const res9 = await request(`/vendors?subcategory_id=${testRentalSubId}`);
        assert(res9.status === 200 && res9.body.data.some(v => v.id === testVendorId),
            'Test 9: Vendor query by subcategory_id returns mapped vendor');

        // Test 10: Product listing isolation by main_category_id
        const res10ConstrProds = await request(`/products?main_category_id=${constrMain.id}`);
        const res10InterProds = await request(`/products?main_category_id=${interMain.id}`);
        assert(res10ConstrProds.status === 200 && res10InterProds.status === 200,
            'Test 10: Products can be queried isolated by main_category_id');
        
        const constrProdIds = new Set(res10ConstrProds.body.data.map(p => p.id));
        const interProdIds = new Set(res10InterProds.body.data.map(p => p.id));
        const prodOverlap = [...constrProdIds].filter(id => interProdIds.has(id));
        assert(prodOverlap.length === 0,
            'Test 10b: Zero product cross-contamination between Construction and Interiors');

        // Test 11: Product listing filtered by subcategory_id
        const res11SubProds = await request(`/products?subcategory_id=${testRentalSubId}`);
        assert(res11SubProds.status === 200 && res11SubProds.body.data.some(p => p.id === testRentalProductId),
            'Test 11: Subcategory product query returns newly created rental product');

        // Test 12: Product detail returns proper unit_name and product_type
        const res12 = await request(`/products/${testRentalProductId}`);
        assert(res12.status === 200 && res12.body.data.product_type === 'renting' && res12.body.data.unit_name === durationUnit.name,
            `Test 12: Product detail includes product_type='renting' and unit_name='${durationUnit.name}'`);

        // Test 13: Referential integrity - deleting subcategory with active product must fail
        const res13DelSub = await request(`/subcategories/admin/${testRentalSubId}`, { method: 'DELETE' });
        assert(res13DelSub.status === 400 && res13DelSub.body.message.includes('dependent products'),
            `Test 13: Protected subcategory cannot be deleted while products exist: "${res13DelSub.body.message}"`);

        // Test 14: Referential integrity - deleting unit used by active product must fail
        const res14DelUnit = await request(`/units/admin/${durationUnit.id}`, { method: 'DELETE' });
        assert(res14DelUnit.status === 400 && res14DelUnit.body.message.includes('used by'),
            `Test 14: Unit in use protected from deletion: "${res14DelUnit.body.message}"`);

        // Test 15: Clean up created test product
        const res15DelProd = await request(`/products/admin/${testRentalProductId}`, { method: 'DELETE' });
        assert(res15DelProd.status === 200, 'Test 15: Product deletion succeeds');

        // Test 16: Clean up created test subcategory now that product is gone
        const res16DelSub = await request(`/subcategories/admin/${testRentalSubId}`, { method: 'DELETE' });
        assert(res16DelSub.status === 200, 'Test 16: Subcategory deletion succeeds once products are removed');

        // Test 17: Clean up created test vendor
        const res17DelVen = await request(`/vendors/admin/${testVendorId}`, { method: 'DELETE' });
        assert(res17DelVen.status === 200, 'Test 17: Vendor deletion succeeds');

        // Test 18: Main category integrity - Construction root has categories and cannot be deleted if in use
        const res18DelMain = await request(`/main-categories/admin/${constrMain.id}`, { method: 'DELETE' });
        assert(res18DelMain.status === 400 && res18DelMain.body.message.includes('dependent categories'),
            `Test 18: Main Category in use protected from deletion: "${res18DelMain.body.message}"`);

    } catch (err) {
        console.error('Fatal error during testing:', err);
        failed++;
    } finally {
        if (server) {
            server.close();
        }
        await pool.end();
    }

    console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
