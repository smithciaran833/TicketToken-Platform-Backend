import dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

import { createApp } from './app';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database.config';
import { setupStorage } from './storage/storage.setup';
import { startWorkers } from './workers';

const PORT = process.env.PORT || 3013;

async function startService() {
  try {
    logger.info('🚀 Starting File Service...');
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    
    // Connect to database
    await connectDatabase();
    logger.info('✅ Database connected');
    
    // Setup storage
    await setupStorage();
    logger.info('✅ Storage configured');
    
    // Start background workers
    await startWorkers();
    logger.info('✅ Background workers started');
    
    // Create Fastify app
    const app = await createApp();
    
    // Start server
    await app.listen({ port: Number(PORT), host: '0.0.0.0' });
    logger.info(`✅ File Service running on port ${PORT}`);
    logger.info(`📁 API available at http://0.0.0.0:${PORT}/api/v1/files`);
    
    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');
      await app.close();
      process.exit(0);
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (error) {
    logger.error('Failed to start File Service:', error);
    process.exit(1);
  }
}

startService();
