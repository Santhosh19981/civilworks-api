const mysql = require('mysql2/promise');

const data = [
  {
    name: "Civil & Interiors",
    subcategories: [
      { name: "Cement", products: ["Ultratech PPC Cement 50kg", "Ramco Supergrade PPC Cement 50kg", "Maha PPC Cement 50kg", "Priya PPC Cement 50kg", "Dalmia PPC Cement 50kg", "JSW PSC Cement 50kg"] },
      { name: "Tiling", products: ["Roff T01 Tile Adhesive 20kg", "Roff T02 Tile Adhesive 20kg", "MYK Laticrete Tile Adhesive", "White Tile Grout 1kg", "Tile Spacer 3mm Pack", "Tile Leveling Clips"] },
      { name: "Painting", products: ["Asian Paints Tractor Emulsion 20L", "Asian Paints Premium Emulsion 20L", "Berger Easy Clean Emulsion 20L", "Nerolac Beauty Gold Paint 20L", "Wall Primer 20L", "Birla Wall Putty 20kg"] },
      { name: "Waterproofing", products: ["Dr Fixit LW+ Waterproofing Liquid", "Dr Fixit Roofseal Waterproofing", "Fosroc Waterproofing Compound", "Sika Latex Waterproofing Chemical", "Waterproof Cement Additive"] },
      { name: "Plywood, MDF & HDHMR", products: ["Greenply Plywood Board", "Century Plywood Board", "HDHMR Board Sheet", "MDF Board Sheet", "Block Board Sheet"] },
      { name: "Adhesives (Fevicol)", products: ["Fevicol SH Adhesive", "Fevicol Marine Adhesive", "Fevibond Adhesive", "Fevicol SR Adhesive"] }
    ]
  },
  {
    name: "Furniture & Architectural Hardware",
    subcategories: [
      { name: "Hinges, Channels & Handles", products: ["Ebco Soft Close Cabinet Hinges", "Hafele Cabinet Hinges", "Telescopic Drawer Channel", "Soft Close Drawer Channel", "Stainless Steel Cabinet Handles"] },
      { name: "Kitchen Systems & Accessories", products: ["Ebco Magic Corner Double Pullout", "Ebco Kitchen Pullout Basket", "Hafele Tall Unit Kitchen Storage", "Kitchen Cutlery Tray", "Under Sink Pullout Basket"] },
      { name: "Wardrobe & Bed Fittings", products: ["Wardrobe Lift Fitting", "Sliding Wardrobe Door Kit", "Bed Hydraulic Storage Lift", "Wardrobe Wire Basket Drawer"] },
      { name: "Door Locks & Hardware", products: ["Godrej Main Door Lock", "Dorset Mortise Door Lock", "Yale Premium Door Lock", "Stainless Steel Door Handle Set", "Smart Digital Door Lock"] }
    ]
  },
  {
    name: "Electrical",
    subcategories: [
      { name: "Conduits & GI Boxes", products: ["PVC Conduit Pipe 20mm", "GI Conduit Pipe 20mm", "Electrical Junction Box", "GI Electrical Switch Box", "Conduit Pipe Bend"] },
      { name: "Wires", products: ["Polycab FRLS House Wire 90m", "Finolex Flamegard Wire 90m", "Havells House Wire Roll", "Anchor Electrical Wire Roll", "RR Kabel House Wire"] },
      { name: "Switches & Sockets", products: ["Anchor Roma Modular Switch", "Legrand Modular Switch", "GM Modular Switch", "Anchor Power Socket", "Modular Switch Plate"] },
      { name: "Lighting", products: ["LED Bulb 9W", "LED Tube Light 20W", "LED Panel Light 12W", "LED Downlight", "Outdoor LED Flood Light"] }
    ]
  },
  {
    name: "Plumbing",
    subcategories: [
      { name: "CPVC Pipes & Fittings", products: ["Astral CPVC Pipe 1 Inch", "Ashirvad CPVC Pipe 1 Inch", "CPVC Elbow Joint", "CPVC Tee Joint", "CPVC Coupler"] },
      { name: "Sanitary & Bath Fittings", products: ["Wall Mixer Bathroom Tap", "Overhead Shower Head", "Basin Tap Faucet", "Health Faucet Spray", "Angle Valve"] },
      { name: "Overhead Water Tanks", products: ["Sintex Water Tank 1000L", "Supreme Water Tank 1000L", "Plasto Plastic Water Tank"] }
    ]
  },
  {
    name: "General Hardware & Tools",
    subcategories: [
      { name: "Construction Tools", products: ["Steel Hammer 2kg", "Concrete Finishing Trowel", "Masonry Trowel", "Brick Hammer", "Chisel Set"] },
      { name: "Measuring Tools", products: ["Measuring Tape 5 Meter", "Spirit Level Tool", "Laser Level Tool"] },
      { name: "Safety Equipment", products: ["Safety Helmet", "Reflective Safety Jacket", "Safety Gloves", "Safety Shoes", "Safety Goggles"] }
    ]
  }
];

async function run() {
  const connection = await mysql.createConnection({
    host: '157.173.222.55',
    user: 'civilworks_user',
    password: 'Civilworks@123',
    database: 'civilworks_qa'
  });

  try {
    console.log("Clearing existing QA data...");
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE products');
    await connection.query('TRUNCATE TABLE subcategories');
    await connection.query('TRUNCATE TABLE categories');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log("Seeding QA data...");
    for (const cat of data) {
      const [catResult] = await connection.query('INSERT INTO categories (name, icon) VALUES (?, ?)', [cat.name, 'categories']);
      const catId = catResult.insertId;
      console.log(`Inserted category: ${cat.name} (${catId})`);

      for (const sub of cat.subcategories) {
        const [subResult] = await connection.query('INSERT INTO subcategories (category_id, name) VALUES (?, ?)', [catId, sub.name]);
        const subId = subResult.insertId;
        console.log(`  Inserted subcategory: ${sub.name} (${subId})`);

        for (const prod of sub.products) {
          const slug = prod.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
          await connection.query(
            'INSERT INTO products (category_id, subcategory_id, name, slug, price, description) VALUES (?, ?, ?, ?, ?, ?)',
            [catId, subId, prod, slug, 100.00, `Description for ${prod}`]
          );
        }
      }
    }
    console.log("QA Seeding complete!");
    process.exit(0);
  } catch(e) {
    console.error("Error:", e);
    process.exit(1);
  }
}

run();
