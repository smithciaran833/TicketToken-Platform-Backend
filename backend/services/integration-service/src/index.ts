import dotenv from 'dotenv';
dotenv.config();

import { createServer } from './server';
import { logger } from './utils/logger';
import { initializeDatabase } from './config/database';
import { initializeRedis } from './config/redis';
import { initializeQueues } from './config/queue';
import { SyncEngineService } from './services/sync-engine.service';
import { MonitoringService } from './services/monitoring.service';

const PORT = parseInt(process.env.PORT || '3015', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database connected');

    // Initialize Redis
    await initializeRedis();
    logger.info('Redis connected');

    // Initialize queues
    await initializeQueues();
    logger.info('Queues initialized');

    // Sync engine ready (no initialization needed)
    logger.info('Sync engine ready');

    // Start monitoring
    const monitoring = new MonitoringService();
    await monitoring.startHealthChecks();
    logger.info('Health monitoring started');

    // Create and start server
    const app = await createServer();
    await app.listen({ port: PORT, host: HOST });

    logger.info(`${process.env.SERVICE_NAME} is running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
