/**
 * Centralized Shutdown Manager
 * 
 * MEDIUM FIX (Issue #6): Coordinates graceful shutdown across all services
 * 
 * Purpose:
 * - Single point of control for application shutdown
 * - Ensures proper cleanup order
 * - Prevents resource leaks and incomplete transactions
 * - Handles SIGINT/SIGTERM signals gracefully
 * 
 * Shutdown Sequence:
 * 1. Stop accepting new requests (server.close())
 * 2. Wait for in-flight requests to complete (configurable timeout)
 * 3. Stop background jobs (token refresh, cleanup jobs)
 * 4. Close database connections (MongoDB, PostgreSQL, Redis)
 */

import { logger } from './logger';

export type ShutdownPriority = 'critical' | 'high' | 'normal' | 'low';

export interface ShutdownHandler {
  name: string;
  priority: ShutdownPriority;
  timeout?: number; // Max time to wait for this handler (ms)
  handler: () => Promise<void> | void;
}

class ShutdownManager {
  private handlers: Map<string, ShutdownHandler> = new Map();
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds default
  private signalsRegistered = false;

  /**
   * Register a shutdown handler
   */
  register(handler: ShutdownHandler): void {
    if (this.handlers.has(handler.name)) {
      logger.warn({ name: handler.name }, 'Shutdown handler already registered, replacing');
    }
    this.handlers.set(handler.name, handler);
    logger.debug({ name: handler.name, priority: handler.priority }, 'Shutdown handler registered');
  }

  /**
   * Unregister a shutdown handler
   */
  unregister(name: string): void {
    this.handlers.delete(name);
    logger.debug({ name }, 'Shutdown handler unregistered');
  }

  /**
   * Set global shutdown timeout
   */
  setShutdownTimeout(timeoutMs: number): void {
    this.shutdownTimeout = timeoutMs;
  }

  /**
   * Register signal handlers for graceful shutdown
   * Should be called once during application startup
   */
  registerSignalHandlers(): void {
    if (this.signalsRegistered) {
      logger.warn('Signal handlers already registered');
      return;
    }

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info({ signal }, 'Received shutdown signal');
        await this.shutdown(0);
      });
    });

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', async (error) => {
      logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception - initiating shutdown');
      await this.shutdown(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled rejection - initiating shutdown');
      await this.shutdown(1);
    });

    this.signalsRegistered = true;
    logger.info('Shutdown signal handlers registered');
  }

  /**
   * Execute graceful shutdown
   */
  async shutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    logger.info({ exitCode, handlerCount: this.handlers.size }, 'Starting graceful shutdown');

    // Sort handlers by priority
    const sortedHandlers = this.getSortedHandlers();

    const results: Array<{ name: string; success: boolean; duration: number; error?: string }> = [];

    // Execute handlers in priority order
    for (const handler of sortedHandlers) {
      const handlerStart = Date.now();
      const handlerTimeout = handler.timeout || this.shutdownTimeout;

      try {
        logger.info({ name: handler.name, priority: handler.priority }, 'Executing shutdown handler');

        // Execute handler with timeout (wrap in Promise.resolve to handle both sync and async)
        await this.executeWithTimeout(
          Promise.resolve(handler.handler()),
          handlerTimeout,
          handler.name
        );

        const duration = Date.now() - handlerStart;
        results.push({ name: handler.name, success: true, duration });

        logger.info({ name: handler.name, duration }, 'Shutdown handler completed successfully');
      } catch (error: any) {
        const duration = Date.now() - handlerStart;
        results.push({
          name: handler.name,
          success: false,
          duration,
          error: error.message,
        });

        logger.error(
          { name: handler.name, error: error.message, duration },
          'Shutdown handler failed'
        );
      }
    }

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    logger.info(
      {
        totalDuration,
        successCount,
        failureCount,
        exitCode,
      },
      'Graceful shutdown complete'
    );

    // Give logger time to flush
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Exit process
    process.exit(exitCode);
  }

  /**
   * Get handlers sorted by priority
   */
  private getSortedHandlers(): ShutdownHandler[] {
    const priorityOrder: Record<ShutdownPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    return Array.from(this.handlers.values()).sort((a, b) => {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    handlerName: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Shutdown handler '${handlerName}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get current shutdown status
   */
  getStatus(): {
    isShuttingDown: boolean;
    handlerCount: number;
    handlers: Array<{ name: string; priority: ShutdownPriority }>;
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      handlerCount: this.handlers.size,
      handlers: Array.from(this.handlers.values()).map((h) => ({
        name: h.name,
        priority: h.priority,
      })),
    };
  }

  /**
   * Check if currently shutting down
   */
  isShutdown(): boolean {
    return this.isShuttingDown;
  }
}

// Export singleton instance
export const shutdownManager = new ShutdownManager();

// Convenience functions
export const registerShutdownHandler = (handler: ShutdownHandler) =>
  shutdownManager.register(handler);

export const unregisterShutdownHandler = (name: string) =>
  shutdownManager.unregister(name);

export const initializeShutdownHandlers = () =>
  shutdownManager.registerSignalHandlers();

export const isShuttingDown = () =>
  shutdownManager.isShutdown();
