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
import { initializeRabbitMQ, shutdownRabbitMQ } from './config/rabbitmq';

const LB_DRAIN_DELAY = parseInt(process.env.LB_DRAIN_DELAY || '5', 10) * 1000;
let isShuttingDown = false;

async function start() {
  try {
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from secrets manager...');
      await loadSecrets();
      logger.info('Secrets loaded successfully');
    }

    await pool.query('SELECT NOW()');
    logger.info('Database connected');

    await initRedis();
    const redis = getRedis();

    redis.on('error', (err) => {
      logger.error('Redis error', {
        error: err.message,
        code: (err as any).code,
      });
    });

    redis.on('close', () => {
      if (!isShuttingDown) {
        logger.warn('Redis connection closed unexpectedly');
      }
    });

    redis.on('reconnecting', (delay: number) => {
      logger.info('Redis reconnecting', { delay });
    });

    await redis.ping();
    logger.info('Redis connected');

    await initializeRabbitMQ();
    logger.info('RabbitMQ publisher initialized');

    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    markStartupComplete();
    logger.info(`Auth service running on port ${env.PORT}`);

    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
      }

      isShuttingDown = true;
      logger.info(`${signal} received, shutting down gracefully...`);

      try {
        if (LB_DRAIN_DELAY > 0) {
          logger.info(`Waiting ${LB_DRAIN_DELAY}ms for LB drain...`);
          await new Promise(resolve => setTimeout(resolve, LB_DRAIN_DELAY));
        }

        await app.close();
        logger.info('HTTP server closed');

        await pool.end();
        logger.info('Database pool closed');

        await closeRedisConnections();
        logger.info('Redis connections closed');

        await shutdownRabbitMQ();
        logger.info('RabbitMQ disconnected');

        await shutdownTracing();
        logger.info('Tracing shutdown complete');

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

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

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise: String(promise) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

start();
