const { pool } = require('../config/db.config');

class ProductRepository {
    async findAll(filters = {}, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        let query = `
            SELECT 
                p.*, 
                s.name as subcategory_name,
                s.image as subcategory_image,
                s.type as subcategory_type,
                s.measurement_type,
                c.name as category_name,
                c.icon as category_image,
                c.main_category_id,
                mc.name as main_category_name,
                u.name as unit_name,
                u.unit_category
            FROM products p 
            LEFT JOIN subcategories s ON p.subcategory_id = s.id 
            LEFT JOIN categories c ON p.category_id = c.id 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id
            LEFT JOIN units u ON p.unit_id = u.id
            WHERE 1=1`;
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM products p 
            LEFT JOIN subcategories s ON p.subcategory_id = s.id 
            LEFT JOIN categories c ON p.category_id = c.id 
            LEFT JOIN main_categories mc ON c.main_category_id = mc.id
            LEFT JOIN units u ON p.unit_id = u.id
            WHERE 1=1`;
        const params = [];

        if (filters.main_category_id) {
            const matchCond = ' AND (c.main_category_id = ? OR EXISTS (SELECT 1 FROM category_main_categories cmc WHERE cmc.category_id = c.id AND cmc.main_category_id = ?))';
            query += matchCond;
            countQuery += matchCond;
            params.push(filters.main_category_id, filters.main_category_id);
        }

        if (filters.category_id) {
            query += ' AND p.category_id = ?';
            countQuery += ' AND p.category_id = ?';
            params.push(filters.category_id);
        }

        if (filters.subcategory_id) {
            query += ' AND p.subcategory_id = ?';
            countQuery += ' AND p.subcategory_id = ?';
            params.push(filters.subcategory_id);
        }

        if (filters.type || filters.subcategory_type) {
            const subType = filters.type || filters.subcategory_type;
            query += ' AND s.type = ?';
            countQuery += ' AND s.type = ?';
            params.push(subType);
        }

        if (filters.status) {
            query += ' AND p.status = ?';
            countQuery += ' AND p.status = ?';
            params.push(filters.status);
        }

        if (filters.featured !== undefined) {
            query += ' AND p.featured = ?';
            countQuery += ' AND p.featured = ?';
            params.push(filters.featured ? 1 : 0);
        }

        if (filters.search) {
            query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            countQuery += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        // Get total count
        const [[{ total }]] = await pool.execute(countQuery, params);

        // Add pagination to query
        query += ' ORDER BY p.id ASC LIMIT ? OFFSET ?';
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
            `SELECT 
                p.*, 
                s.name as subcategory_name,
                s.image as subcategory_image,
                s.type as subcategory_type,
                s.measurement_type,
                c.name as category_name,
                c.icon as category_image,
                c.main_category_id,
                mc.name as main_category_name,
                u.name as unit_name,
                u.unit_category
             FROM products p 
             LEFT JOIN subcategories s ON p.subcategory_id = s.id 
             LEFT JOIN categories c ON p.category_id = c.id 
             LEFT JOIN main_categories mc ON c.main_category_id = mc.id
             LEFT JOIN units u ON p.unit_id = u.id
             WHERE p.id = ?`,
            [id]
        );
        return rows[0];
    }

    async findBySlug(slug) {
        const [rows] = await pool.execute(
            `SELECT 
                p.*, 
                s.name as subcategory_name,
                s.image as subcategory_image,
                s.type as subcategory_type,
                s.measurement_type,
                c.name as category_name,
                c.icon as category_image,
                c.main_category_id,
                mc.name as main_category_name,
                u.name as unit_name,
                u.unit_category
             FROM products p 
             LEFT JOIN subcategories s ON p.subcategory_id = s.id 
             LEFT JOIN categories c ON p.category_id = c.id 
             LEFT JOIN main_categories mc ON c.main_category_id = mc.id
             LEFT JOIN units u ON p.unit_id = u.id
             WHERE p.slug = ?`,
            [slug]
        );
        return rows[0];
    }

    async create(productData) {
        const {
            category_id,
            subcategory_id,
            unit_id = null,
            name,
            slug,
            image = null,
            price = 0,
            stock = 0,
            description = null,
            status = 'active',
            featured = false,
            skills = null
        } = productData;

        const skillsVal = Array.isArray(skills) ? JSON.stringify(skills) : (skills || null);

        const [result] = await pool.execute(
            'INSERT INTO products (category_id, subcategory_id, unit_id, name, slug, image, price, stock, description, status, featured, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [category_id, subcategory_id, unit_id, name, slug, image, price, stock, description, status, featured ? 1 : 0, skillsVal]
        );
        return result.insertId;
    }

    async update(id, updateData) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updateData)) {
            if (['category_id', 'subcategory_id', 'unit_id', 'name', 'slug', 'image', 'price', 'stock', 'description', 'status', 'featured', 'skills'].includes(key)) {
                fields.push(`${key} = ?`);
                let finalVal = value;
                if (key === 'featured') finalVal = value ? 1 : 0;
                if (key === 'skills' && Array.isArray(value)) finalVal = JSON.stringify(value);
                values.push(finalVal);
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
