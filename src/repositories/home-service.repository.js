const { pool } = require('../config/db.config');

class HomeServiceRepository {
    async findAll() {
        const [rows] = await pool.query(
            'SELECT * FROM home_services ORDER BY display_order ASC, created_at DESC'
        );
        return await this.populateRelatedItems(rows);
    }

    async findActive() {
        const [rows] = await pool.query(
            'SELECT * FROM home_services WHERE status = "active" ORDER BY display_order ASC, created_at DESC'
        );
        return await this.populateRelatedItems(rows);
    }

    async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM home_services WHERE id = ?', [id]);
        if (!rows[0]) return null;
        const populated = await this.populateRelatedItems([rows[0]]);
        return populated[0];
    }

    async populateRelatedItems(services) {
        const populatedServices = [];
        for (const service of services) {
            const serviceObj = { ...service };
            
            if (serviceObj.related_ids) {
                const ids = serviceObj.related_ids.split(',').filter(id => id).map(id => parseInt(id, 10));
                
                if (ids.length > 0) {
                    let tableName = '';
                    let nameField = 'name';
                    
                    switch (serviceObj.type) {
                        case 'Categories':
                            tableName = 'categories';
                            break;
                        case 'Rental':
                            tableName = 'rental_categories';
                            break;
                        case 'Helpers':
                            tableName = 'helpers';
                            nameField = 'service_name';
                            break;
                    }
                    
                    if (tableName) {
                        try {
                            const [items] = await pool.query(
                                `SELECT id, ${nameField} as label FROM ${tableName} WHERE id IN (?)`,
                                [ids]
                            );
                            
                            serviceObj.related_items = items;
                            
                            if (items && items.length > 0) {
                                serviceObj.subtitle = items.map(i => i.label).join(', ');
                            }
                        } catch (err) {
                            serviceObj.related_items = [];
                        }
                    } else {
                        serviceObj.related_items = [];
                    }
                } else {
                    serviceObj.related_items = [];
                }
            } else {
                serviceObj.related_items = [];
            }
            populatedServices.push(serviceObj);
        }
        return populatedServices;
    }

    async create(data) {
        const { type, title, subtitle, icon, related_ids, display_order, status } = data;
        const [result] = await pool.execute(
            'INSERT INTO home_services (type, title, subtitle, icon, related_ids, display_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [type, title, subtitle, icon, related_ids || '', display_order || 0, status || 'active']
        );
        return result.insertId;
    }

    async update(id, data) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (['type', 'title', 'subtitle', 'icon', 'related_ids', 'display_order', 'status'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE home_services SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    async delete(id) {
        const [result] = await pool.execute('DELETE FROM home_services WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    async reorder(idOrderMap) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            for (const { id, order } of idOrderMap) {
                await connection.execute(
                    'UPDATE home_services SET display_order = ? WHERE id = ?',
                    [order, id]
                );
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
}

module.exports = new HomeServiceRepository();
