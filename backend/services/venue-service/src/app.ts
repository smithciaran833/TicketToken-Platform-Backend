import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import { registerDependencies } from './config/dependencies';
import { configureFastify } from './config/fastify';
import { db, startPoolMonitoring, checkDatabaseConnection } from './config/database';
import { initializeCache } from './services/cache.service';
import { createRateLimiter } from './middleware/rate-limit.middleware';
import { versionMiddleware } from './middleware/versioning.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import { storeIdempotencyResponse } from './middleware/idempotency.middleware';
import { initRedis, getRedis, closeRedisConnections } from './config/redis';
import { initializeMongoDB } from './config/mongodb';
import venueContentRoutes from './routes/venue-content.routes';
import venueReviewsRoutes from './routes/venue-reviews.routes';
import onboardingRoutes from './routes/onboarding.routes';
import venueStripeRoutes, { venueStripeWebhookRoutes, configureRawBodyForWebhooks } from './routes/venue-stripe.routes';
import verificationRoutes from './routes/verification.routes';
import webhooksRoutes from './routes/webhooks.routes';
import { markStartupComplete, markStartupFailed } from './routes/health.routes';
import { startScheduledJobs, stopScheduledJobs } from './jobs';

export async function buildApp(): Promise<FastifyInstance> {
  try {
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
    const trustProxyEnv = process.env.TRUSTED_PROXIES;
    let trustProxy: boolean | string | string[] | number = false;

    if (trustProxyEnv === 'false') {
      trustProxy = false;
    } else if (trustProxyEnv) {
      trustProxy = trustProxyEnv.split(',').map(p => p.trim()).filter(Boolean);
    } else {
      trustProxy = [
        '127.0.0.1',
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
      ];
    }

    // Create Fastify instance with built-in logger
    const fastify = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info'
      },
      requestIdHeader: 'x-request-id',
      trustProxy,
      bodyLimit: 10485760, // 10MB
      requestTimeout: 30000
    });

    // Decorate with container and additional services
    fastify.decorate('container', container);
    fastify.decorate('db', db);  // FIX: Add db decoration
    fastify.decorate('redis', getRedis());  // FIX: Add redis decoration too
    fastify.decorate('cacheService', cacheService);
    fastify.decorate('rateLimiter', rateLimiter);
    fastify.decorate('eventPublisher', eventPublisher);  // FIX: Add eventPublisher decoration

    // WEBHOOK FIX: Configure raw body parsing for Stripe webhooks
    configureRawBodyForWebhooks(fastify);

    // Register global error handler
    fastify.setErrorHandler(errorHandler);

    // Add versioning middleware
    fastify.addHook('onRequest', versionMiddleware);

    // Add global rate limiting
    fastify.addHook('preHandler', async (request, reply) => {
      if (request.url.startsWith('/health')) {
        return;
      }

      try {
        if (true) {
          await rateLimiter.checkAllLimits(request, reply);
        }
      } catch (error) {
        throw error;
      }
    });

    // Add idempotency response storage hook
    fastify.addHook('onSend', storeIdempotencyResponse);

    // Configure Fastify with plugins and routes
    await configureFastify(fastify, container);

    // Register MongoDB-based routes
    await fastify.register(venueContentRoutes, { prefix: '/api/venues' });

    // Register review routes
    await fastify.register(venueReviewsRoutes, { prefix: '/api/venues' });

    // Register onboarding routes - FIXED: Added /v1
    await fastify.register(onboardingRoutes, { prefix: '/api/v1/venues' });

    // Register Stripe Connect routes
    await fastify.register(venueStripeRoutes, { prefix: '/api/venues' });
    await fastify.register(venueStripeWebhookRoutes, { prefix: '/api' });

    // Register verification routes
    await fastify.register(verificationRoutes, { prefix: '/api/venues/:venueId' });

    // Register webhook routes (Plaid, Stripe Identity)
    await fastify.register(webhooksRoutes, { prefix: '/api/webhooks' });

    // Graceful shutdown hooks
    fastify.addHook('onClose', async () => {
      stopScheduledJobs();
      await eventPublisher.close();
      await closeRedisConnections();
      await db.destroy();
    });

    // Start scheduled background jobs
    await startScheduledJobs();

    // Mark startup as complete
    markStartupComplete();

    return fastify;
  } catch (error) {
    // Mark startup as failed
    markStartupFailed(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
