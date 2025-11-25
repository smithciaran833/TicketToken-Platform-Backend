import fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import { v4 as uuidv4 } from 'uuid';
import { orderRoutes, healthRoutes, internalRoutes, metricsRoutes, reportsRoutes, adminRoutes, privacyRoutes } from './routes';
import { errorHandler, idempotencyCacheHook } from './middleware';
import { initializeDatabase } from './config/database';
import { RedisService } from './services/redis.service';
import { connectRabbitMQ } from './config/rabbitmq';
import { eventSubscriber } from './events';
import { logger } from './utils/logger';

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => uuidv4(),
    bodyLimit: 10485760, // 10MB limit
  });

  // Initialize database
  try {
    initializeDatabase();
    logger.info('Database connection initialized');
  } catch (error) {
    logger.error('Failed to initialize database', { error });
    throw error;
  }

  // Initialize Redis
  try {
    await RedisService.initialize();
    logger.info('Redis connection initialized');
  } catch (error) {
    logger.error('Failed to initialize Redis', { error });
    throw error;
  }

  // Initialize RabbitMQ
  try {
    await connectRabbitMQ();
    logger.info('RabbitMQ connection initialized');
    
    // Subscribe to events
    await eventSubscriber.subscribeToPaymentEvents();
    logger.info('Event subscriptions initialized');
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ', { error });
    // Don't throw - allow service to start without RabbitMQ
  }

  // Register security plugins
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // Register CORS with proper origin validation
  await app.register(cors, {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3001',
      ];
      
      // Allow requests with no origin (mobile apps, curl, postman)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Idempotency-Key'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24 hours
  });

  // Register compression (gzip/deflate)
  await app.register(compress, {
    global: true,
    threshold: 1024, // Only compress responses > 1KB
    encodings: ['gzip', 'deflate'],
  });

  // Register rate limiting (in-memory)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Register idempotency cache hook globally
  app.addHook('onSend', idempotencyCacheHook);

  // Register security headers middleware (PCI-DSS compliance)
  const { securityHeadersMiddleware } = await import('./middleware/security-headers.middleware');
  app.addHook('onRequest', securityHeadersMiddleware);

  // Register tracing middleware (captures full request lifecycle)
  const { tracingMiddleware } = await import('./middleware/tracing.middleware');
  app.addHook('onRequest', tracingMiddleware);

  // Register tenant middleware (CRITICAL: must be before routes)
  const { tenantMiddleware } = await import('./middleware/tenant.middleware');
  app.addHook('preHandler', tenantMiddleware);

  // Register MFA middleware (PCI-DSS: MFA for admin access to payment data)
  const { mfaMiddleware } = await import('./middleware/mfa.middleware');
  app.addHook('preHandler', mfaMiddleware);

  // Register IP whitelist middleware (PCI-DSS: Restrict payment operations)
  const { ipWhitelistMiddleware } = await import('./middleware/ip-whitelist.middleware');
  app.addHook('preHandler', ipWhitelistMiddleware);

  // Register routes
  await app.register(healthRoutes);
  await app.register(metricsRoutes);
  await app.register(internalRoutes);
  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(reportsRoutes, { prefix: '/api/v1/reports' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(privacyRoutes, { prefix: '/api/v1/privacy' });

  // Service info endpoint
  app.get('/info', async (request, reply) => {
    return {
      service: SERVICE_NAME,
      version: '1.0.0',
      port: process.env.PORT || 3005,
      status: 'healthy',
    };
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  return app;
}
