/**
 * Graceful Shutdown Utility
 * 
 * Handles clean shutdown of the service by:
 * - Closing database connections
 * - Closing Redis connections
 * - Draining in-flight HTTP requests
 * - Stopping background jobs
 * - Cleaning up resources
 */

import { FastifyInstance } from 'fastify';
import { logger } from './logger';
import { healthCheckService } from '../services/health-check.service';
import { idempotencyService } from '../services/idempotency.service';
import { performanceMetricsService } from '../services/performance-metrics.service';

export interface ShutdownConfig {
  timeout?: number; // Max time to wait for graceful shutdown (ms)
  onShutdown?: () => Promise<void>; // Custom cleanup function
}

class GracefulShutdown {
  private isShuttingDown = false;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private server: FastifyInstance | null = null;

  /**
   * Initialize graceful shutdown listeners
   */
  init(server: FastifyInstance, config: ShutdownConfig = {}): void {
    this.server = server;
    const timeout = config.timeout || 30000; // 30 seconds default

    // Handle termination signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM', timeout, config.onShutdown));
    process.on('SIGINT', () => this.shutdown('SIGINT', timeout, config.onShutdown));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.shutdown('uncaughtException', timeout, config.onShutdown);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      this.shutdown('unhandledRejection', timeout, config.onShutdown);
    });

    logger.info('Graceful shutdown initialized', { timeout });
  }

  /**
   * Perform graceful shutdown
   */
  private async shutdown(
    signal: string,
    timeout: number,
    onShutdown?: () => Promise<void>
  ): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;

    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Set a timeout to force shutdown if graceful shutdown takes too long
    this.shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, timeout);

    try {
      // Stop accepting new requests
      if (this.server) {
        logger.info('Stopping server from accepting new connections...');
        await this.server.close();
        logger.info('Server closed successfully');
      }

      // Stop health check monitoring
      logger.info('Stopping health check monitoring...');
      healthCheckService.stopMonitoring();

      // Stop idempotency cleanup
      logger.info('Stopping idempotency service cleanup...');
      idempotencyService.stopCleanup();

      // Clear old performance metrics
      logger.info('Cleaning up performance metrics...');
      performanceMetricsService.clearOldMetrics();

      // Run custom cleanup if provided
      if (onShutdown) {
        logger.info('Running custom shutdown handler...');
        await onShutdown();
      }

      // Clear shutdown timeout
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = null;
      }

      logger.info('Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Clear shutdown timeout
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = null;
      }

      process.exit(1);
    }
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Middleware to reject requests during shutdown
   */
  middleware() {
    return async (request: any, reply: any) => {
      if (this.isShuttingDown) {
        reply.code(503).send({
          success: false,
          error: 'Service is shutting down',
        });
      }
    };
  }
}

// Export singleton instance
export const gracefulShutdown = new GracefulShutdown();

/**
 * Helper function to register cleanup for a resource
 */
export function onShutdown(cleanup: () => Promise<void>): void {
  // Store cleanup functions for execution during shutdown
  const existingHandler = process.listeners('SIGTERM')[0];
  
  if (existingHandler) {
    process.removeListener('SIGTERM', existingHandler as any);
  }

  process.on('SIGTERM', async () => {
    try {
      await cleanup();
    } catch (error) {
      logger.error('Error in shutdown cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    if (existingHandler) {
      (existingHandler as any)();
    }
  });
}
