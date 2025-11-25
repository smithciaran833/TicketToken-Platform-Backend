import 'dotenv/config';
import { createApp, shutdownApp } from './app';
import { logger } from './utils/logger';

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';
const PORT = parseInt(process.env.PORT || '3011', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startService() {
  try {
    logger.info(`Starting ${SERVICE_NAME}...`);

    const app = await createApp();

    // Start server
    await app.listen({ port: PORT, host: HOST });
    
    logger.info(`${SERVICE_NAME} running on port ${PORT}`, {
      port: PORT,
      host: HOST,
      healthUrl: `http://${HOST}:${PORT}/health`,
      infoUrl: `http://${HOST}:${PORT}/info`
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down ${SERVICE_NAME}...`);
      
      try {
        // Close HTTP server first
        await app.close();
        logger.info('HTTP server closed');
        
        // Shutdown infrastructure components
        await shutdownApp();
        
        logger.info(`${SERVICE_NAME} shutdown complete`);
        process.exit(0);
      } catch (error: any) {
        logger.error('Error during shutdown', { error: error.message, stack: error.stack });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error: any) {
    logger.error(`Failed to start ${SERVICE_NAME}`, { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Start the service
startService().catch((error) => {
  logger.error('Unhandled error during service startup', { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
});
