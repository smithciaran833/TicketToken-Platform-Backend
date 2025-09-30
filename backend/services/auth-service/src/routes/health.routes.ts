import { Router } from 'express';
import { pool } from '../config/database';

const router = Router();

// Basic health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

// Database health check
router.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'auth-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'auth-service'
    });
  }
});

export default router;
