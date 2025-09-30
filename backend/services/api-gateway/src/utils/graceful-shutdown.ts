import { FastifyInstance } from 'fastify';
import { createLogger } from './logger';

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

      // Close Redis connections
      if (server.redis) {
        await server.redis.quit();
        logger.info('Redis connection closed');
      }

      // Close other resources
      // TODO: Add cleanup for other services when implemented

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
