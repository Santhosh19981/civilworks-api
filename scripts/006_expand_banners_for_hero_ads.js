const { pool } = require('../src/config/db.config');

async function migrateBanners() {
    console.log('🚀 Starting banners expansion migration...');
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Check existing columns in banners
        const [existingCols] = await conn.query('DESCRIBE banners');
        const colNames = existingCols.map(c => c.Field);
        console.log('Existing columns in banners:', colNames);

        // Add main_category_id if missing
        if (!colNames.includes('main_category_id')) {
            console.log('Adding main_category_id...');
            await conn.query('ALTER TABLE banners ADD COLUMN main_category_id INT NULL AFTER id');
            try {
                await conn.query('ALTER TABLE banners ADD CONSTRAINT fk_banners_main_category FOREIGN KEY (main_category_id) REFERENCES main_categories(id) ON DELETE SET NULL');
            } catch (err) {
                console.log('FK creation note:', err.message);
            }
        }

        // Add tag if missing
        if (!colNames.includes('tag')) {
            console.log('Adding tag...');
            await conn.query('ALTER TABLE banners ADD COLUMN tag VARCHAR(100) NULL AFTER main_category_id');
        }

        // Add subtitle if missing
        if (!colNames.includes('subtitle')) {
            console.log('Adding subtitle...');
            await conn.query('ALTER TABLE banners ADD COLUMN subtitle TEXT NULL AFTER title');
        }

        // Add cta if missing
        if (!colNames.includes('cta')) {
            console.log('Adding cta...');
            await conn.query("ALTER TABLE banners ADD COLUMN cta VARCHAR(100) NULL DEFAULT 'Explore' AFTER subtitle");
        }

        // Add cta_link if missing
        if (!colNames.includes('cta_link')) {
            console.log('Adding cta_link...');
            await conn.query("ALTER TABLE banners ADD COLUMN cta_link VARCHAR(255) NULL DEFAULT '/tabs/products' AFTER cta");
        }

        // Add assurance_badge if missing
        if (!colNames.includes('assurance_badge')) {
            console.log('Adding assurance_badge...');
            await conn.query("ALTER TABLE banners ADD COLUMN assurance_badge VARCHAR(255) NULL DEFAULT '100% Quality Guaranteed' AFTER cta_link");
        }

        // Ensure image column is wide enough
        await conn.query('ALTER TABLE banners MODIFY COLUMN image VARCHAR(500) NOT NULL');

        // 2. Clear old legacy test banners and insert high-quality seeded banners for all 3 sectors
        await conn.query('DELETE FROM banners');

        const initialBanners = [
            // Construction (main_category_id: 1)
            {
                main_category_id: 1,
                tag: 'DIRECT WHOLESALE',
                title: 'Quality Building Materials',
                subtitle: 'Direct supply on Cement, TMT Steel, Sand & Site Essentials at bulk rates',
                cta: 'Explore Materials',
                cta_link: '/tabs/products?mainCategoryId=1',
                assurance_badge: '100% Quality Guaranteed',
                image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80',
                type: 'category',
                status: 'active',
                sort_order: 1
            },
            {
                main_category_id: 1,
                tag: 'EXPRESS SITE DISPATCH',
                title: 'Heavy Equipment & Machinery',
                subtitle: 'JCB 3DX, Excavators, Cranes & Mixers with certified operators at your site',
                cta: 'Rent Machinery',
                cta_link: '/tabs/rentals',
                assurance_badge: 'Zero Downtime Guarantee',
                image: 'https://images.unsplash.com/photo-1541625602330-2277a1cd1f59?auto=format&fit=crop&w=1200&q=80',
                type: 'rental',
                status: 'active',
                sort_order: 2
            },
            {
                main_category_id: 1,
                tag: 'VERIFIED WORKFORCE',
                title: 'Skilled Construction Labor',
                subtitle: 'Certified masons, carpenters, electricians & helpers on flexible daily contracts',
                cta: 'Book Workers',
                cta_link: '/helpers',
                assurance_badge: '100% Background Checked',
                image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=80',
                type: 'helper',
                status: 'active',
                sort_order: 3
            },
            // Interiors (main_category_id: 2)
            {
                main_category_id: 2,
                tag: 'LUXURY ARCHITECTURE',
                title: 'Designer Architectural Hardware',
                subtitle: 'Premium modular kitchen fittings, designer door handles & concealed hinges',
                cta: 'Explore Interiors',
                cta_link: '/tabs/products?mainCategoryId=2',
                assurance_badge: 'Italian Precision Standards',
                image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
                type: 'category',
                status: 'active',
                sort_order: 1
            },
            {
                main_category_id: 2,
                tag: 'CUSTOM JOINERY',
                title: 'Bespoke Wardrobe & Bed Fittings',
                subtitle: 'Soft-close sliders, hydraulic lifts & luxury profile handles for modern homes',
                cta: 'Shop Hardware',
                cta_link: '/tabs/products?mainCategoryId=2',
                assurance_badge: '5-Year Finish Guarantee',
                image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
                type: 'product',
                status: 'active',
                sort_order: 2
            },
            // Real Estate (main_category_id: 3)
            {
                main_category_id: 3,
                tag: 'PRIME ASSETS',
                title: 'Commercial & Residential Plots',
                subtitle: 'HMDA & RERA approved gated communities in high-growth Hyderabad corridors',
                cta: 'Explore Plots',
                cta_link: '/tabs/products?mainCategoryId=3',
                assurance_badge: '100% Clear Title Assurance',
                image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80',
                type: 'category',
                status: 'active',
                sort_order: 1
            }
        ];

        for (const b of initialBanners) {
            await conn.query(
                `INSERT INTO banners (main_category_id, tag, title, subtitle, cta, cta_link, assurance_badge, image, type, status, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [b.main_category_id, b.tag, b.title, b.subtitle, b.cta, b.cta_link, b.assurance_badge, b.image, b.type, b.status, b.sort_order]
            );
        }

        await conn.commit();
        console.log('✅ Banners migration & seeding completed successfully!');
    } catch (err) {
        await conn.rollback();
        console.error('❌ Migration failed:', err);
        throw err;
    } finally {
        conn.release();
    }
}

migrateBanners().then(() => process.exit(0)).catch(() => process.exit(1));
