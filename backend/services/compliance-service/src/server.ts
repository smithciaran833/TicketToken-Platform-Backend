/**
 * Server Configuration for Compliance Service
 * 
 * AUDIT FIXES:
 * - RL-1: Rate limiting NOT REGISTERED → Now registered via setupRateLimiting()
 * - ERR-3: Not RFC 7807 format → Updated error handler
 * - LOG-2: No correlation ID → Added request ID middleware
 */
import Fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { logger } from './utils/logger';
import { randomUUID } from 'crypto';

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
import { internalRoutes } from './routes/internal.routes';

// Middleware
import { authenticate, requireAdmin, requireComplianceOfficer } from './middleware/auth.middleware';
import { setupRateLimiting } from './middleware/rate-limit.middleware';

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 10485760, // 10MB for file uploads
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID()
  });

  // Register plugins
  await app.register(helmet);
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });

  // ==========================================================================
  // AUDIT FIX RL-1: Register rate limiting (was previously DORMANT)
  // ==========================================================================
  await setupRateLimiting(app);
  logger.info('Rate limiting registered');

  // ==========================================================================
  // AUDIT FIX LOG-2: Add correlation ID / request ID to all requests
  // ==========================================================================
  app.addHook('onRequest', async (request, reply) => {
    // Ensure requestId is set
    request.requestId = request.id as string;
    // Store start time for response time calculation
    (request as any).startTime = Date.now();
    
    // Log incoming request
    logger.info({
      requestId: request.requestId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    }, 'Incoming request');
  });

  // Add request ID to response headers
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-Id', request.requestId);
    return payload;
  });

  // Log response
  app.addHook('onResponse', async (request, reply) => {
    const responseTime = (request as any).startTime ? Date.now() - (request as any).startTime : 0;
    logger.info({
      requestId: request.requestId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime
    }, 'Request completed');
  });

  // Health routes (no auth required)
  await app.register(healthRoutes);

  // Webhook routes (special auth - handled internally)
  await app.register(webhookRoutes);

  // Internal routes (service-to-service communication - HMAC auth handled internally)
  await app.register(internalRoutes, { prefix: '/internal' });

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
          tenantId,
          requestId: request.requestId
        });
      } catch (error: any) {
        logger.error({
          requestId: request.requestId,
          error: error.message,
          stack: error.stack
        }, 'Retention enforcement error');
        
        return reply.code(500).send({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to enforce retention policies',
          instance: request.requestId
        });
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
          return reply.code(400).send({
            type: 'urn:error:compliance-service:validation',
            title: 'Validation Error',
            status: 400,
            detail: 'Missing required fields: customerId, saleAmount, ticketId',
            instance: request.requestId
          });
        }

        const result = await customerTaxService.trackNFTSale(
          customerId,
          saleAmount,
          ticketId
        );

        return reply.send({ success: true, data: result, requestId: request.requestId });
      } catch (error: any) {
        logger.error({
          requestId: request.requestId,
          error: error.message,
          stack: error.stack
        }, 'NFT tax tracking error');
        
        return reply.code(500).send({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: error.message,
          instance: request.requestId
        });
      }
    });

    // State compliance
    fastify.post('/api/v1/compliance/state/validate-resale', async (request, reply) => {
      try {
        const { stateComplianceService } = await import('./services/state-compliance.service');
        const { state, originalPrice, resalePrice } = request.body as any;

        if (!state || originalPrice === undefined || resalePrice === undefined) {
          return reply.code(400).send({
            type: 'urn:error:compliance-service:validation',
            title: 'Validation Error',
            status: 400,
            detail: 'Missing required fields: state, originalPrice, resalePrice',
            instance: request.requestId
          });
        }

        const result = await stateComplianceService.validateResale(
          state,
          originalPrice,
          resalePrice
        );

        return reply.send({ success: true, data: result, requestId: request.requestId });
      } catch (error: any) {
        logger.error({
          requestId: request.requestId,
          error: error.message,
          stack: error.stack
        }, 'State compliance error');
        
        return reply.code(500).send({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: error.message,
          instance: request.requestId
        });
      }
    });
  });

  // Cache management endpoints (authenticated)
  app.get('/cache/stats', { onRequest: authenticate }, async (request, reply) => {
    const { serviceCache } = require('./services/cache-integration');
    const stats = serviceCache.getStats();
    return reply.send({ ...stats, requestId: request.requestId });
  });

  app.delete('/cache/flush', { onRequest: authenticate }, async (request, reply) => {
    const { serviceCache } = require('./services/cache-integration');
    await serviceCache.flush();
    return reply.send({ success: true, message: 'Cache flushed', requestId: request.requestId });
  });

  // ==========================================================================
  // AUDIT FIX ERR-3: RFC 7807 404 handler
  // ==========================================================================
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send({
      type: 'urn:error:compliance-service:not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} not found`,
      instance: request.requestId
    });
  });

  // ==========================================================================
  // AUDIT FIX ERR-3: RFC 7807 error handler
  // ==========================================================================
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    logger.error({
      requestId: request.requestId,
      error: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode
    }, 'Request error');

    // Handle validation errors
    if (error.validation) {
      return reply.code(400).send({
        type: 'urn:error:compliance-service:validation',
        title: 'Validation Error',
        status: 400,
        detail: error.message,
        instance: request.requestId,
        validationErrors: error.validation
      });
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      return reply.code(429).send({
        type: 'urn:error:compliance-service:rate-limit',
        title: 'Too Many Requests',
        status: 429,
        detail: error.message,
        instance: request.requestId
      });
    }

    // Default RFC 7807 error response
    const statusCode = error.statusCode || 500;
    return reply.code(statusCode).send({
      type: `urn:error:compliance-service:${statusCode === 500 ? 'internal' : 'error'}`,
      title: statusCode === 500 ? 'Internal Server Error' : 'Error',
      status: statusCode,
      detail: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      instance: request.requestId
    });
  });

  return app;
}

export default createServer;
