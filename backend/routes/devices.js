const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'dashboard_user',
  host: process.env.POSTGRES_HOST || 'postgres',
  database: process.env.POSTGRES_DB || 'dashboard_db',
  password: process.env.POSTGRES_PASSWORD || 'dashboard_password',
  port: 5432,
});

// 獲取所有設備列表
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT device_id FROM devices ORDER BY created_at DESC');
    const devices = result.rows.map((row) => row.device_id);
    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices from database:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch devices', details: error.message });
  }
});

// 獲取設備設定
router.get('/:deviceId/settings', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM device_settings WHERE device_id = $1', [deviceId]);
    if (result.rowCount === 0) {
      // 如果設定不存在，插入一筆預設值
      await pool.query(
        'INSERT INTO device_settings (device_id, group_name, container_id, tractor_id, geofence_setting, label_color, custom_name, license_plate, driver, phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [deviceId, 'default', '', '', null, '#000000', '', '', '', '']
      );
      return res.json({
        device_id: deviceId,
        group_name: 'default',
        container_id: '',
        tractor_id: '',
        geofence_id: null,
        label_color: '#000000',
        custom_name: '',
        license_plate: '',
        driver: '',
        phone: '',
      });
    }
    res.json({
      device_id: result.rows[0].device_id,
      group_name: result.rows[0].group_name,
      container_id: result.rows[0].container_id,
      tractor_id: result.rows[0].tractor_id,
      geofence_id: result.rows[0].geofence_setting, // 映射為 geofence_id 以符合前端
      label_color: result.rows[0].label_color,
      custom_name: result.rows[0].custom_name || '',
      license_plate: result.rows[0].license_plate || '',
      driver: result.rows[0].driver || '',
      phone: result.rows[0].phone || '',
    });
  } catch (error) {
    console.error('Error fetching device settings:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch device settings', details: error.message });
  }
});

// 儲存設備設定
router.post('/:deviceId/settings', async (req, res) => {
  const { deviceId } = req.params;
  const { group, containerId, tractorId, geofenceId, labelColor, customName, licensePlate, driver, phone } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO device_settings (device_id, group_name, container_id, tractor_id, geofence_setting, label_color, custom_name, license_plate, driver, phone) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ' +
      'ON CONFLICT (device_id) ' +
      'DO UPDATE SET group_name = $2, container_id = $3, tractor_id = $4, geofence_setting = $5, label_color = $6, custom_name = $7, license_plate = $8, driver = $9, phone = $10, updated_at = CURRENT_TIMESTAMP ' +
      'RETURNING *',
      [deviceId, group, containerId, tractorId, geofenceId, labelColor, customName, licensePlate, driver, phone]
    );
    res.json({
      device_id: result.rows[0].device_id,
      group_name: result.rows[0].group_name,
      container_id: result.rows[0].container_id,
      tractor_id: result.rows[0].tractor_id,
      geofence_id: result.rows[0].geofence_setting,
      label_color: result.rows[0].label_color,
      custom_name: result.rows[0].custom_name || '',
      license_plate: result.rows[0].license_plate || '',
      driver: result.rows[0].driver || '',
      phone: result.rows[0].phone || '',
    });
  } catch (error) {
    console.error('Error saving device settings:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to save device settings', details: error.message });
  }
});

module.exports = router;