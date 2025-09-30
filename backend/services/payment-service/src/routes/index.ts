import { Router } from 'express';
import paymentRoutes from './payment.routes';
import marketplaceRoutes from './marketplace.routes';
import groupPaymentRoutes from './group-payment.routes';
import venueRoutes from './venue.routes';
import complianceRoutes from './compliance.routes';
import webhookRoutes from './webhook.routes';
import internalRoutes from './internal.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'payment-service',
    timestamp: new Date().toISOString()
  });
});

// Mount routes
router.use('/payments', paymentRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/group-payments', groupPaymentRoutes);
router.use('/venues', venueRoutes);
router.use('/compliance', complianceRoutes);
router.use('/webhooks', webhookRoutes);
router.use('', internalRoutes); // Internal routes at root level

export default router;
