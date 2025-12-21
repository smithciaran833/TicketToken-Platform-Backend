import 'dotenv/config';
import { createServer } from './server';
import { logger } from './utils/logger';
import { connectDatabases } from './config/database';
import { initRedis } from './config/redis';
import { connectRabbitMQ } from './config/rabbitmq';
import { startWebSocketServer } from './config/websocket';
import { startEventProcessors } from './processors';
import { startScheduledJobs } from './utils/scheduler';
import { rfmCalculatorWorker } from './workers/rfm-calculator.worker';

// Only import MongoDB if needed
let connectMongoDB: any;
if (process.env.MONGODB_ENABLED !== 'false') {
  connectMongoDB = require('./config/mongodb').connectMongoDB;
}

async function startService() {
  try {
    logger.info('Starting Analytics Service...');

    // Connect to databases (PostgreSQL)
    await connectDatabases();

    // Connect to Redis
    await initRedis();

    // Connect to RabbitMQ
    await connectRabbitMQ();

    // Only connect to MongoDB if enabled
    if (process.env.MONGODB_ENABLED !== 'false' && connectMongoDB) {
      await connectMongoDB();
    } else {
      logger.info('MongoDB disabled, skipping connection');
    }

    // Create and start Fastify server
    const app = await createServer();
    const PORT = Number(process.env.PORT) || 3010;
    const HOST = process.env.HOST || '0.0.0.0';

    await app.listen({ port: PORT, host: HOST });
    logger.info(`Analytics Service running on ${HOST}:${PORT}`);

    // Start WebSocket server
    await startWebSocketServer(app.server);

    // Start event processors
    await startEventProcessors();

    // Start scheduled jobs
    await startScheduledJobs();

    // Start RFM Calculator Worker
    logger.info('Starting RFM Calculator Worker...');
    await rfmCalculatorWorker.start();
    logger.info('RFM Calculator Worker started successfully');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      try {
        await app.close();
        logger.info('Server closed');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start Analytics Service:', error);
    process.exit(1);
  }
}

startService();
