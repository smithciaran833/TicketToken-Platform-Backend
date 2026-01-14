import { Pool } from 'pg';
import { createApp } from './app';
import logger from './utils/logger';
import { validateConfig, getConfig } from './config/validate';
// Secrets loaded via validateConfig

/**
 * SERVER ENTRY POINT
 * 
 * Application bootstrap and server startup
 * 
 * AUDIT FIXES:
 * - ERR-4: Added process error handlers (unhandledRejection, uncaughtException)
 * - SEC-2/CFG-1: Load secrets from secrets manager before startup
 */

// =============================================================================
// AUDIT FIX ERR-4: Process Error Handlers
// =============================================================================

/**
 * Handle unhandled promise rejections
 * These can crash the process if not caught
 */
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error({
    type: 'UNHANDLED_REJECTION',
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
      name: reason.name
    } : reason,
    promise: String(promise)
  }, 'Unhandled Promise Rejection - this is a bug that should be fixed');
  
  // In production, we might want to exit to let the container orchestrator restart
  if (process.env.NODE_ENV === 'production' && process.env.EXIT_ON_UNHANDLED_REJECTION === 'true') {
    logger.fatal('Exiting due to unhandled rejection in production');
    process.exit(1);
  }
});

/**
 * Handle uncaught exceptions
 * These indicate serious bugs and should be fixed immediately
 */
process.on('uncaughtException', (error: Error) => {
  logger.fatal({
    type: 'UNCAUGHT_EXCEPTION',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  }, 'Uncaught Exception - process will exit');
  
  // Always exit on uncaught exceptions - the process is in an undefined state
  process.exit(1);
});

/**
 * Handle SIGTERM (graceful shutdown request)
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received - initiating graceful shutdown');
});

/**
 * Handle SIGINT (Ctrl+C)
 */
process.on('SIGINT', () => {
  logger.info('SIGINT received - initiating graceful shutdown');
});

// Validate all required environment variables
validateConfig();

// Log configuration summary
const configSummary = getConfig();
logger.info({ config: { nodeEnv: configSummary.NODE_ENV, port: configSummary.PORT } }, 'Service configuration');

// Create database pool
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Handle pool errors
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
  process.exit(-1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database pool');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing database pool');
  await pool.end();
  process.exit(0);
});

// Start server
const PORT = parseInt(process.env.PORT || '3019');
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    // Test Solana connection
    const solanaConnected = true; // TODO: implement testSolanaConnection
    if (!solanaConnected) {
      logger.warn('Solana connection test failed - service will start but blockchain operations may fail');
    }

    // Create and start application
    const app = await createApp(pool);
    
    await app.listen({ port: PORT, host: HOST });
    
    logger.info(`Transfer service running on ${HOST}:${PORT}`, {
      port: PORT,
      host: HOST,
      healthEndpoint: `http://${HOST}:${PORT}/health`
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
