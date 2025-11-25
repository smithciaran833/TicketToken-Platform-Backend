import { initializeTracing } from './utils/tracing';
// Initialize tracing before anything else
const sdk = initializeTracing('venue-service');
import { buildApp } from './app';
import { logger } from './utils/logger';

/**
 * Validate required environment variables at startup
 * Fails fast with clear error message if any are missing
 */
function validateEnvironment(): void {
  const REQUIRED_ENV_VARS = [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'REDIS_HOST',
    'REDIS_PORT',
    'JWT_ACCESS_SECRET', // CRITICAL for authentication
  ];

  const missingVars: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName] || process.env[varName]?.trim() === '') {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    logger.fatal(
      { missingVars },
      `FATAL: Required environment variables are missing: ${missingVars.join(', ')}`
    );
    logger.fatal('Service cannot start without required configuration.');
    logger.fatal('Please check .env.example for required variables.');
    process.exit(1);
  }

  // Log successful validation (info level for production)
  logger.info('Environment validation passed - all required variables present');
}

let fastifyApp: any = null;

const start = async () => {
  try {
    // Validate environment before starting anything
    validateEnvironment();

    const app = await buildApp();
    fastifyApp = app; // Store for graceful shutdown
    
    const port = parseInt(process.env.PORT || '3002', 10);
    const host = process.env.HOST || '0.0.0.0';
    await app.listen({ port, host });
    logger.info(`Venue Service (Fastify) running on http://${host}:${port}`);
  } catch (err) {
    logger.error(err, 'Failed to start venue service');
    process.exit(1);
  }
};

/**
 * Graceful shutdown handler
 * Closes all resources in correct order with timeout protection
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, `${signal} received, initiating graceful shutdown...`);
  
  const shutdownTimeout = 30000; // 30 seconds
  let shutdownComplete = false;

  // Set timeout for forced shutdown
  const forceShutdownTimer = setTimeout(() => {
    if (!shutdownComplete) {
      logger.warn('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }
  }, shutdownTimeout);

  try {
    // Step 1: Stop accepting new HTTP requests
    if (fastifyApp) {
      logger.info('Closing Fastify server (stop accepting new requests)...');
      await fastifyApp.close();
      logger.info('Fastify server closed successfully');
    }

    // Step 2: Close RabbitMQ connection (if active)
    try {
      const container = (fastifyApp as any)?.container;
      const queueService = container?.cradle?.queueService;
      
      if (queueService && typeof queueService.close === 'function') {
        logger.info('Closing RabbitMQ connection...');
        await queueService.close();
        logger.info('RabbitMQ connection closed successfully');
      } else {
        logger.info('RabbitMQ not active or already closed');
      }
    } catch (queueError) {
      logger.warn({ error: queueError }, 'Error closing RabbitMQ connection');
    }

    // Step 3: Close Redis connection
    try {
      const container = (fastifyApp as any)?.container;
      const cache = container?.cradle?.cache;
      
      if (cache && typeof cache.disconnect === 'function') {
        logger.info('Closing Redis connection...');
        await cache.disconnect();
        logger.info('Redis connection closed successfully');
      } else {
        logger.info('Redis not active or already closed');
      }
    } catch (redisError) {
      logger.warn({ error: redisError }, 'Error closing Redis connection');
    }

    // Step 4: Close database connection pool
    try {
      const { db } = await import('./config/database');
      if (db && typeof db.destroy === 'function') {
        logger.info('Closing database connection pool...');
        await db.destroy();
        logger.info('Database connection pool closed successfully');
      }
    } catch (dbError) {
      logger.warn({ error: dbError }, 'Error closing database connection');
    }

    // Step 5: Shutdown OpenTelemetry SDK
    logger.info('Shutting down OpenTelemetry SDK...');
    await sdk.shutdown();
    logger.info('OpenTelemetry SDK shut down successfully');

    // Mark shutdown as complete
    shutdownComplete = true;
    clearTimeout(forceShutdownTimer);

    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception, shutting down');
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection, shutting down');
  gracefulShutdown('UNHANDLED_REJECTION');
});

start();
