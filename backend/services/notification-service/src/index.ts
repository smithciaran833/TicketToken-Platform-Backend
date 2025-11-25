import { createServer } from './server';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeDatabaseConnections, db } from './config/database';
import { closeRedisConnections } from './config/redis';
import { rabbitmqService } from './config/rabbitmq';
import { eventHandler } from './events/event-handler';
import { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;

async function startServer() {
  try {
    logger.info('Running database migrations...');
    await db.migrate.latest();

    logger.info('Connecting to RabbitMQ...');
    await rabbitmqService.connect();

    await rabbitmqService.consume(async (msg) => {
      if (msg) {
        await eventHandler.handleEvent(msg);
      }
    });

    server = await createServer();
    await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    logger.info(`${env.SERVICE_NAME} is running on port ${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Email enabled: ${env.ENABLE_EMAIL}`);
    logger.info(`SMS enabled: ${env.ENABLE_SMS}`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

async function gracefulShutdown() {
  logger.info('Graceful shutdown initiated...');

  try {
    if (server) {
      await server.close();
      logger.info('Fastify server closed');
    }

    await rabbitmqService.close();
    await closeDatabaseConnections();
    await closeRedisConnections();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  gracefulShutdown();
});

startServer();
