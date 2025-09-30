import { Router } from 'express';

const router = Router();

// Basic health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'scanning-service' });
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
      service: 'scanning-service' 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: (error as any).message,
      service: 'scanning-service'
    });
  }
});

export default router;
