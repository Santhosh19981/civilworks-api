const { pool } = require('../config/db.config');

class HelperMemberRepository {
    async findAll(filters = {}) {
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 10;
        const offset = (page - 1) * limit;

        let query = `
            FROM helper_members hm 
            LEFT JOIN helper_member_services hms ON hm.id = hms.helper_member_id
            LEFT JOIN helpers h ON hms.helper_id = h.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.search) {
            query += ' AND (hm.name LIKE ? OR hm.mobile LIKE ? OR h.service_name LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
        }

        if (filters.helper_id) {
            query += ' AND hm.id IN (SELECT helper_member_id FROM helper_member_services WHERE helper_id = ?)';
            params.push(filters.helper_id);
        }

        if (filters.status) {
            query += ' AND hm.status = ?';
            params.push(filters.status);
        }

        // Get total count
        const [countRows] = await pool.execute(`SELECT COUNT(DISTINCT hm.id) as total ${query}`, params);
        const total = countRows[0].total;

        // Get data
        const [rows] = await pool.query(
            `SELECT hm.*, GROUP_CONCAT(h.service_name) as service_names, GROUP_CONCAT(h.id) as helper_ids 
             ${query} 
             GROUP BY hm.id 
             ORDER BY hm.updated_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

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
            SELECT hm.*, GROUP_CONCAT(h.service_name) as service_names, GROUP_CONCAT(h.id) as helper_ids
            FROM helper_members hm 
            LEFT JOIN helper_member_services hms ON hm.id = hms.helper_member_id
            LEFT JOIN helpers h ON hms.helper_id = h.id 
            WHERE hm.id = ?
            GROUP BY hm.id
        `, [id]);
        
        if (rows[0] && rows[0].helper_ids) {
            rows[0].service_ids = rows[0].helper_ids.split(',').map(Number);
        } else if (rows[0]) {
            rows[0].service_ids = [];
        }
        
        return rows[0];
    }

    async create(memberData) {
        const { name, service_ids, experience, mobile, image } = memberData;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                'INSERT INTO helper_members (name, experience, mobile, image) VALUES (?, ?, ?, ?)',
                [name, experience, mobile, image]
            );
            const memberId = result.insertId;

            if (service_ids && Array.isArray(service_ids)) {
                for (const helperId of service_ids) {
                    await connection.execute(
                        'INSERT INTO helper_member_services (helper_member_id, helper_id) VALUES (?, ?)',
                        [memberId, helperId]
                    );
                }
            }

            await connection.commit();
            return memberId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async update(id, updateData) {
        const { service_ids, ...otherData } = updateData;
        const fields = [];
        const values = [];
        const allowedFields = ['name', 'experience', 'mobile', 'image', 'status'];
        
        for (const [key, value] of Object.entries(otherData)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            if (fields.length > 0) {
                values.push(id);
                await connection.execute(
                    `UPDATE helper_members SET ${fields.join(', ')} WHERE id = ?`,
                    values
                );
            }

            if (service_ids && Array.isArray(service_ids)) {
                // Remove old services
                await connection.execute('DELETE FROM helper_member_services WHERE helper_member_id = ?', [id]);
                // Add new services
                for (const helperId of service_ids) {
                    await connection.execute(
                        'INSERT INTO helper_member_services (helper_member_id, helper_id) VALUES (?, ?)',
                        [id, helperId]
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

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM helper_members WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

module.exports = new HelperMemberRepository();
