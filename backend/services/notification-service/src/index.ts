import { createServer } from './server';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeDatabaseConnections, db } from './config/database';
import { closeRedisConnection } from './config/redis';
import { rabbitmqService } from './config/rabbitmq';
import { eventHandler } from './events/event-handler';

let server: any;

async function startServer() {
  try {
    // Run database migrations
    logger.info('Running database migrations...');
    await db.migrate.latest();

    // Connect to RabbitMQ
    logger.info('Connecting to RabbitMQ...');
    await rabbitmqService.connect();

    // Start consuming messages
    await rabbitmqService.consume(async (msg) => {
      if (msg) {
        await eventHandler.handleEvent(msg);
      }
    });

    // Create and start Express server
    const app = createServer();
    server = app.listen(env.PORT, () => {
      logger.info(`${env.SERVICE_NAME} is running on port ${env.PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`Email enabled: ${env.ENABLE_EMAIL}`);
      logger.info(`SMS enabled: ${env.ENABLE_SMS}`);
    });

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

async function gracefulShutdown() {
  logger.info('Graceful shutdown initiated...');

  try {
    // Stop accepting new connections
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      logger.info('HTTP server closed');
    }

    // Close RabbitMQ connection
    await rabbitmqService.close();

    // Close database connections
    await closeDatabaseConnections();

    // Close Redis connection
    await closeRedisConnection();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  gracefulShutdown();
});

// Start the server
startServer();
