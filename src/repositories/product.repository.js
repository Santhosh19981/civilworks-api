const { pool } = require('../config/db.config');

class ProductRepository {
    async findAll(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT 
                p.*, 
                s.name as subcategory_name, 
                c.name as category_name
            FROM products p 
            LEFT JOIN subcategories s ON p.subcategory_id = s.id 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE 1=1`;
        let countQuery = 'SELECT COUNT(*) as total FROM products p WHERE 1=1';
        const params = [];

        if (filters.category_id) {
            query += ' AND p.category_id = ?';
            countQuery += ' AND category_id = ?';
            params.push(filters.category_id);
        }

        if (filters.subcategory_id) {
            query += ' AND p.subcategory_id = ?';
            countQuery += ' AND subcategory_id = ?';
            params.push(filters.subcategory_id);
        }

        if (filters.featured !== undefined) {
            query += ' AND p.featured = ?';
            countQuery += ' AND featured = ?';
            params.push(filters.featured ? 1 : 0);
        }

        if (filters.search) {
            query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            countQuery += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        // Get total count
        const [[{ total }]] = await pool.execute(countQuery, params);

        // Add pagination to query
        query += ' ORDER BY p.updated_at DESC LIMIT ? OFFSET ?';
        const queryParams = [...params, limit.toString(), offset.toString()];

        const [rows] = await pool.execute(query, queryParams);
        
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
        const [rows] = await pool.execute(
            `SELECT p.*, s.name as subcategory_name, c.name as category_name 
             FROM products p 
             LEFT JOIN subcategories s ON p.subcategory_id = s.id 
             LEFT JOIN categories c ON p.category_id = c.id 
             WHERE p.id = ?`,
            [id]
        );
        return rows[0];
    }

    async findBySlug(slug) {
        const [rows] = await pool.execute(
            `SELECT p.*, s.name as subcategory_name, c.name as category_name 
             FROM products p 
             LEFT JOIN subcategories s ON p.subcategory_id = s.id 
             LEFT JOIN categories c ON p.category_id = c.id 
             WHERE p.slug = ?`,
            [slug]
        );
        return rows[0];
    }

    async create(productData) {
        const { category_id, subcategory_id, name, slug, image, price, stock, description, featured = false } = productData;
        const [result] = await pool.execute(
            'INSERT INTO products (category_id, subcategory_id, name, slug, image, price, stock, description, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [category_id, subcategory_id, name, slug, image, price, stock, description, featured ? 1 : 0]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['category_id', 'subcategory_id', 'name', 'slug', 'image', 'price', 'stock', 'description', 'status', 'featured'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'featured' ? (value ? 1 : 0) : value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM products WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new ProductRepository();
