import dotenv from 'dotenv';
dotenv.config();

// Validate environment variables before starting
import { validateEnv } from './config/env-validation';
validateEnv();

// SI4: Validate service identity at startup (fail fast if invalid)
import { validateServiceIdentity, getServiceIdentity } from './config/service-auth';
validateServiceIdentity();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import underPressure from '@fastify/under-pressure';
import { DatabaseService } from './services/databaseService';
import { initRedis, getRedis, closeRedisConnections } from './config/redis';
import { initializeMongoDB, closeMongoDB } from './config/mongodb';
import { createDependencyContainer } from './config/dependencies';
import { ReservationCleanupService } from './services/reservation-cleanup.service';
import { db, connectDatabase } from './config/database';
import routes from './routes';
import healthRoutes from './routes/health.routes';
import { register } from './utils/metrics';
import { logger } from './utils/logger';
import { registerRateLimiting } from './middleware/rate-limit';
import { registerErrorHandler } from './middleware/error-handler';
import { registerResponseMiddleware } from './middleware/response.middleware';
import { closeAllQueues, getQueueStats, QUEUE_NAMES } from './jobs';
import { initializeEventTransitionsProcessor } from './jobs/event-transitions.job';

// AUDIT FIX (LOW-BODY): Configurable body size limit
// Default: 1MB (1048576 bytes), configurable via BODY_LIMIT env var
const BODY_LIMIT = parseInt(process.env.BODY_LIMIT || '1048576', 10);

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  },
  requestTimeout: 30000, // 30 second timeout for all requests
  connectionTimeout: 10000, // 10 second connection timeout
  keepAliveTimeout: 72000, // 72 seconds (longer than AWS ALB idle timeout)
  
  // AUDIT FIX (LOW-BODY): Limit request body size to prevent DoS
  // Prevents memory exhaustion from large payloads
  bodyLimit: BODY_LIMIT
});

