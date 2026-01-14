import 'dotenv/config';
import { createApp, shutdownApp } from './app';
import { logger } from './utils/logger';

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';
const PORT = parseInt(process.env.PORT || '3011', 10);
const HOST = process.env.HOST || '0.0.0.0';

// =============================================================================
// Issue #11: Process handlers for unhandled errors
// =============================================================================

/**
 * Handle unhandled promise rejections
 * Logs the error and exits gracefully
 */
process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || String(reason),
    stack: reason?.stack,
    type: 'unhandledRejection'
  });
  
  // In production, we should exit to let the orchestrator restart us
  if (process.env.NODE_ENV === 'production') {
    logger.error('Exiting due to unhandled rejection in production');
    process.exit(1);
  }
});

/**
 * Handle uncaught exceptions
 * Logs the error and exits immediately
 */
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    type: 'uncaughtException'
  });
  
  // Always exit on uncaught exceptions - process state is undefined
  process.exit(1);
});

/**
 * Handle uncaught exceptions in async contexts
 */
process.on('uncaughtExceptionMonitor', (error: Error, origin: string) => {
  logger.error('Uncaught Exception Monitor', {
    error: error.message,
    stack: error.stack,
    origin,
    type: 'uncaughtExceptionMonitor'
  });
});

/**
 * Handle process warnings (e.g., deprecation warnings)
 */
process.on('warning', (warning: Error) => {
  logger.warn('Process Warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

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
