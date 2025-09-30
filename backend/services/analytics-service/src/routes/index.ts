import { Router } from 'express';
import analyticsRoutes from './analytics.routes';

const router = Router();

// Mount analytics routes
router.use('/', analyticsRoutes);

// Export as named export to match what app.ts expects
export { router };

// Cache management endpoints
router.get('/cache/stats', async (req, res) => {
  const { serviceCache } = require('../services/cache-integration');
  const stats = serviceCache.getStats();
  res.json(stats);
});

router.delete('/cache/flush', async (req, res) => {
  const { serviceCache } = require('../services/cache-integration');
  await serviceCache.flush();
  res.json({ success: true, message: 'Cache flushed' });
});
