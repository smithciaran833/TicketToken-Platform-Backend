const express = require('express');
const router = express.Router();
const { pool } = require('../utils/database');

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'blockchain-indexer' });
});

router.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'blockchain-indexer' 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'blockchain-indexer'
    });
  }
});

module.exports = router;
