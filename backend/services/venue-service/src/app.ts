import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import { registerDependencies } from './config/dependencies';
import { configureFastify } from './config/fastify';
import { db, startPoolMonitoring, checkDatabaseConnection } from './config/database';
import { initializeCache } from './services/cache.service';
import { createRateLimiter } from './middleware/rate-limit.middleware';
import { versionMiddleware } from './middleware/versioning.middleware';
import { errorHandler } from './middleware/error-handler.middleware';
import Redis from 'ioredis';

export async function buildApp(): Promise<FastifyInstance> {
  // Check database connection with retry
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    throw new Error('Failed to connect to database after retries');
  }

  // Start database pool monitoring
  startPoolMonitoring();

  // Initialize Redis with retry strategy
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false
  });

  // Wait for Redis to be ready
  await new Promise<void>((resolve, reject) => {
    redis.once('ready', resolve);
    redis.once('error', reject);
    setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
  });

  // Initialize dependency injection container
  const container = registerDependencies(db, redis);

  // Initialize cache service and rate limiter
  const cacheService = initializeCache(redis);
  const rateLimiter = createRateLimiter(redis);

  // Initialize EventPublisher connection
  const eventPublisher = container.resolve('eventPublisher');
  await eventPublisher.connect();

  // Create Fastify instance with built-in logger
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
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
      if (process.env.NODE_ENV !== "test") {
        await rateLimiter.checkAllLimits(request, reply);

      }
    } catch (error) {
      throw error;
    }
  });

  // Configure Fastify with plugins and routes
  await configureFastify(fastify, container);

  // Health check routes

  // Graceful shutdown hooks
  fastify.addHook('onClose', async () => {
    await eventPublisher.close();
    await redis.quit();
    await db.destroy();
  });

  return fastify;
}
