import dotenv from 'dotenv';
dotenv.config();

// Validate environment variables before starting
import { validateEnv } from './config/env-validation';
validateEnv();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
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
  keepAliveTimeout: 72000 // 72 seconds (longer than AWS ALB idle timeout)
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

    // Register rate limiting (Redis-backed, fail-open)
    await registerRateLimiting(app);

    // Register error handler (production-safe error responses)
    registerErrorHandler(app);

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
  } catch (error) {
    logger.error({ error }, 'Failed to start event service');
    process.exit(1);
  }
}

// Enhanced graceful shutdown with complete resource cleanup
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, shutting down gracefully');
  
  try {
    // 1. Stop accepting new requests
    await app.close();
    logger.info('HTTP server closed, no longer accepting new requests');

    // 2. Stop background jobs
    if (cleanupService) {
      cleanupService.stop();
      logger.info('Reservation cleanup job stopped');
    }

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
