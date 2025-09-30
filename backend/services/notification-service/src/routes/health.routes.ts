import { Router } from 'express';
import { db } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'notification-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'notification-service'
    });
  }
});

export default router;
