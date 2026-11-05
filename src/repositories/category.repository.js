const { pool } = require('../config/db.config');

class CategoryRepository {
    async _attachMainCategories(categories) {
        if (!categories || categories.length === 0) return categories;
        const categoryIds = categories.map(c => c.id);
        const placeholders = categoryIds.map(() => '?').join(',');
        const [rows] = await pool.execute(`
            SELECT cmc.category_id, cmc.main_category_id, mc.name as main_category_name
            FROM category_main_categories cmc
            JOIN main_categories mc ON cmc.main_category_id = mc.id
            WHERE cmc.category_id IN (${placeholders})
            ORDER BY cmc.main_category_id ASC
        `, categoryIds);

        const map = {};
        for (const r of rows) {
            if (!map[r.category_id]) {
                map[r.category_id] = [];
            }
            map[r.category_id].push(r);
        }

        for (const c of categories) {
            const list = map[c.id] || [];
            c.main_categories = list.map(item => ({ id: item.main_category_id, name: item.main_category_name }));
            c.main_category_ids = list.map(item => Number(item.main_category_id));
            c.main_category_names = list.map(item => item.main_category_name);
            if (c.main_category_ids.length > 0) {
                c.main_category_id = c.main_category_ids[0];
                c.main_category_name = c.main_category_names.join(', ');
            }
        }
        return categories;
    }

