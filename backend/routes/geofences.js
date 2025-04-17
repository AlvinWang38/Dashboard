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
    const result = await pool.query('SELECT * FROM geofences ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching geofences:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.post('/', async (req, res) => {
  const { name, description, color, coordinates } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO geofences (name, description, color, coordinates) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, color, JSON.stringify(coordinates)]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating geofence:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, color, coordinates } = req.body;
  try {
    const result = await pool.query(
      'UPDATE geofences SET name = $1, description = $2, color = $3, coordinates = $4 WHERE id = $5 RETURNING *',
      [name, description, color, JSON.stringify(coordinates), id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating geofence:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM geofences WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting geofence:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;