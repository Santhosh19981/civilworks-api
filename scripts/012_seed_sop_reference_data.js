const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function seedSOPData() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '157.173.222.55',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'civilworks_user',
        password: process.env.DB_PASSWORD || 'Civilworks@123',
        database: process.env.DB_NAME || 'civilworks_qa'
    });

    try {
        console.log('Seeding reference SOP data...');

        // 1. Update customer user (id: 9) to John Customer / ABC Constructions
        await conn.query(`
            UPDATE users SET 
                name = 'John Customer',
                organization = 'ABC Constructions',
                email = 'john.customer@abcconstructions.com'
            WHERE id = 9
        `);

        // 2. Ensure Vendor 4 or XYZ Civil Works exists
        let [vendors] = await conn.query('SELECT * FROM vendors WHERE name LIKE "%XYZ%" OR id = 4');
        let vendorId = 4;
        if (vendors.length > 0) {
            vendorId = vendors[0].id;
            await conn.query('UPDATE vendors SET name = "XYZ Civil Works" WHERE id = ?', [vendorId]);
        } else {
            const [vRes] = await conn.query(`
                INSERT INTO vendors (name, mobile, email, status)
                VALUES ('XYZ Civil Works', '9638527410', 'vendor@xyzcivilworks.com', 'active')
            `);
            vendorId = vRes.insertId;
        }

        // 3. Ensure Subcategories exist for Construction services:
        // Site Preparation, Foundation Work, Structure Construction, Brick Work, Finishing Work
        const servicesDef = [
            { name: 'Site Preparation', desc: 'Land clearing and site setup', days: [0, 2] },
            { name: 'Foundation Work', desc: 'Excavation and foundation work for the building.', days: [3, 8] },
            { name: 'Structure Construction', desc: 'Columns, beams and slabs', days: [9, 20] },
            { name: 'Brick Work', desc: 'Walls and partitions', days: [21, 28] },
            { name: 'Finishing Work', desc: 'Painting, flooring and final touches', days: [29, 40] }
        ];

        const subcatMap = {};
        for (const s of servicesDef) {
            const [rows] = await conn.query('SELECT id FROM subcategories WHERE name = ?', [s.name]);
            if (rows.length > 0) {
                subcatMap[s.name] = rows[0].id;
            } else {
                const [ins] = await conn.query(
                    'INSERT INTO subcategories (name, category_id, type) VALUES (?, 14, "services")',
                    [s.name]
                );
                subcatMap[s.name] = ins.insertId;
            }
        }

        // 4. Ensure Order ORD-1001 exists for user 9
        let orderId = null;
        const [ordRows] = await conn.query('SELECT id FROM orders WHERE order_no = "ORD-1001"');
        if (ordRows.length > 0) {
            orderId = ordRows[0].id;
            await conn.query(`
                UPDATE orders SET 
                    project_name = 'Office Building Renovation',
                    user_id = 9,
                    order_type = 'service',
                    total_amount = 45000.00,
                    order_status = 'confirmed',
                    created_at = '2025-09-20 10:00:00'
                WHERE id = ?
            `, [orderId]);
        } else {
            const [oIns] = await conn.query(`
                INSERT INTO orders (order_no, project_name, user_id, order_type, subtotal, total_amount, payment_method, payment_status, order_status, created_at)
                VALUES ('ORD-1001', 'Office Building Renovation', 9, 'service', 45000.00, 45000.00, 'online', 'paid', 'confirmed', '2025-09-20 10:00:00')
            `);
            orderId = oIns.insertId;
        }

        // Also ensure ORD-G0K31O has project_name
        await conn.query(`
            UPDATE orders SET 
                project_name = 'Residential Plumbing & Renovation'
            WHERE order_no = 'ORD-G0K31O'
        `);

        // 5. Ensure project_conversation exists for ORD-1001
        const [convRows] = await conn.query('SELECT id FROM project_conversations WHERE order_id = ?', [orderId]);
        let convId = null;
        if (convRows.length > 0) {
            convId = convRows[0].id;
        } else {
            const [cIns] = await conn.query(`
                INSERT INTO project_conversations (order_id, title, status, created_at)
                VALUES (?, 'Project Order #ORD-1001', 'active', '2025-09-20 10:00:00')
            `, [orderId]);
            convId = cIns.insertId;
        }

        // Add participants to conversation
        await conn.query('DELETE FROM conversation_participants WHERE conversation_id = ?', [convId]);
        await conn.query(`
            INSERT INTO conversation_participants (conversation_id, user_id, participant_type, status)
            VALUES (?, 9, 'customer', 'active')
        `, [convId]);
        await conn.query(`
            INSERT INTO conversation_participants (conversation_id, vendor_id, participant_type, status)
            VALUES (?, ?, 'vendor', 'active')
        `, [convId, vendorId]);

        // 6. Delete old order_services for orderId to cleanly reseed
        await conn.query('DELETE FROM order_services WHERE order_id = ?', [orderId]);

        const sampleServices = [
            {
                name: 'Site Preparation',
                desc: 'Land clearing and site setup',
                seq: 1,
                status: 'completed',
                start: '2025-09-20',
                end: '2025-09-22',
                progress: 100,
                subtasks: [
                    { title: 'Clear Site', desc: 'Clear rocks, debris, and surface obstacles', start: '2025-09-20', end: '2025-09-20', status: 'completed' },
                    { title: 'Mark Boundaries', desc: 'Mark corner pins and setback perimeter lines', start: '2025-09-21', end: '2025-09-21', status: 'completed' },
                    { title: 'Soil Testing', desc: 'Core geotechnical soil density sampling and report', start: '2025-09-22', end: '2025-09-22', status: 'completed' }
                ]
            },
            {
                name: 'Foundation Work',
                desc: 'Excavation and foundation work for the building.',
                seq: 2,
                status: 'in_progress',
                start: '2025-09-23',
                end: '2025-09-28',
                progress: 60,
                subtasks: [
                    { title: 'Excavation', desc: 'Digging foundation trenches to 2.5m depth', start: '2025-09-23', end: '2025-09-24', status: 'in_progress' },
                    { title: 'Reinforcement', desc: 'Steel rebar cage laying and tying', start: '2025-09-25', end: '2025-09-26', status: 'in_progress' },
                    { title: 'Concrete Pouring', desc: 'M25 grade ready-mix concrete pouring and curing', start: '2025-09-27', end: '2025-09-28', status: 'pending' }
                ]
            },
            {
                name: 'Structure Construction',
                desc: 'Columns, beams and slabs',
                seq: 3,
                status: 'pending',
                start: '2025-09-29',
                end: '2025-10-10',
                progress: 0,
                subtasks: [
                    { title: 'Columns', desc: 'Column shuttering and casting', start: '2025-09-29', end: '2025-09-30', status: 'pending' },
                    { title: 'Beams', desc: 'Formwork and horizontal tie beams', start: '2025-10-01', end: '2025-10-04', status: 'pending' },
                    { title: 'Slabs', desc: 'First floor ceiling and roof deck slab casting', start: '2025-10-05', end: '2025-10-10', status: 'pending' }
                ]
            },
            {
                name: 'Brick Work',
                desc: 'Walls and partitions',
                seq: 4,
                status: 'pending',
                start: '2025-10-11',
                end: '2025-10-18',
                progress: 0,
                subtasks: [
                    { title: 'Wall Construction', desc: 'Exterior load-bearing red clay brick walls', start: '2025-10-11', end: '2025-10-13', status: 'pending' },
                    { title: 'Partition Wall', desc: 'Interior lightweight AAC acoustic block dividers', start: '2025-10-14', end: '2025-10-16', status: 'pending' },
                    { title: 'Plaster Work', desc: 'Cement mortar smooth sand plaster finish', start: '2025-10-17', end: '2025-10-18', status: 'pending' }
                ]
            },
            {
                name: 'Finishing Work',
                desc: 'Painting, flooring and final touches',
                seq: 5,
                status: 'pending',
                start: '2025-10-19',
                end: '2025-10-30',
                progress: 0,
                subtasks: [
                    { title: 'Painting', desc: 'Two coats primer followed by premium emulsion', start: '2025-10-19', end: '2025-10-23', status: 'pending' },
                    { title: 'Flooring', desc: 'Vitrified tiles and anti-skid bathroom ceramic', start: '2025-10-24', end: '2025-10-27', status: 'pending' },
                    { title: 'Final Touches', desc: 'Hardware, switchplates, sealant inspection, clean-up', start: '2025-10-28', end: '2025-10-30', status: 'pending' }
                ]
            }
        ];

        for (const s of sampleServices) {
            const subId = subcatMap[s.name] || 46;
            const [svcRes] = await conn.query(`
                INSERT INTO order_services (
                    order_id, subcategory_id, service_name, vendor_id, vendor_status, 
                    service_status, price, sequence_order, description, start_date, end_date, progress_percent
                ) VALUES (?, ?, ?, ?, 'accepted', ?, 9000.00, ?, ?, ?, ?, ?)
            `, [orderId, subId, s.name, vendorId, s.status, s.seq, s.desc, s.start, s.end, s.progress]);

            const osId = svcRes.insertId;

            // Insert subtasks
            let subSeq = 1;
            for (const sub of s.subtasks) {
                const [stRes] = await conn.query(`
                    INSERT INTO order_service_subtasks (
                        order_service_id, order_id, vendor_id, title, description, 
                        start_date, end_date, status, sequence_order, completed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    osId, orderId, vendorId, sub.title, sub.desc, 
                    sub.start, sub.end, sub.status, subSeq++, 
                    sub.status === 'completed' ? (sub.end + ' 17:00:00') : null
                ]);

                // If completed, add a sample proof image
                if (sub.status === 'completed') {
                    await conn.query(`
                        INSERT INTO subtask_proof_images (subtask_id, image_url, original_name, file_size, uploaded_by_type, uploaded_by_id)
                        VALUES (?, 'https://images.unsplash.com/photo-1541888946425-d0fbb18615f3?auto=format&fit=crop&w=800&q=80', 'site_completion_proof.jpg', 124500, 'vendor', ?)
                    `, [stRes.insertId, vendorId]);
                }
            }
        }

        // Also update existing order ORD-G0K31O service #1
        await conn.query(`
            UPDATE order_services SET 
                sequence_order = 1,
                description = 'Comprehensive plumbing system inspection and pipeline installation',
                start_date = '2026-10-10',
                end_date = '2026-10-16',
                progress_percent = 50
            WHERE id = 1
        `);

        // Check if subtasks exist for order_service 1
        const [existingSt] = await conn.query('SELECT id FROM order_service_subtasks WHERE order_service_id = 1');
        if (existingSt.length === 0) {
            await conn.query(`
                INSERT INTO order_service_subtasks (order_service_id, order_id, vendor_id, title, description, start_date, end_date, status, sequence_order)
                VALUES 
                (1, 1, 4, 'Pipe Rough-in', 'Laying primary PVC supply and drainage lines', '2026-10-10', '2026-10-12', 'completed', 1),
                (1, 1, 4, 'Pressure Testing', 'Hydrostatic leak testing up to 8 bar pressure', '2026-10-13', '2026-10-14', 'in_progress', 2),
                (1, 1, 4, 'Fixture Installation', 'Mounting CP faucets, valves and sanitaryware', '2026-10-15', '2026-10-16', 'pending', 3)
            `);
        }

        console.log('✅ Reference SOP data seeded successfully!');
    } catch (err) {
        console.error('Error seeding SOP data:', err);
    } finally {
        await conn.end();
    }
}

seedSOPData();
