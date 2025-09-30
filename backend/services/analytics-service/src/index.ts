import 'dotenv/config';
import { createServer } from './server';
import { logger } from './utils/logger';
import { connectDatabases } from './config/database';
import { connectRedis } from './config/redis';
import { connectRabbitMQ } from './config/rabbitmq';
import { startWebSocketServer } from './config/websocket';
import { startEventProcessors } from './processors';
import { startScheduledJobs } from './utils/scheduler';

// Only import MongoDB if needed
let connectMongoDB: any;
if (process.env.MONGODB_ENABLED !== 'false') {
  connectMongoDB = require('./config/mongodb').connectMongoDB;
}

async function startService() {
  try {
    logger.info('Starting Analytics Service...');

    // Connect to databases
    await connectDatabases();
    await connectRedis();
    
    // Connect to RabbitMQ
    await connectRabbitMQ();

    // Only connect to MongoDB if enabled
    if (process.env.MONGODB_ENABLED !== 'false' && connectMongoDB) {
      await connectMongoDB();
    } else {
      logger.info('MongoDB disabled, skipping connection');
    }

    // Start server
    const app = await createServer();
    const PORT = process.env.PORT || 3016;

    const server = app.listen(PORT, () => {
      logger.info(`Analytics Service running on port ${PORT}`);
    });

    // Start WebSocket server
    await startWebSocketServer(server);
    
    // Start event processors
    await startEventProcessors();
    
    // Start scheduled jobs
    await startScheduledJobs();

  } catch (error) {
    logger.error('Failed to start Analytics Service:', error);
    process.exit(1);
  }
}

startService();
