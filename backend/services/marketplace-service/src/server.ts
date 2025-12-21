import { buildApp } from './app';
import { config, db, getRedis, initRedis, closeRedisConnections } from './config';
import { logger } from './utils/logger';
import { escrowMonitorService } from './services/escrow-monitor.service';

const PORT = config.port;
const HOST = '0.0.0.0';

async function startServer() {
  try {
    // Test database connection
    try {
      await db.raw('SELECT 1');
      logger.info('Database connected');
    } catch (error) {
      logger.error('Database connection failed:', error);
      logger.warn('Starting server without database connection');
    }

    // Initialize Redis
    try {
      await initRedis();
      await getRedis().ping();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn('Redis not available - continuing without cache', error);
    }

    // Build and start Fastify server
    const app = await buildApp();

    await app.listen({ port: PORT, host: HOST });

    logger.info(`Marketplace service running on port ${PORT}`);
    logger.info(`API available at: http://localhost:${PORT}/api/v1/marketplace`);

    // Start escrow monitor (runs in background)
    escrowMonitorService.start();
    logger.info('Escrow monitor started');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  try {
    escrowMonitorService.stop();
    await db.destroy();
    await closeRedisConnections();
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  try {
    escrowMonitorService.stop();
    await db.destroy();
    await closeRedisConnections();
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  process.exit(0);
});

export { startServer };
