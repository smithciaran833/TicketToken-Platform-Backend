import dotenv from 'dotenv';
dotenv.config();

// Validate environment variables before starting
import { validateEnv } from './config/env-validation';
validateEnv();

// SI4: Validate service identity at startup (fail fast if invalid)
import { validateServiceIdentity, getServiceIdentity, shutdownServiceAuth } from './config/service-auth';
import { shutdownAuthMiddleware } from './middleware/auth';
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
import { getDb, connectDatabase } from './config/database';
import routes from './routes';
import healthRoutes from './routes/health.routes';
import { register } from './utils/metrics';
import { logger } from './utils/logger';
import { registerRateLimiting } from './middleware/rate-limit';
import { registerErrorHandler } from './middleware/error-handler';
import { registerResponseMiddleware } from './middleware/response.middleware';
import { closeAllQueues, getQueueStats, QUEUE_NAMES } from './jobs';
import { initializeEventTransitionsProcessor } from './jobs/event-transitions.job';
import { initializeRabbitMQ, shutdownRabbitMQ } from './config/rabbitmq';

// ============================================================
// Configuration Constants
// ============================================================

// AUDIT FIX (LOW-BODY): Configurable body size limit
// Default: 1MB (1048576 bytes), configurable via BODY_LIMIT env var
const BODY_LIMIT = parseInt(process.env.BODY_LIMIT || '1048576', 10);

// AUDIT FIX (GD-3): Pre-stop sleep for load balancer drain delay
const PRESTOP_DELAY_MS = parseInt(process.env.PRESTOP_DELAY_MS || '5000', 10);

// AUDIT FIX: Max shutdown timeout to prevent hanging
// If shutdown takes longer than this, force exit
const MAX_SHUTDOWN_TIMEOUT_MS = parseInt(process.env.MAX_SHUTDOWN_TIMEOUT_MS || '30000', 10);

// AUDIT FIX: Grace period configuration for time-sensitive operations
// These values control how lenient the system is with timing
export const GRACE_PERIODS = {
  // Grace period for sales start/end times (in minutes)
  salesTimingGraceMinutes: parseInt(process.env.SALES_TIMING_GRACE_MINUTES || '5', 10),
  // Grace period for event start times (in minutes)
  eventStartGraceMinutes: parseInt(process.env.EVENT_START_GRACE_MINUTES || '15', 10),
  // Grace period for ticket transfers (in minutes)
  transferGraceMinutes: parseInt(process.env.TRANSFER_GRACE_MINUTES || '30', 10),
  // Grace period for refund requests after event changes (in hours)
  refundRequestGraceHours: parseInt(process.env.REFUND_REQUEST_GRACE_HOURS || '48', 10),
  // Grace period for cancellation deadlines (in hours)
  cancellationGraceHours: parseInt(process.env.CANCELLATION_GRACE_HOURS || '2', 10),
};

// Log grace periods at startup
logger.info({ gracePeriods: GRACE_PERIODS }, 'Grace periods configured');

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

// Track if shutdown is in progress
let isShuttingDown = false;

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

    // Initialize RabbitMQ for event publishing
    await initializeRabbitMQ();
    logger.info('RabbitMQ publisher initialized');

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

    // CRITICAL FIX Issue #4 & #8: Transaction wrapper for RLS safety
    // Wrap ALL requests in a transaction to ensure SET LOCAL works correctly
    // and doesn't leak between pooled connections
    app.addHook('onRequest', async (request, reply) => {
      try {
        const db = getDb();
        const trx = await db.transaction();
        (request as any).transaction = trx;
        request.log.debug({ requestId: request.id }, 'Transaction started for request');
      } catch (error) {
        logger.error({ error, requestId: request.id }, 'Failed to start transaction');
        // Don't fail the request - let it proceed without transaction
        // (will fall back to connection-level SET LOCAL)
      }
    });

    // CRITICAL FIX Issue #4 & #8: Commit transaction on successful response
    app.addHook('onResponse', async (request, reply) => {
      const trx = (request as any).transaction;
      if (trx) {
        try {
          await trx.commit();
          request.log.debug({ requestId: request.id, statusCode: reply.statusCode }, 'Transaction committed');
        } catch (error) {
          logger.error({ error, requestId: request.id }, 'Failed to commit transaction');
          // Transaction already complete or errored - safe to ignore
        }
      }
    });

    // CRITICAL FIX Issue #8: Rollback transaction and clean up RLS on error
    app.addHook('onError', async (request, reply, error) => {
      const trx = (request as any).transaction;
      if (trx) {
        try {
          await trx.rollback();
          request.log.debug({ requestId: request.id, error: error.message }, 'Transaction rolled back due to error');
        } catch (rollbackError) {
          logger.error({ error: rollbackError, requestId: request.id }, 'Failed to rollback transaction');
          // Best effort - transaction might already be rolled back
        }
      }
      
      // Additional safety: Reset RLS context on error (belt and suspenders approach)
      try {
        const db = getDb();
        await db.raw('RESET app.current_tenant_id');
        request.log.debug({ requestId: request.id }, 'RLS context reset after error');
      } catch (resetError) {
        // Ignore - this is best-effort cleanup
      }
    });

    logger.info('Transaction wrapper enabled for RLS safety (Issues #4, #8)');

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
        const db = getDb();
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
    const db = getDb();
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

// ============================================================
// Graceful Shutdown
// ============================================================

/**
 * Enhanced graceful shutdown with complete resource cleanup and timeout
 * 
 * AUDIT FIXES:
 * - GD-3: Pre-stop delay for load balancer drain
 * - Max shutdown timeout to prevent hanging
 */
const gracefulShutdown = async (signal: string) => {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
    return;
  }
  isShuttingDown = true;

  logger.info({ signal, maxTimeoutMs: MAX_SHUTDOWN_TIMEOUT_MS }, 'Shutdown signal received, shutting down gracefully');

  // Set up force exit timeout
  const forceExitTimeout = setTimeout(() => {
    logger.error({ timeoutMs: MAX_SHUTDOWN_TIMEOUT_MS }, 'Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, MAX_SHUTDOWN_TIMEOUT_MS);

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

    // 3. Shutdown service auth (token manager, revocation manager)
    shutdownServiceAuth();
    logger.info('Service auth shutdown');
    
    // 3.5. Shutdown auth middleware (JWT key rotation)
    shutdownAuthMiddleware();
    logger.info('Auth middleware shutdown');

    // 4. Close database connections
    const pool = DatabaseService.getPool();
    if (pool) {
      await pool.end();
      logger.info('Database pool closed');
    }

    // 5. Close Knex connection
    try {
      const db = getDb();
      await db.destroy();
      logger.info('Knex database connection closed');
    } catch (error) {
      // Database might not be initialized, skip
      logger.debug('Knex database not initialized or already closed');
    }

    // 6. Close MongoDB connection
    await closeMongoDB();
    logger.info('MongoDB connection closed');

    // 6.5. Close RabbitMQ connection
    await shutdownRabbitMQ();
    logger.info('RabbitMQ publisher disconnected');

    // 7. Close Redis connections
    await closeRedisConnections();
    logger.info('Redis connections closed');

    // Clear the force exit timeout
    clearTimeout(forceExitTimeout);

    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimeout);
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection');
  gracefulShutdown('unhandledRejection');
});

start().catch((error) => {
  logger.error({ error }, 'Failed to start event service');
  process.exit(1);
});
