import { createServer } from './server';
import { db } from './services/database.service';
import { redis } from './services/redis.service';
import { initializeTables } from './services/init-tables';
import { schedulerService } from './services/scheduler.service';
import { logger } from './utils/logger';
import { validateConfig } from './config/validate';

const PORT = parseInt(process.env.PORT || '3010', 10);

async function startServer() {
  try {
    validateConfig();
    logger.info('Starting TicketToken Compliance Service...');

    // Initialize database tables
    logger.info('Initializing database tables...');
    await initializeTables();
    logger.info('Tables initialized');

    // Connect to Redis
    logger.info('Connecting to Redis...');
    await redis.connect();
    logger.info('Redis connected');

    // Start scheduled jobs
    logger.info('Starting scheduled jobs...');
    schedulerService.startScheduledJobs();
    logger.info('Scheduled jobs started');

    // Start HTTP server
    const server = await createServer();
    await server.listen({ port: PORT, host: '0.0.0.0' });

    logger.info(`🚀 Compliance service started on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  schedulerService.stopAllJobs();
  await redis.disconnect();
  await db.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  schedulerService.stopAllJobs();
  await redis.disconnect();
  await db.destroy();
  process.exit(0);
});

startServer();
