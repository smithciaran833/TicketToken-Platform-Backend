import { Router } from 'express';

const router = Router();

// Basic health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'minting-service' });
});

// Database health check
router.get('/health/db', async (req, res) => {
  try {
    // Import the appropriate database connection for this service
    const { pool } = require('../config/database');
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'minting-service' 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: (error as Error).message || "Unknown error",
      service: 'minting-service'
    });
  }
});

export default router;
