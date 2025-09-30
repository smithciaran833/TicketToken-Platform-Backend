import { Router } from 'express';
import jobRoutes from './job.routes';
import queueRoutes from './queue.routes';
import healthRoutes from './health.routes';
import metricsRoutes from './metrics.routes';
import alertsRoutes from './alerts.routes';
import rateLimitRoutes from './rate-limit.routes';

const router = Router();

// Mount routes
router.use('/jobs', jobRoutes);
router.use('/queues', queueRoutes);
router.use('/health', healthRoutes);
router.use('/metrics', metricsRoutes);
router.use('/alerts', alertsRoutes);
router.use('/rate-limits', rateLimitRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'Queue Service API',
    version: '1.0.0',
    endpoints: {
      jobs: '/api/v1/queue/jobs',
      queues: '/api/v1/queue/queues',
      health: '/api/v1/queue/health',
      metrics: '/api/v1/queue/metrics',
      alerts: '/api/v1/queue/alerts',
      rateLimits: '/api/v1/queue/rate-limits'
    }
  });
});

export default router;

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
