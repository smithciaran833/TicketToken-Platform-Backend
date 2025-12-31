import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import { registerDependencies } from './config/dependencies';
import { configureFastify } from './config/fastify';
import { db, startPoolMonitoring, checkDatabaseConnection } from './config/database';
import { initializeCache } from './services/cache.service';
import { createRateLimiter } from './middleware/rate-limit.middleware';
import { versionMiddleware } from './middleware/versioning.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import { initRedis, getRedis, closeRedisConnections } from './config/redis';
import { initializeMongoDB } from './config/mongodb';
import venueContentRoutes from './routes/venue-content.routes';
import venueReviewsRoutes from './routes/venue-reviews.routes';
import venueStripeRoutes, { venueStripeWebhookRoutes } from './routes/venue-stripe.routes';

export async function buildApp(): Promise<FastifyInstance> {
  // Check database connection with retry
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    throw new Error('Failed to connect to database after retries');
  }

  // Start database pool monitoring
  startPoolMonitoring();

  // Initialize Redis
  await initRedis();

  // Initialize MongoDB
  const mongodb = await initializeMongoDB();

  // Initialize dependency injection container
  const container = registerDependencies(db, getRedis(), mongodb);

  // Initialize cache service and rate limiter
  const cacheService = initializeCache(getRedis());
  const rateLimiter = createRateLimiter(getRedis());

  // Initialize EventPublisher connection
  const eventPublisher = container.resolve('eventPublisher');
  await eventPublisher.connect();

  // SECURITY FIX (HM2): Parse trusted proxies from environment
  // Default to common internal network ranges, or disable if explicitly set to 'false'
  const trustProxyEnv = process.env.TRUSTED_PROXIES;
  let trustProxy: boolean | string | string[] | number = false;
  
  if (trustProxyEnv === 'false') {
    trustProxy = false;
  } else if (trustProxyEnv) {
    // Parse comma-separated list of trusted proxy IPs/ranges
    trustProxy = trustProxyEnv.split(',').map(p => p.trim()).filter(Boolean);
  } else {
    // Default to common internal network ranges for Kubernetes/Docker
    trustProxy = [
      '127.0.0.1',        // localhost
      '10.0.0.0/8',       // Class A private network (Kubernetes)
      '172.16.0.0/12',    // Class B private network (Docker default)
      '192.168.0.0/16',   // Class C private network
    ];
  }

  // Create Fastify instance with built-in logger
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    },
    requestIdHeader: 'x-request-id',
    // SECURITY FIX (HM2): Use explicit trusted proxy list instead of trusting all
    trustProxy,
    bodyLimit: 10485760, // 10MB
    requestTimeout: 30000
  });

  // Decorate with container and additional services
  fastify.decorate('container', container);
  fastify.decorate('cacheService', cacheService);
  fastify.decorate('rateLimiter', rateLimiter);

  // Register global error handler
  fastify.setErrorHandler(errorHandler);

  // Add versioning middleware
  fastify.addHook('onRequest', versionMiddleware);

  // Add global rate limiting
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip rate limiting for health checks
    if (request.url.startsWith('/health')) {
      return;
    }

    try {
      if (true) { // Rate limiting enabled for all envs
        await rateLimiter.checkAllLimits(request, reply);
      }
    } catch (error) {
      throw error;
    }
  });

  // Configure Fastify with plugins and routes
  await configureFastify(fastify, container);

  // Register MongoDB-based routes
  await fastify.register(venueContentRoutes, { prefix: '/api/venues' });

  // Register review routes
  await fastify.register(venueReviewsRoutes, { prefix: '/api/venues' });

  // Register Stripe Connect routes
  await fastify.register(venueStripeRoutes, { prefix: '/api/venues' });
  await fastify.register(venueStripeWebhookRoutes, { prefix: '/api' });

  // Health check routes

  // Graceful shutdown hooks
  fastify.addHook('onClose', async () => {
    await eventPublisher.close();
    await closeRedisConnections();
    await db.destroy();
  });

  return fastify;
}
