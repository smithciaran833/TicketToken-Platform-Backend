import fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import underPressure from '@fastify/under-pressure';
import { v4 as uuidv4 } from 'uuid';
import { orderRoutes, healthRoutes, metricsRoutes } from './routes';
import taxRoutes from './routes/tax.routes';
import refundPolicyRoutes from './routes/refund-policy.routes';
import { idempotencyCacheHook } from './middleware';
import { traceMiddleware } from './middleware/trace.middleware';
import { initializeDatabase } from './config/database';
import { initRedis, getRedis } from './config/redis';
import { connectRabbitMQ } from './config/rabbitmq';
import { eventSubscriber } from './events';
import { logger } from './utils/logger';
import jwtAuthPlugin from './plugins/jwt-auth.plugin';

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

// LOW: List of internal service identifiers for rate limit bypass
const INTERNAL_SERVICE_IDS = [
  'payment-service',
  'ticket-service',
  'event-service',
  'notification-service',
  'auth-service',
  'marketplace-service',
];

// Simple error handler
const errorHandler = async (error: any, request: any, reply: any) => {
  // MEDIUM: Include requestId and traceId in error responses
  const isProduction = process.env.NODE_ENV === 'production';
  const traceId = (request as any).traceId || request.id;
  
  logger.error('Request error', {
    error: error.message,
    stack: isProduction ? undefined : error.stack,
    requestId: request.id,
    traceId,
  });
  
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    statusCode: error.statusCode || 500,
    requestId: request.id,
    traceId,
  });
};

/**
 * LOW: Check if request is from internal service
 */
function isInternalServiceRequest(request: any): boolean {
  const serviceHeader = request.headers['x-service-name'] as string;
  const internalSecret = request.headers['x-internal-secret'] as string;
  
  // Must have both service name and valid secret
  if (!serviceHeader || !internalSecret) {
    return false;
  }
  
  // Verify secret matches
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (!expectedSecret || internalSecret !== expectedSecret) {
    return false;
  }
  
  // Verify service is in whitelist
  return INTERNAL_SERVICE_IDS.includes(serviceHeader);
}

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
    await initRedis();
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

  // HIGH: Register under-pressure plugin for backpressure monitoring
  // Monitors event loop delay, heap usage, and RSS memory
  await app.register(underPressure, {
    maxEventLoopDelay: 1000, // 1 second max event loop delay
    maxHeapUsedBytes: 1_000_000_000, // 1GB heap limit
    maxRssBytes: 1_500_000_000, // 1.5GB RSS limit
    maxEventLoopUtilization: 0.98, // 98% event loop utilization
    pressureHandler: (_req, rep, type, value) => {
      logger.warn('Service under pressure', { type, value, service: SERVICE_NAME });
      rep.status(503).send({
        error: 'Service Unavailable',
        message: 'Server is under heavy load, please try again later',
        type,
        retryAfter: 30,
      });
    },
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'debug',
      },
      url: '/health/pressure',
    },
  });
  logger.info('Under-pressure plugin registered');

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Idempotency-Key', 'X-Trace-ID', 'X-Service-Name', 'X-Internal-Secret'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Server-Time', 'X-Trace-ID'],
    maxAge: 86400, // 24 hours
  });

  // Register compression (gzip/deflate)
  await app.register(compress, {
    global: true,
    threshold: 1024, // Only compress responses > 1KB
    encodings: ['gzip', 'deflate'],
  });

  // MEDIUM: Register rate limiting with Redis store for distribution
  // MEDIUM: Include tenant ID in rate limit key for tenant-scoped limits
  // LOW: Bypass rate limiting for internal service calls
  const redis = getRedis();
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // MEDIUM: Use Redis for distributed rate limiting across instances
    redis: redis,
    // MEDIUM: Tenant-scoped rate limiting - each tenant gets their own limit
    keyGenerator: (request) => {
      const tenantId = (request as any).tenantId || 'anonymous';
      const userId = (request as any).user?.id || request.ip;
      return `rate-limit:${tenantId}:${userId}`;
    },
    // LOW: Skip rate limiting for health checks AND internal service calls
    allowList: (request) => {
      // Always allow health checks
      if (request.url.startsWith('/health')) {
        return true;
      }
      // LOW: Bypass rate limiting for internal service-to-service calls
      if (isInternalServiceRequest(request)) {
        logger.debug('Rate limit bypassed for internal service', {
          service: request.headers['x-service-name'],
          path: request.url,
        });
        return true;
      }
      return false;
    },
    // Add rate limit info to response headers
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
  logger.info('Rate limiting registered with Redis store');

  // SEC-R1, SEC-R2: Register JWT authentication plugin BEFORE routes
  await app.register(jwtAuthPlugin);
  logger.info('JWT authentication plugin registered');

  // LOW: Register trace middleware for distributed tracing (X-Trace-ID)
  app.addHook('onRequest', traceMiddleware);

  // Register idempotency cache hook globally
  app.addHook('onSend', idempotencyCacheHook);

  // MEDIUM: Add X-Server-Time header to all responses
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Server-Time', new Date().toISOString());
  });

  // Register tenant middleware (CRITICAL: must be before routes)
  const { tenantMiddleware } = await import('./middleware/tenant.middleware');
  app.addHook('preHandler', tenantMiddleware);

  // Register routes - health and metrics are public
  await app.register(healthRoutes);
  await app.register(metricsRoutes);

  // Register authenticated routes
  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(taxRoutes, { prefix: '/api/v1/tax' });
  await app.register(refundPolicyRoutes, { prefix: '/api/v1/refund-policy' });

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
