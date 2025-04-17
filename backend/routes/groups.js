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

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT group_name FROM groups');
    const groups = result.rows.map(row => row.group_name);
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch groups', details: error.message });
  }
});

router.post('/', async (req, res) => {
  const { groupName } = req.body;
  try {
    await pool.query(
      'INSERT INTO groups (group_name) VALUES ($1) ON CONFLICT DO NOTHING',
      [groupName]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding group:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to add group', details: error.message });
  }
});

module.exports = router;