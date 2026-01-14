/**
 * Entry Point for Compliance Service
 * 
 * AUDIT FIXES:
 * - ERR-1: No unhandledRejection handler → Added
 * - ERR-2: No uncaughtException handler → Added
 * - CFG-2: No config validation → Added validateConfig call
 */
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from './server';
import { db } from './services/database.service';
import { redis } from './services/redis.service';
import { initializeTables } from './services/init-tables';
import { migrateTables } from './services/migrate-tables';
import { schedulerService } from './services/scheduler.service';
import { logger } from './utils/logger';
import { validateConfig } from './config/validate';

const PORT = parseInt(process.env.PORT || '3010', 10);
const HOST = process.env.HOST || '0.0.0.0';

// =============================================================================
// AUDIT FIX ERR-1, ERR-2: Process Error Handlers
// =============================================================================

/**
 * Handle unhandled promise rejections
 * AUDIT FIX ERR-1
 */
process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
  logger.fatal({
    type: 'unhandledRejection',
    reason: reason?.message || reason,
    stack: reason?.stack
  }, 'Unhandled Promise Rejection - shutting down');
  
  // Give time for logging to complete
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

/**
 * Handle uncaught exceptions
 * AUDIT FIX ERR-2
 */
process.on('uncaughtException', (error: Error) => {
  logger.fatal({
    type: 'uncaughtException',
    error: error.message,
    stack: error.stack
  }, 'Uncaught Exception - shutting down immediately');
  
  // Must exit immediately for uncaught exceptions
  process.exit(1);
});

/**
 * Handle uncaught exception in async context (Node 15+)
 */
process.on('uncaughtExceptionMonitor', (error: Error, origin: string) => {
  logger.error({
    type: 'uncaughtExceptionMonitor',
    error: error.message,
    origin,
    stack: error.stack
  }, 'Uncaught exception detected (pre-handler)');
});

/**
 * Handle warnings
 */
process.on('warning', (warning: Error) => {
  logger.warn({
    type: 'warning',
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  }, 'Process warning');
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
  try {
    // ==========================================================================
    // AUDIT FIX CFG-2: Validate configuration before starting
    // ==========================================================================
    logger.info('Validating configuration...');
    validateConfig();
    logger.info('Configuration validated successfully');

    // Connect to database
    logger.info('Connecting to database...');
    await db.connect();
    logger.info('Database connected');

    // Initialize tables
    logger.info('Initializing tables...');
    await initializeTables();
    logger.info('Tables initialized');

    // Run migrations
    logger.info('Running migrations...');
    await migrateTables();
    logger.info('Migrations completed');

    // Connect to Redis
    logger.info('Connecting to Redis...');
    await redis.connect();
    logger.info('Redis connected');

    // Start scheduled compliance jobs
    logger.info('Starting scheduled jobs...');
    schedulerService.startScheduledJobs();
    logger.info('Scheduled jobs started');

    // Create and start server
    const app = await createServer();
    await app.listen({ port: PORT, host: HOST });

    logger.info({
      port: PORT,
      host: HOST,
      nodeEnv: process.env.NODE_ENV,
      endpoints: {
        health: `http://${HOST}:${PORT}/health`,
        dashboard: `http://${HOST}:${PORT}/api/v1/compliance/dashboard`,
        admin: `http://${HOST}:${PORT}/api/v1/compliance/admin/pending`,
        batch: `http://${HOST}:${PORT}/api/v1/compliance/batch/jobs`
      }
    }, 'Compliance service started successfully');
    
  } catch (error: any) {
    logger.fatal({ 
      error: error.message,
      stack: error.stack 
    }, 'Failed to start server');
    process.exit(1);
  }
}

// =============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// =============================================================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
    return;
  }
  
  isShuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated');

  // Set a timeout to force exit if graceful shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Stop accepting new jobs
    logger.info('Stopping scheduled jobs...');
    schedulerService.stopAllJobs();
    
    // Close database connection
    logger.info('Closing database connection...');
    await db.close();
    
    // Close Redis connection
    logger.info('Closing Redis connection...');
    await redis.close();
    
    clearTimeout(forceExitTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error during graceful shutdown');
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Additional signal handlers
process.on('SIGHUP', () => {
  logger.info('SIGHUP received - reloading configuration (if supported)');
  // Could implement config hot-reload here
});

// =============================================================================
// START THE SERVER
// =============================================================================

startServer();
