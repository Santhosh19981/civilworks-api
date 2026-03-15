const { pool } = require('../config/db.config');

class SettingsRepository {
    async getSettings() {
        const [rows] = await pool.execute('SELECT * FROM settings ORDER BY id DESC LIMIT 1');
        return rows[0];
    }

    async updateSettings(id, data) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (['delivery_charge', 'tax_percentage', 'cod_enabled', 'helper_tax_percentage', 'service_charge', 'support_mobile', 'support_email'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return false;
        values.push(id);
        const [result] = await pool.execute(
            `UPDATE settings SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }
}

module.exports = new SettingsRepository();
