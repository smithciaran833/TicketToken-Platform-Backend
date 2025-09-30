import { Router } from 'express';
import { db } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'search-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'search-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'search-service'
    });
  }
});

export default router;
