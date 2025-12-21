import { FastifyInstance } from 'fastify';
import { createLogger } from './logger';
import { closeRedisConnections } from '../config/redis';

const logger = createLogger('graceful-shutdown');

export function gracefulShutdown(server: FastifyInstance) {
  const signals = ['SIGTERM', 'SIGINT'];
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Already shutting down, ignoring signal');
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

    const shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds timeout

    try {
      // Stop accepting new connections
      await server.close();
      logger.info('Server closed, no longer accepting connections');

      // Close Redis connections via shared connection manager
      await closeRedisConnections();
      logger.info('Redis connections closed');

      // Close HTTP client connections (service clients use undici)
      // The HTTP clients in AuthServiceClient and VenueServiceClient
      // will be automatically cleaned up when the process exits
      logger.info('HTTP client connections will be cleaned up on process exit');

      // Log metrics summary before shutdown
      const memUsage = process.memoryUsage();
      logger.info({
        uptime: process.uptime(),
        memoryUsage: {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        },
      }, 'Final metrics summary');

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during graceful shutdown');
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  for (const signal of signals) {
    process.on(signal, () => shutdown(signal));
  }

  // Log that shutdown handlers are registered
  logger.info({ signals }, 'Graceful shutdown handlers registered');
}
