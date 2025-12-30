// Tracing must be initialized first
import { initTracing, shutdownTracing } from './config/tracing';
initTracing();

import { buildApp } from './app';
import { env } from './config/env';
import { pool } from './config/database';
import { initRedis, getRedis, closeRedisConnections } from './config/redis';
import { logger } from './utils/logger';
import { loadSecrets } from './config/secrets';
import { markStartupComplete, markStartupFailed } from './services/monitoring.service';

// GD-F4: Load balancer drain delay (seconds)
const LB_DRAIN_DELAY = parseInt(process.env.LB_DRAIN_DELAY || '5', 10) * 1000;

// Track if shutdown is in progress
let isShuttingDown = false;

async function start() {
  try {
    // Load secrets first (before any other initialization)
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from secrets manager...');
      await loadSecrets();
      logger.info('Secrets loaded successfully');
    }

    // Test database connection
    await pool.query('SELECT NOW()');
    logger.info('Database connected');

    // Initialize Redis
    await initRedis();
    
    // GD-RD5: Set up Redis error handler
    const redis = getRedis();
    redis.on('error', (err) => {
      logger.error('Redis error', { 
        error: err.message,
        code: (err as any).code,
      });
      // Don't crash - Redis errors are handled gracefully
    });

    redis.on('close', () => {
      if (!isShuttingDown) {
        logger.warn('Redis connection closed unexpectedly');
      }
    });

    redis.on('reconnecting', (delay: number) => {
      logger.info('Redis reconnecting', { delay });
    });

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connected');

    // Build and start Fastify app
    const app = await buildApp();
    
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    // Mark startup as complete for /health/startup probe
    markStartupComplete();

    logger.info(`Auth service running on port ${env.PORT}`);

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
      }
      
      isShuttingDown = true;
      logger.info(`${signal} received, shutting down gracefully...`);

      try {
        // GD-F4: Wait for load balancer to stop sending traffic
        // This gives the LB time to detect the failing health check
        // and remove this instance from the pool
        if (LB_DRAIN_DELAY > 0) {
          logger.info(`Waiting ${LB_DRAIN_DELAY}ms for LB drain...`);
          await new Promise(resolve => setTimeout(resolve, LB_DRAIN_DELAY));
        }

        // Stop accepting new connections, wait for in-flight to complete
        // Fastify's close() waits for existing requests by default
        await app.close();
        logger.info('HTTP server closed');

        // Close database pool
        await pool.end();
        logger.info('Database pool closed');

        // Close Redis connections
        await closeRedisConnections();
        logger.info('Redis connections closed');

        // Shutdown tracing
        await shutdownTracing();
        logger.info('Tracing shutdown complete');

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    // Register shutdown handlers
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, () => gracefulShutdown(signal));
    });

  } catch (error) {
    markStartupFailed(error instanceof Error ? error.message : 'Unknown error');
    logger.error('Failed to start auth service', { error });
    process.exit(1);
  }
}

// Process-level error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise: String(promise) });
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  // Exit on uncaught exception - state may be corrupted
  process.exit(1);
});

start();
