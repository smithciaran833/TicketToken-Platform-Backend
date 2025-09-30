import { Router } from 'express';
import { pool } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'payment-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'payment-service'
    });
  }
});

export default router;