    async findAll(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT c.*, mc.name as main_category_name 
            FROM categories c 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id 
            WHERE 1=1
        `;
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM categories c 
            WHERE 1=1
        `;
        const params = [];
        const countParams = [];

        if (filters.main_category_id) {
            const matchCond = ' AND (c.main_category_id = ? OR EXISTS (SELECT 1 FROM category_main_categories cmc WHERE cmc.category_id = c.id AND cmc.main_category_id = ?))';
            query += matchCond;
            countQuery += matchCond;
            params.push(filters.main_category_id, filters.main_category_id);
            countParams.push(filters.main_category_id, filters.main_category_id);
        }

        if (filters.status) {
            query += ' AND c.status = ?';
            countQuery += ' AND c.status = ?';
            params.push(filters.status);
            countParams.push(filters.status);
        }

        if (filters.search) {
            const searchCond = ' AND (c.name LIKE ? OR c.description LIKE ?)';
            query += searchCond;
            countQuery += searchCond;
            params.push(`%${filters.search}%`, `%${filters.search}%`);
            countParams.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        const [[{ total }]] = await pool.execute(countQuery, countParams);

        query += ' ORDER BY c.id ASC LIMIT ? OFFSET ?';
        const [rows] = await pool.execute(query, [...params, limit.toString(), offset.toString()]);

        await this._attachMainCategories(rows);

        return {
            data: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async findById(id) {
        const [rows] = await pool.execute(`
            SELECT c.*, mc.name as main_category_name 
            FROM categories c 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id 
            WHERE c.id = ?
        `, [id]);
        if (!rows[0]) return null;
        await this._attachMainCategories(rows);
        return rows[0];
    }

    async create(categoryData) {
        const { name, main_category_id, main_category_ids = [], description = null, icon = 'categories', status = 'active' } = categoryData;
        const ids = Array.isArray(main_category_ids) && main_category_ids.length > 0 
            ? main_category_ids.map(Number).filter(Boolean) 
            : (main_category_id ? [Number(main_category_id)] : []);
        
        const primaryMainCatId = ids.length > 0 ? ids[0] : (main_category_id || null);

        const [result] = await pool.execute(
            'INSERT INTO categories (name, main_category_id, description, icon, status) VALUES (?, ?, ?, ?, ?)',
            [name, primaryMainCatId, description, icon, status]
        );
        const categoryId = result.insertId;

        // Insert into category_main_categories
        for (const mcId of ids) {
            await pool.execute(
                'INSERT IGNORE INTO category_main_categories (category_id, main_category_id) VALUES (?, ?)',
                [categoryId, mcId]
            );
        }

        return categoryId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        
        let ids = undefined;
        if (updateData.main_category_ids !== undefined) {
            ids = Array.isArray(updateData.main_category_ids)
                ? updateData.main_category_ids.map(Number).filter(Boolean)
                : [];
        } else if (updateData.main_category_id !== undefined) {
            ids = [Number(updateData.main_category_id)].filter(Boolean);
        }

        if (ids !== undefined && ids.length > 0) {
            updateData.main_category_id = ids[0];
        }

        for (const [key, value] of Object.entries(updateData)) {
            if (['name', 'main_category_id', 'description', 'icon', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length > 0) {
            values.push(id);
            await pool.execute(
                `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }

        // Sync category_main_categories if ids is provided
        if (ids !== undefined) {
            await pool.execute('DELETE FROM category_main_categories WHERE category_id = ?', [id]);
            for (const mcId of ids) {
                await pool.execute(
                    'INSERT IGNORE INTO category_main_categories (category_id, main_category_id) VALUES (?, ?)',
                    [id, mcId]
                );
            }
        }

        return true;
    }

    async countDependentSubcategories(id) {
        const [[{ count }]] = await pool.execute(
            'SELECT COUNT(*) as count FROM subcategories WHERE category_id = ?',
            [id]
        );
        return count;
    }

    async delete(id) {
        const deletedId = Number(id);
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            // Disable foreign key checks for this connection during cascading delete and ID renumbering
            await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

            // 1. Delete dependent relations/records for this category
            await connection.execute('DELETE FROM category_main_categories WHERE category_id = ?', [deletedId]);
            await connection.execute('DELETE FROM products WHERE category_id = ?', [deletedId]);
            await connection.execute('DELETE FROM subcategories WHERE category_id = ?', [deletedId]);
            await connection.execute('UPDATE rentals SET category_id = NULL WHERE category_id = ?', [deletedId]);
            await connection.execute('DELETE FROM helpers WHERE category_id = ?', [deletedId]);
            const [result] = await connection.execute('DELETE FROM categories WHERE id = ?', [deletedId]);

            if (result.affectedRows > 0) {
                // 2. Fetch all categories with id > deletedId in ascending order
                const [remaining] = await connection.execute(
                    'SELECT id FROM categories WHERE id > ? ORDER BY id ASC',
                    [deletedId]
                );

                // 3. Renumber each succeeding category down by 1 so there are no gaps
                // e.g. #16 becomes #15, #17 becomes #16, etc.
                for (const cat of remaining) {
                    const oldId = cat.id;
                    const newId = oldId - 1;

                    // Update category primary key
                    await connection.execute('UPDATE categories SET id = ? WHERE id = ?', [newId, oldId]);
                    // Update all dependent tables
                    await connection.execute('UPDATE category_main_categories SET category_id = ? WHERE category_id = ?', [newId, oldId]);
                    await connection.execute('UPDATE subcategories SET category_id = ? WHERE category_id = ?', [newId, oldId]);
                    await connection.execute('UPDATE products SET category_id = ? WHERE category_id = ?', [newId, oldId]);
                    await connection.execute('UPDATE rentals SET category_id = ? WHERE category_id = ?', [newId, oldId]);
                    await connection.execute('UPDATE helpers SET category_id = ? WHERE category_id = ?', [newId, oldId]);
                }

                // 4. Reset auto_increment to max(id) + 1
                const [maxRow] = await connection.execute('SELECT MAX(id) as maxId FROM categories');
                const nextAuto = (maxRow[0]?.maxId || 0) + 1;
                await connection.execute(`ALTER TABLE categories AUTO_INCREMENT = ${nextAuto}`);
            }

            await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
            await connection.commit();
            return result.affectedRows > 0;
        } catch (err) {
            try {
                await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
            } catch (ignore) {}
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }
}

module.exports = new CategoryRepository();
