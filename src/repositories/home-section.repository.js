const { pool } = require('../config/db.config');

class HomeSectionRepository {
    async findAll() {
        const [rows] = await pool.query('SELECT * FROM home_sections ORDER BY order_index ASC');
        return rows;
    }

    async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM home_sections WHERE id = ?', [id]);
        return rows[0];
    }

    async findActiveWithItems() {
        const [sections] = await pool.query('SELECT * FROM home_sections WHERE status = "active" ORDER BY order_index ASC');
        
        for (let section of sections) {
            const [items] = await pool.execute(`
                SELECT hsi.*, 
                CASE 
                    WHEN hsi.item_type = 'product' THEN p.name 
                    WHEN hsi.item_type = 'rental' THEN r.name 
                END as name,
                CASE 
                    WHEN hsi.item_type = 'product' THEN p.price 
                    WHEN hsi.item_type = 'rental' THEN r.pricePerDay 
                END as price,
                CASE 
                    WHEN hsi.item_type = 'product' THEN p.image 
                    WHEN hsi.item_type = 'rental' THEN r.image 
                END as image,
                CASE 
                    WHEN hsi.item_type = 'product' THEN p.category_id 
                    WHEN hsi.item_type = 'rental' THEN r.rental_category_id 
                END as category_id
                FROM home_section_items hsi
                LEFT JOIN products p ON hsi.item_id = p.id AND hsi.item_type = 'product'
                LEFT JOIN rentals r ON hsi.item_id = r.id AND hsi.item_type = 'rental'
                WHERE hsi.section_id = ?
                ORDER BY hsi.order_index ASC
            `, [section.id]);
            section.items = items;
        }
        
        return sections;
    }

    async create(data) {
        const { name, title, status, order_index } = data;
        const [result] = await pool.execute(
            'INSERT INTO home_sections (name, title, status, order_index) VALUES (?, ?, ?, ?)',
            [name, title, status || 'active', order_index || 0]
        );
        return result.insertId;
    }

    async updateItems(sectionId, items) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            // Delete existing items
            await connection.execute('DELETE FROM home_section_items WHERE section_id = ?', [sectionId]);
            
            // Insert new items
            if (items && items.length > 0) {
                for (let i = 0; i < items.length; i++) {
                    const { item_id, item_type } = items[i];
                    await connection.execute(
                        'INSERT INTO home_section_items (section_id, item_id, item_type, order_index) VALUES (?, ?, ?, ?)',
                        [sectionId, item_id, item_type, i]
                    );
                }
            }
            
            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async updateSection(id, data) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (['name', 'title', 'status', 'order_index'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE home_sections SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM home_sections WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new HomeSectionRepository();
