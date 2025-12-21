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

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down ${SERVICE_NAME}...`);

      // Stop background jobs
      if (expirationJob) expirationJob.stop();
      if (reconciliationJob) reconciliationJob.stop();
      // if (reportGenerationJob) reportGenerationJob.stop();
      // if (exportSchedulerJob) exportSchedulerJob.stop();

      // Close Fastify
      await app.close();

      // Close RabbitMQ
      await closeRabbitMQ();

      // Close Redis
      await closeRedisConnections();

      // Close database
      await closeDatabase();

      logger.info(`${SERVICE_NAME} shut down successfully`);
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

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
