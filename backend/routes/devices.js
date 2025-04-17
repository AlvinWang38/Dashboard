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

module.exports = router;