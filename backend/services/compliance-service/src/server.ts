import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { logger } from './utils/logger';

// Import routes
import { healthRoutes } from './routes/health.routes';
import { venueRoutes } from './routes/venue.routes';
import { taxRoutes } from './routes/tax.routes';
import { ofacRoutes } from './routes/ofac.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { documentRoutes } from './routes/document.routes';
import { riskRoutes } from './routes/risk.routes';
import { bankRoutes } from './routes/bank.routes';
import { adminRoutes } from './routes/admin.routes';
import { batchRoutes } from './routes/batch.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { gdprRoutes } from './routes/gdpr.routes';

// Middleware
import { authenticate, requireAdmin, requireComplianceOfficer } from './middleware/auth.middleware';

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 10485760 // 10MB for file uploads
  });

  // Register plugins
  await app.register(helmet);
  await app.register(cors);
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });

  // Request logging
  app.addHook('onRequest', async (request, reply) => {
    console.log(`📥 ${request.method} ${request.url}`);
  });

  // Health routes (no auth required)
  await app.register(healthRoutes);

  // Webhook routes (special auth - handled internally)
  await app.register(webhookRoutes);

  // API routes - ALL REQUIRE AUTHENTICATION
  await app.register(async (fastify) => {
    // Apply authentication to all routes in this scope
    fastify.addHook('onRequest', authenticate);

    // Regular compliance routes (authenticated)
    await fastify.register(venueRoutes, { prefix: '/api/v1/compliance' });
    await fastify.register(taxRoutes, { prefix: '/api/v1/compliance' });
    await fastify.register(ofacRoutes, { prefix: '/api/v1/compliance' });
    await fastify.register(dashboardRoutes, { prefix: '/api/v1/compliance' });
    await fastify.register(documentRoutes, { prefix: '/api/v1/compliance' });
    await fastify.register(riskRoutes, { prefix: '/api/v1/compliance' });
    await fastify.register(bankRoutes, { prefix: '/api/v1/compliance' });
    await fastify.register(gdprRoutes, { prefix: '/api/v1/compliance' });

    // Admin routes (require admin role)
    await fastify.register(async (adminScope) => {
      adminScope.addHook('onRequest', requireAdmin);
      await adminScope.register(adminRoutes, { prefix: '/api/v1/compliance' });
      await adminScope.register(batchRoutes, { prefix: '/api/v1/compliance' });
    });

    // Additional admin endpoints
    fastify.post('/api/v1/compliance/admin/enforce-retention', {
      onRequest: requireAdmin
    }, async (request, reply) => {
      try {
        const { dataRetentionService } = await import('./services/data-retention.service');
        const tenantId = request.tenantId;

        await dataRetentionService.enforceRetention();

        return reply.send({
          success: true,
          message: 'Retention policies enforced',
          tenantId
        });
      } catch (error: any) {
        console.error('Retention enforcement error:', error);
        return reply.code(500).send({ error: error.message });
      }
    });

    // Customer tax tracking
    fastify.post('/api/v1/compliance/tax/track-nft-sale', {
      onRequest: requireComplianceOfficer
    }, async (request, reply) => {
      try {
        const { customerTaxService } = await import('./services/customer-tax.service');
        const { customerId, saleAmount, ticketId } = request.body as any;

        if (!customerId || !saleAmount || !ticketId) {
          return reply.code(400).send({ error: 'Missing required fields' });
        }

        const result = await customerTaxService.trackNFTSale(
          customerId,
          saleAmount,
          ticketId
        );

        return reply.send({ success: true, data: result });
      } catch (error: any) {
        console.error('NFT tax tracking error:', error);
        return reply.code(500).send({ error: error.message });
      }
    });

    // State compliance
    fastify.post('/api/v1/compliance/state/validate-resale', async (request, reply) => {
      try {
        const { stateComplianceService } = await import('./services/state-compliance.service');
        const { state, originalPrice, resalePrice } = request.body as any;

        if (!state || originalPrice === undefined || resalePrice === undefined) {
          return reply.code(400).send({ error: 'Missing required fields' });
        }

        const result = await stateComplianceService.validateResale(
          state,
          originalPrice,
          resalePrice
        );

        return reply.send({ success: true, data: result });
      } catch (error: any) {
        console.error('State compliance error:', error);
        return reply.code(500).send({ error: error.message });
      }
    });
  });

  // Cache management endpoints (authenticated)
  app.get('/cache/stats', { onRequest: authenticate }, async (request, reply) => {
    const { serviceCache } = require('./services/cache-integration');
    const stats = serviceCache.getStats();
    return reply.send(stats);
  });

  app.delete('/cache/flush', { onRequest: authenticate }, async (request, reply) => {
    const { serviceCache } = require('./services/cache-integration');
    await serviceCache.flush();
    return reply.send({ success: true, message: 'Cache flushed' });
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'Route not found' });
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    console.error('❌ Error:', error);
    reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}
