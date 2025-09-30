import app from './app';
import { config, db, redis } from './config';
import { logger } from './utils/logger';

const PORT = config.port;

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

    // Test Redis connection but don't fail if it's not available
    try {
      await redis.ping();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn('Redis not available - continuing without cache', error);
      // Disable Redis retry attempts
      redis.disconnect();
    }

    // Start server regardless of Redis status
    app.listen(PORT, () => {
      logger.info(`Marketplace service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  try {
    await db.destroy();
    redis.disconnect();
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  process.exit(0);
});

export { startServer };
