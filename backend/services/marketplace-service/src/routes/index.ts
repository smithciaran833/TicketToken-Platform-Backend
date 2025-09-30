import { Router } from 'express';
import listingsRoutes from './listings.routes';
import transfersRoutes from './transfers.routes';
import venueRoutes from './venue.routes';
import searchRoutes from './search.routes';
import adminRoutes from './admin.routes';
import disputesRoutes from './disputes.routes';
import taxRoutes from './tax.routes';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Health check (no auth required)
router.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'marketplace-service',
    timestamp: new Date().toISOString()
  });
});

// Route groups
router.use('/listings', listingsRoutes);
router.use('/transfers', transfersRoutes);
router.use('/venues', venueRoutes);
router.use('/search', searchRoutes);
router.use('/admin', adminRoutes);
router.use('/disputes', disputesRoutes);
router.use('/tax', taxRoutes);

// Marketplace statistics (authenticated)
router.get('/stats', authMiddleware, async (_req, res) => {
  try {
    // Get marketplace statistics
    res.json({
      totalListings: 0,
      totalSales: 0,
      volume24h: 0,
      averagePrice: 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cache management endpoints
router.get('/cache/stats', async (_req, res) => {
  const { cache } = require('../services/cache-integration');
  const stats = await cache.getStats();
  res.json(stats);
});

router.delete('/cache/flush', async (_req, res) => {
  const { cache } = require('../services/cache-integration');
  await cache.flush();
  res.json({ success: true, message: 'Cache flushed' });
});

export default router;
