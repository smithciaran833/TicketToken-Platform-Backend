import 'dotenv/config';
import { createApp } from './app';
import { logger } from './utils/logger';
import { closeDatabase } from './config/database';
import { closeRedisConnections } from './config/redis';
import { closeRabbitMQ } from './config/rabbitmq';
import { 
  ExpirationJob, 
  // ReminderJob,  // DISABLED - uses notification tables, moved to notification-service
  ReconciliationJob,
  // NotificationSchedulerJob,  // DISABLED - uses scheduled_notifications, moved to notification-service
  // EventReminderJob,  // DISABLED - uses scheduled_notifications, moved to notification-service
  // NotificationDigestJob,  // DISABLED - uses notification tables, moved to notification-service
  // ReportGenerationJob,  // NOT IMPLEMENTED
  // CustomerAnalyticsJob,  // DISABLED - uses customer analytics tables (removed)
  // ExportSchedulerJob  // NOT IMPLEMENTED
} from './jobs';

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';
const PORT = parseInt(process.env.PORT || '3005', 10);
const HOST = process.env.HOST || '0.0.0.0';

// HIGH: Pre-close delay for graceful shutdown (allows LB to drain)
const PRE_CLOSE_DELAY_MS = parseInt(process.env.PRE_CLOSE_DELAY_MS || '5000', 10);
// HIGH: Maximum shutdown timeout before force exit
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);

// Background jobs (only order-specific jobs)
let expirationJob: ExpirationJob;
let reconciliationJob: ReconciliationJob;
// let reportGenerationJob: ReportGenerationJob;
// let exportSchedulerJob: ExportSchedulerJob;

async function startService() {
  try {
    logger.info(`Starting ${SERVICE_NAME}...`);

    // Validate required environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'REDIS_HOST',
    ];

    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }

    // Initialize database connection with retry logic
    const { initializeDatabase } = await import('./config/database');
    await initializeDatabase();
    logger.info('✅ Database connection established');

    // Create and start Fastify app
    const app = await createApp();
    await app.listen({ port: PORT, host: HOST });

    logger.info(`✅ ${SERVICE_NAME} running on ${HOST}:${PORT}`);
    logger.info(`   - Health: http://${HOST}:${PORT}/health`);
    logger.info(`   - Info: http://${HOST}:${PORT}/info`);
    logger.info(`   - API: http://${HOST}:${PORT}/api/v1/orders`);

    // Start background jobs (only order-specific jobs)
    logger.info('Starting background jobs...');
    
    expirationJob = new ExpirationJob();
    expirationJob.start();
    
    reconciliationJob = new ReconciliationJob();
    reconciliationJob.start();
    
    // reportGenerationJob = new ReportGenerationJob();
    // reportGenerationJob.start();
    
    // exportSchedulerJob = new ExportSchedulerJob();
    // exportSchedulerJob.start();

    logger.info('✅ Background jobs started (2 order-specific jobs)');
    logger.info('   Note: Notification, analytics, and reporting jobs moved to dedicated services');

    // HIGH: Graceful shutdown with pre-close delay for LB drain
    let isShuttingDown = false;
    
    const shutdown = async (signal: string) => {
      // Prevent multiple shutdown attempts
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
      }
      isShuttingDown = true;

      logger.info(`${signal} received, initiating graceful shutdown of ${SERVICE_NAME}...`);

      // HIGH: Set a hard timeout for the entire shutdown process
      const forceExitTimeout = setTimeout(() => {
        logger.error('Shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);

      try {
        // HIGH: Pre-close delay to allow LB to drain connections
        // During this time, health checks should return unhealthy
        logger.info(`Waiting ${PRE_CLOSE_DELAY_MS}ms for load balancer to drain...`);
        await new Promise(resolve => setTimeout(resolve, PRE_CLOSE_DELAY_MS));

        // Stop accepting new requests
        logger.info('Stopping background jobs...');
        if (expirationJob) expirationJob.stop();
        if (reconciliationJob) reconciliationJob.stop();
        // if (reportGenerationJob) reportGenerationJob.stop();
        // if (exportSchedulerJob) exportSchedulerJob.stop();

        // Close Fastify (waits for in-flight requests to complete)
        logger.info('Closing Fastify server...');
        await app.close();

        // Close RabbitMQ connections
        logger.info('Closing RabbitMQ connection...');
        await closeRabbitMQ();

        // Close Redis connections
        logger.info('Closing Redis connections...');
        await closeRedisConnections();

        // Close database connection pool
        logger.info('Closing database connection pool...');
        await closeDatabase();

        clearTimeout(forceExitTimeout);
        logger.info(`${SERVICE_NAME} shut down successfully`);
        process.exit(0);
      } catch (error) {
        clearTimeout(forceExitTimeout);
        logger.error('Error during shutdown', { 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught errors during operation
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      shutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
    });

  } catch (error) {
    logger.error(`Failed to start ${SERVICE_NAME}:`, { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Start the service
startService().catch((error) => {
  logger.error('Unhandled error during startup:', { 
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined
  });
  console.error('Full error:', error);
  process.exit(1);
});
