require('dotenv').config();

import { buildApp } from './app';
import { DatabaseService } from './services/databaseService';
import { RedisService } from './services/redisService';
import { logger } from './utils/logger';

const log = logger.child({ component: 'PaymentServiceStartup' });
const PORT = process.env.PORT || 3006;
const HOST = process.env.HOST || '0.0.0.0';

let app: any = null;
let isShuttingDown = false;

async function start() {
  try {
    // Initialize database
    await DatabaseService.initialize();
    log.info("Database initialized");

    await RedisService.initialize();
    log.info("RedisService initialized");

    // Import and start workers
    const { webhookProcessor } = require('./workers/webhook.processor');
    const { startWebhookConsumer } = require('./workers/webhook.consumer');

    // Start webhook processor
    webhookProcessor.start();
    log.info("Webhook processor started");

    // Start webhook consumer
    startWebhookConsumer()
      .then(() => log.info("Webhook consumer started"))
      .catch((err: any) => log.error("Failed to start webhook consumer", { error: err.message }));

    // Build and start Fastify app
    app = await buildApp();
    await app.listen({ port: PORT as number, host: HOST });
    log.info('Payment Service running', { port: PORT, host: HOST });
  } catch (error) {
    log.error("Failed to start server", { error: error instanceof Error ? error.message : error });
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    log.info('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  log.info(`${signal} received, starting graceful shutdown`);

  const forceShutdownTimeout = setTimeout(() => {
    log.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    if (app) {
      log.info('Closing Fastify server...');
      await app.close();
      log.info('Fastify server closed');
    }

    log.info('Closing database connections...');
    await DatabaseService.close();
    log.info('Database connections closed');

    log.info('Closing Redis connections...');
    await RedisService.close();
    log.info('Redis connections closed');

    clearTimeout(forceShutdownTimeout);
    log.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    log.error('Error during graceful shutdown', { error });
    clearTimeout(forceShutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', { error });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled promise rejection', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

start();
