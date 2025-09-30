import { Router } from 'express';
import { authenticate, requireAdmin, requireComplianceOfficer } from '../middleware/auth.middleware';
import healthRoutes from './health.routes';
import venueRoutes from './venue.routes';
import taxRoutes from './tax.routes';
import ofacRoutes from './ofac.routes';
import dashboardRoutes from './dashboard.routes';
import documentRoutes from './document.routes';
import riskRoutes from './risk.routes';
import bankRoutes from './bank.routes';
import adminRoutes from './admin.routes';
import batchRoutes from './batch.routes';
import webhookRoutes from './webhook.routes';
import gdprRoutes from './gdpr.routes';

const router = Router();

// Health routes (no auth required - for monitoring)
router.use('/', healthRoutes);

// Webhook routes (special auth - handled internally)
router.use('/', webhookRoutes);

// API routes - ALL REQUIRE AUTHENTICATION
const apiPrefix = '/api/v1/compliance';

// Apply authentication to ALL compliance routes
router.use(apiPrefix, authenticate);

// Regular compliance routes (authenticated)
router.use(apiPrefix, venueRoutes);
router.use(apiPrefix, taxRoutes);
router.use(apiPrefix, ofacRoutes);
router.use(apiPrefix, dashboardRoutes);
router.use(apiPrefix, documentRoutes);
router.use(apiPrefix, riskRoutes);
router.use(apiPrefix, bankRoutes);
router.use(apiPrefix, gdprRoutes);

// Admin routes (require admin role)
router.use(apiPrefix, requireAdmin, adminRoutes);
router.use(apiPrefix, requireAdmin, batchRoutes);

// Admin route for data retention - SECURED
router.post(`${apiPrefix}/admin/enforce-retention`,
  requireAdmin,
  async (req, res) => {
    try {
      const { dataRetentionService } = await import('../services/data-retention.service');
      const tenantId = (req as any).tenantId;

      // enforceRetention doesn't take arguments
      await dataRetentionService.enforceRetention();

      return res.json({
        success: true,
        message: 'Retention policies enforced',
        tenantId
      });
    } catch (error: any) {
      console.error('Retention enforcement error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// Customer tax tracking - SECURED
router.post(`${apiPrefix}/tax/track-nft-sale`,
  requireComplianceOfficer,
  async (req, res) => {
    try {
      const { customerTaxService } = await import('../services/customer-tax.service');
      const tenantId = (req as any).tenantId;

      // Validate input
      const { customerId, saleAmount, ticketId } = req.body;

      if (!customerId || !saleAmount || !ticketId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // trackNFTSale only takes 3 arguments
      const result = await customerTaxService.trackNFTSale(
        customerId,
        saleAmount,
        ticketId
      );

      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('NFT tax tracking error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// State compliance - SECURED
router.post(`${apiPrefix}/state/validate-resale`,
  async (req, res) => {
    try {
      const { stateComplianceService } = await import('../services/state-compliance.service');
      const tenantId = (req as any).tenantId;

      // Validate input
      const { state, originalPrice, resalePrice } = req.body;

      if (!state || originalPrice === undefined || resalePrice === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // validateResale only takes 3 arguments
      const result = await stateComplianceService.validateResale(
        state,
        originalPrice,
        resalePrice
      );

      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('State compliance error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// Cache management endpoints
router.get('/cache/stats', async (req, res) => {
  const { serviceCache } = require('../services/cache-integration');
  const stats = serviceCache.getStats();
  return res.json(stats);
});

router.delete('/cache/flush', async (req, res) => {
  const { serviceCache } = require('../services/cache-integration');
  await serviceCache.flush();
  return res.json({ success: true, message: 'Cache flushed' });
});

export default router;
