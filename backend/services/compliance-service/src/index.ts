import dotenv from 'dotenv';
dotenv.config();

import { createServer } from './server';
import { db } from './services/database.service';
import { redis } from './services/redis.service';
import { initializeTables } from './services/init-tables';
import { migrateTables } from './services/migrate-tables';
import { schedulerService } from './services/scheduler.service';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '3010', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    // Connect to database
    await db.connect();

    // Initialize tables
    await initializeTables();

    // Run migrations
    await migrateTables();

    // Connect to Redis
    await redis.connect();

    // Start scheduled compliance jobs
    schedulerService.startScheduledJobs();

    // Create and start server
    const app = await createServer();
    await app.listen({ port: PORT, host: HOST });

    logger.info(`Compliance service running on port ${PORT}`);
    logger.info(`Health: http://${HOST}:${PORT}/health`);
    logger.info(`Dashboard: http://${HOST}:${PORT}/api/v1/compliance/dashboard`);
    logger.info(`Admin: http://${HOST}:${PORT}/api/v1/compliance/admin/pending`);
    logger.info(`Batch Jobs: http://${HOST}:${PORT}/api/v1/compliance/batch/jobs`);
  } catch (error: any) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  schedulerService.stopAllJobs();
  await db.close();
  await redis.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  schedulerService.stopAllJobs();
  await db.close();
  await redis.close();
  process.exit(0);
});

startServer();
