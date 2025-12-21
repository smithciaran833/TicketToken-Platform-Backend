import dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

import { createApp } from './app';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database.config';
import { QueueFactory } from './queues/factories/queue.factory';
import { MoneyQueue } from './queues/definitions/money.queue';
import { CommunicationQueue } from './queues/definitions/communication.queue';
import { BackgroundQueue } from './queues/definitions/background.queue';
import { RecoveryService } from './services/recovery.service';
import { MonitoringService } from './services/monitoring.service';
import { QueueRegistry } from './services/queue-registry.service';

const PORT = process.env.PORT || 3011;

async function startService() {
  try {
    logger.info('🚀 Starting Queue Service...');
    logger.info(`Environment: ${process.env.NODE_ENV}`);

    // Connect to databases
    await connectDatabase();
    logger.info('✅ PostgreSQL connected');

    // Initialize queue factory (pg-boss)
    await QueueFactory.initialize();
    logger.info('✅ Queue factory initialized');

    // Initialize queue definitions
    const moneyQueue = new MoneyQueue();
    const communicationQueue = new CommunicationQueue();
    const backgroundQueue = new BackgroundQueue();
    logger.info('✅ All queues ready');

    // Register queues in singleton registry
    const queueRegistry = QueueRegistry.getInstance();
    queueRegistry.initialize(moneyQueue, communicationQueue, backgroundQueue);
    logger.info('✅ Queue registry initialized');

    // Recover pending jobs
    const recoveryService = new RecoveryService();
    await recoveryService.recoverPendingJobs();
    logger.info('✅ Job recovery completed');

    // Start monitoring service
    const monitoringService = MonitoringService.getInstance();
    await monitoringService.start();
    logger.info('✅ Monitoring service started');

    // Create Fastify app with all routes
    const app = await createApp();

    // Start server
    await app.listen({ port: Number(PORT), host: '0.0.0.0' });

    logger.info(`✅ Queue Service running on port ${PORT}`);
    logger.info(`📡 API available at http://0.0.0.0:${PORT}/api/v1/queue`);
    logger.info(`📊 Prometheus metrics at http://0.0.0.0:${PORT}/api/v1/queue/metrics/prometheus`);

    // Graceful shutdown
    const closeGracefully = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      await monitoringService.stop();
      await QueueFactory.shutdown();
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => closeGracefully('SIGTERM'));
    process.on('SIGINT', () => closeGracefully('SIGINT'));
  } catch (error) {
    logger.error('Failed to start Queue Service:', error);
    process.exit(1);
  }
}

startService();
