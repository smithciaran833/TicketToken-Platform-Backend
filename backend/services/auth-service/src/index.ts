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

    // Test Redis connection
    await getRedis().ping();
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

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`${signal} received, shutting down gracefully...`);
        try {
          await app.close();
          await pool.end();
          await closeRedisConnections();
          await shutdownTracing();
          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });
    });
  } catch (error) {
    markStartupFailed(error instanceof Error ? error.message : 'Unknown error');
    logger.error('Failed to start auth service', { error });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise: String(promise) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

start();
