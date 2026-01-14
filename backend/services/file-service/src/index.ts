/**
 * File Service Entry Point
 * 
 * AUDIT FIXES:
 * - ERR-1: Added unhandledRejection handler
 * - ERR-2: Added uncaughtException handler
 * - ERR-4: Proper process error handling
 */

import dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

import { createApp } from './app';
import { logger } from './utils/logger';
import { validateConfigOrDie } from './config/validate';
import { connectDatabase, disconnectDatabase } from './config/database.config';
import { setupStorage } from './storage/storage.setup';
import { startWorkers, stopWorkers } from './workers';
import { virusScanService } from './services/virus-scan.service';

// =============================================================================
// AUDIT FIX ERR-1,2: Process Error Handlers
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
 * Handle SIGTERM (graceful shutdown request from k8s/docker)
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

// =============================================================================
// Configuration
// =============================================================================

const PORT = process.env.PORT || 3013;
const HOST = process.env.HOST || '0.0.0.0';

// Track if shutdown is in progress to prevent multiple shutdown calls
let isShuttingDown = false;

// =============================================================================
// Service Startup
// =============================================================================

async function startService() {
  try {
    // AUDIT FIX: HIGH Priority - Validate config at startup
    // Fails fast if required environment variables are missing
    validateConfigOrDie();
    
    logger.info('🚀 Starting File Service...');
    logger.info({
      environment: process.env.NODE_ENV,
      port: PORT,
      host: HOST,
      nodeVersion: process.version,
    }, 'Service configuration');
    
    // Connect to database
    await connectDatabase();
    logger.info('✅ Database connected');
    
    // Setup storage (S3/local)
    await setupStorage();
    logger.info('✅ Storage configured');
    
    // Initialize virus scanner
    try {
      await virusScanService.initialize();
      logger.info('✅ Virus scanner initialized');
    } catch (scanError) {
      logger.warn({ error: scanError }, '⚠️ Virus scanner initialization failed - uploads will skip scanning');
    }
    
    // Start background workers
    try {
      await startWorkers();
      logger.info('✅ Background workers started');
    } catch (workerError) {
      logger.warn({ error: workerError }, '⚠️ Background workers failed to start - service will continue without workers');
    }
    
    // Create Fastify app
    const app = await createApp();
    
    // Start server
    await app.listen({ port: Number(PORT), host: HOST });
    logger.info({
      port: PORT,
      host: HOST,
      healthEndpoint: `http://${HOST}:${PORT}/health`,
      apiEndpoint: `http://${HOST}:${PORT}/api/v1/files`,
    }, `✅ File Service running on port ${PORT}`);
    
    // =============================================================================
    // Graceful Shutdown Handler
    // =============================================================================
    
    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring additional signal');
        return;
      }
      
      isShuttingDown = true;
      logger.info({ signal }, 'Initiating graceful shutdown...');
      
      // Set a timeout to force exit if graceful shutdown takes too long
      const forceExitTimeout = setTimeout(() => {
        logger.error({}, 'Graceful shutdown timed out after 30 seconds - forcing exit');
        process.exit(1);
      }, 30000);
      
      try {
        // Stop accepting new connections
        logger.info('Closing HTTP server...');
        await app.close();
        logger.info('HTTP server closed');
        
        // Stop background workers
        logger.info('Stopping background workers...');
        try {
          await stopWorkers();
          logger.info('Background workers stopped');
        } catch (error) {
          logger.warn({ error }, 'Error stopping workers');
        }
        
        // Disconnect from database
        logger.info('Disconnecting from database...');
        try {
          await disconnectDatabase();
          logger.info('Database disconnected');
        } catch (error) {
          logger.warn({ error }, 'Error disconnecting from database');
        }
        
        clearTimeout(forceExitTimeout);
        logger.info('Graceful shutdown complete');
        process.exit(0);
        
      } catch (error) {
        clearTimeout(forceExitTimeout);
        logger.error({ error }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };
    
    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.fatal({
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    }, 'Failed to start File Service');
    process.exit(1);
  }
}

// Start the service
startService();
