import 'dotenv/config';
import { buildApp } from './app';
import { connectDatabase } from './config/database';
import { initializeMongoDB, closeMongoDB } from './config/mongodb';
import { logger } from './utils/logger';

async function start() {
  try {
    // Connect to database
    await connectDatabase();
    
    // Connect to MongoDB (read-only for content sync)
    await initializeMongoDB();
    
    // Build and configure app
    const app = await buildApp();
    
    // Start server
    const port = parseInt(process.env.PORT || '3020', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    
    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown`);
      try {
        await app.close();
        await closeMongoDB();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'Failed to start server');
    process.exit(1);
  }
}

start();
