const mysql = require('mysql2/promise');

async function seed() {
  const conn = await mysql.createConnection({
    host: '157.173.222.55',
    port: 3306,
    user: 'civilworks_user',
    password: 'Civilworks@123',
    database: process.env.DB_NAME || 'civilworks_qa'
  });

  // 1. Add skills
  const skillsData = [
    { name: 'Masonry & Bricklaying', image: 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=300' },
    { name: 'Carpentry & Shuttering', image: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=300' },
    { name: 'Plumbing & Pipefitting', image: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=300' },
    { name: 'Electrical Wiring', image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=300' },
    { name: 'Concrete & Steel Bending', image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300' },
    { name: 'General Labor & Site Support', image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300' }
  ];

  for (const s of skillsData) {
    const [existing] = await conn.query('SELECT id FROM skills WHERE name = ?', [s.name]);
    if (existing.length === 0) {
      await conn.query('INSERT INTO skills (name, image, status) VALUES (?, ?, ?)', [s.name, s.image, 'active']);
    }
  }
  console.log('✅ Skills verified/seeded');

  // 2. Add or update Helper subcategory
  // Category id 16 is 'Helpers'
  const [existingSub] = await conn.query('SELECT id FROM subcategories WHERE category_id = 16 AND name = ?', ['On-site Construction Helpers']);
  let subId;
  if (existingSub.length === 0) {
    const [res] = await conn.query(
      'INSERT INTO subcategories (category_id, name, type, measurement_type, is_editable_order, status) VALUES (?, ?, ?, ?, ?, ?)',
      [16, 'On-site Construction Helpers', 'helpers', 'workers', 0, 'active']
    );
    subId = res.insertId;
    console.log('✅ Created helper subcategory with id:', subId);
  } else {
    subId = existingSub[0].id;
    await conn.query("UPDATE subcategories SET type = 'helpers', measurement_type = 'workers', is_editable_order = 0 WHERE id = ?", [subId]);
    console.log('✅ Updated subcategory id:', subId);
  }

  // Also check existing 'construction helpers' if any
  await conn.query("UPDATE subcategories SET type = 'helpers', is_editable_order = 0 WHERE name LIKE '%helper%'");

  // 3. Add a helper product if none exists
  const [existingProd] = await conn.query('SELECT id FROM products WHERE subcategory_id = ?', [subId]);
  if (existingProd.length === 0) {
    const mappedSkills = JSON.stringify(['Masonry & Bricklaying', 'Concrete & Steel Bending', 'General Labor & Site Support']);
    const [pRes] = await conn.query(
      `INSERT INTO products (
        name, slug, description, price, unit_id, stock, subcategory_id, category_id,
        skills, image, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'Certified Civil Construction Helpers',
        'certified-civil-construction-helpers',
        'Skilled & verified workforce for site masonry, concrete pouring, shuttering and heavy civil works.',
        650,
        12,
        99999,
        subId,
        16,
        mappedSkills,
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
        'active'
      ]
    );
    console.log('✅ Created helper product with id:', pRes.insertId);
  } else {
    console.log('Helper product exists id:', existingProd[0].id);
  }

  // Also verify all products and skills count
  const [[{ count }]] = await conn.query('SELECT COUNT(*) as count FROM skills');
  console.log('Total active skills in QA DB:', count);

  await conn.end();
}

seed().catch(console.error);
