import dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

import { createApp } from './app';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database.config';
import { connectRedis } from './config/redis.config';
import { QueueFactory } from './queues/factories/queue.factory';
import { MoneyQueue } from './queues/definitions/money.queue';
import { CommunicationQueue } from './queues/definitions/communication.queue';
import { BackgroundQueue } from './queues/definitions/background.queue';
import { RecoveryService } from './services/recovery.service';
import { MonitoringService } from './services/monitoring.service';

const PORT = process.env.PORT || 3020;

let moneyQueue: MoneyQueue;
let communicationQueue: CommunicationQueue;
let backgroundQueue: BackgroundQueue;

async function startService() {
  try {
    logger.info('🚀 Starting Queue Service...');
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    
    // Connect to databases
    await connectDatabase();
    logger.info('✅ PostgreSQL connected');
    
    await connectRedis();
    logger.info('✅ Redis connected');
    
    // Initialize queue factory
    await QueueFactory.initialize();
    logger.info('✅ Queue factory initialized');
    
    // Initialize queue definitions
    moneyQueue = new MoneyQueue();
    communicationQueue = new CommunicationQueue();
    backgroundQueue = new BackgroundQueue();
    logger.info('✅ All queues ready');
    
    // Recover pending jobs
    const recoveryService = new RecoveryService();
    await recoveryService.recoverPendingJobs();
    logger.info('✅ Job recovery completed');
    
    // Start monitoring service
    const monitoringService = MonitoringService.getInstance();
    await monitoringService.start();
    logger.info('✅ Monitoring service started');
    
    // Create Express app with all routes
    const app = createApp();
    
    // Make queues available globally for controllers
    global.moneyQueue = moneyQueue;
    global.communicationQueue = communicationQueue;
    global.backgroundQueue = backgroundQueue;
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`✅ Queue Service running on port ${PORT}`);
      logger.info(`📡 API available at http://0.0.0.0:${PORT}/api/v1/queue`);
      logger.info(`📊 Prometheus metrics at http://0.0.0.0:${PORT}/api/v1/queue/metrics/prometheus`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      await monitoringService.stop();
      await QueueFactory.shutdown();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await monitoringService.stop();
      await QueueFactory.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start Queue Service:', error);
    process.exit(1);
  }
}

// Add global type declarations
declare global {
  var moneyQueue: MoneyQueue;
  var communicationQueue: CommunicationQueue;
  var backgroundQueue: BackgroundQueue;
}

startService();