const PORT = parseInt(process.env.PORT || '3003', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Global cleanup service instance
let cleanupService: ReservationCleanupService | null = null;

async function start(): Promise<void> {
  try {
    // Initialize database (Pool connection for DatabaseService)
    await DatabaseService.initialize();
    logger.info('Database Pool connected');

    // Initialize Knex database connection with retry logic
    await connectDatabase();
    logger.info('Knex database connected');

    // Initialize Redis
    await initRedis();
    logger.info('Redis connected');

    // Initialize MongoDB
    await initializeMongoDB();
    logger.info('MongoDB connected');

    // Create dependency injection container
    const container = createDependencyContainer();
    logger.info('Dependency container initialized');

    // Decorate Fastify with container
    app.decorate('container', container);

    // Add hook to attach container to each request
    app.addHook('onRequest', async (request, reply) => {
      (request as any).container = container;
    });

    // Register plugins
    await app.register(helmet, {
      contentSecurityPolicy: false
    });

    await app.register(cors, {
      origin: true,
      credentials: true
    });

    // CRITICAL FIX: Event loop monitoring with @fastify/under-pressure
    // Prevents server from becoming unresponsive under load
    await app.register(underPressure, {
      maxEventLoopDelay: 1000, // 1 second max event loop delay
      maxHeapUsedBytes: 1073741824, // 1GB max heap
      maxRssBytes: 2147483648, // 2GB max RSS
      maxEventLoopUtilization: 0.98, // 98% max event loop utilization
      retryAfter: 50, // Retry-After header value (ms)
      exposeStatusRoute: {
        routeOpts: {
          logLevel: 'debug',
        },
        routeSchemaOpts: {
          hide: true, // Hide from OpenAPI
        },
        url: '/health/pressure', // Expose pressure status at this URL
      },
      healthCheck: async function () {
        // Basic health check that runs on every request
        return true;
      },
      healthCheckInterval: 5000, // Check every 5 seconds
    });
    logger.info('Event loop monitoring (under-pressure) enabled');

    // Register rate limiting (Redis-backed, fail-open)
    await registerRateLimiting(app);

    // Register error handler (production-safe error responses)
    registerErrorHandler(app);

    // AUDIT FIX (LOW): Register response middleware for X-Request-ID and Cache-Control headers
    registerResponseMiddleware(app);
    logger.info('Response middleware enabled (X-Request-ID, Cache-Control)');

    // Register health and metrics routes (no prefix, no auth)
    app.get('/health', async (_request, reply) => {
      const health: any = {
        status: 'healthy',
        service: 'event-service',
        security: 'enabled',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'unknown',
          redis: 'unknown',
          reservationCleanup: 'unknown'
        }
      };

      let isHealthy = true;

      // Check database connectivity
      try {
        await db.raw('SELECT 1');
        health.checks.database = 'healthy';
      } catch (error) {
        health.checks.database = 'unhealthy';
        isHealthy = false;
        logger.error({ error }, 'Database health check failed');
      }

      // Check Redis connectivity
      try {
        const redis = getRedis();
        await redis.ping();
        health.checks.redis = 'healthy';
      } catch (error) {
        health.checks.redis = 'unhealthy';
        isHealthy = false;
        logger.error({ error }, 'Redis health check failed');
      }

      // Check reservation cleanup service
      if (cleanupService) {
        const status = cleanupService.getStatus();
        health.checks.reservationCleanup = status.isRunning ? 'healthy' : 'stopped';
        health.reservationCleanup = status;
      } else {
        health.checks.reservationCleanup = 'not_started';
      }

      health.status = isHealthy ? 'healthy' : 'degraded';

      // Return appropriate status code
      return reply.status(isHealthy ? 200 : 503).send(health);
    });

    app.get('/metrics', async (_request, reply) => {
      reply.type('text/plain');
      return register.metrics();
    });

    // Register API routes with prefix
    await app.register(routes, { prefix: '/api/v1' });

    // Start server
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT, host: HOST }, 'Event Service running');
    logger.info('Security enabled - all routes protected with authentication and tenant isolation');

    // Start reservation cleanup background job
    const cleanupIntervalMinutes = parseInt(process.env.RESERVATION_CLEANUP_INTERVAL_MINUTES || '1', 10);
    cleanupService = new ReservationCleanupService(db, cleanupIntervalMinutes);
    cleanupService.start();
    logger.info({ intervalMinutes: cleanupIntervalMinutes }, 'Reservation cleanup job started');

    // Initialize Bull job queues for event transitions
    await initializeEventTransitionsProcessor();
    logger.info('Event transitions job processor initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to start event service');
    process.exit(1);
  }
}

// AUDIT FIX (GD-3): Pre-stop sleep for load balancer drain delay
const PRESTOP_DELAY_MS = parseInt(process.env.PRESTOP_DELAY_MS || '5000', 10);

// Enhanced graceful shutdown with complete resource cleanup
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, shutting down gracefully');
  
  try {
    // AUDIT FIX (GD-3): Wait for load balancer to drain connections
    // This gives the LB time to stop sending new requests before we close
    logger.info({ delayMs: PRESTOP_DELAY_MS }, 'PreStop delay: waiting for LB to drain connections');
    await new Promise(resolve => setTimeout(resolve, PRESTOP_DELAY_MS));

    // 1. Stop accepting new requests
    await app.close();
    logger.info('HTTP server closed, no longer accepting new requests');

    // 2. Stop background jobs
    if (cleanupService) {
      cleanupService.stop();
      logger.info('Reservation cleanup job stopped');
    }

    // 2.5 Close job queues
    await closeAllQueues();
    logger.info('Job queues closed');

    // 3. Close database connections
    const pool = DatabaseService.getPool();
    if (pool) {
      await pool.end();
      logger.info('Database pool closed');
    }

    // 4. Close Knex connection
    if (db) {
      await db.destroy();
      logger.info('Knex database connection closed');
    }

    // 5. Close MongoDB connection
    await closeMongoDB();
    logger.info('MongoDB connection closed');

    // 6. Close Redis connections
    await closeRedisConnections();
    logger.info('Redis connections closed');

    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start().catch((error) => {
  logger.error({ error }, 'Failed to start event service');
  process.exit(1);
});
