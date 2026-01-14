import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

/**
 * GRACEFUL SHUTDOWN
 * 
 * Handles shutdown signals and ensures clean resource cleanup
 * Phase 7: Production Readiness & Reliability
 */

export interface ShutdownManager {
  isShuttingDown: boolean;
  shutdown(signal: string): Promise<void>;
}

export function createShutdownManager(
  server: FastifyInstance,
  resources: {
    db?: Pool;
    redis?: Redis;
    additionalCleanup?: () => Promise<void>;
  }
): ShutdownManager {
  let isShuttingDown = false;
  let shutdownTimeout: NodeJS.Timeout | null = null;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      console.log('Shutdown already in progress...');
      return;
    }

    isShuttingDown = true;
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Set a timeout for forced shutdown
    const SHUTDOWN_TIMEOUT = 30000; // 30 seconds
    shutdownTimeout = setTimeout(() => {
      console.error('Graceful shutdown timeout exceeded. Forcing shutdown...');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
      // Step 1: Stop accepting new requests
      console.log('1. Stopping new connections...');
      await server.close();
      console.log('   ✓ Server closed');

      // Step 2: Wait for ongoing requests to complete
      console.log('2. Waiting for ongoing requests to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second grace period
      console.log('   ✓ Grace period completed');

      // Step 3: Close database connections
      if (resources.db) {
        console.log('3. Closing database connections...');
        await resources.db.end();
        console.log('   ✓ Database connections closed');
      }

      // Step 4: Close Redis connections
      if (resources.redis) {
        console.log('4. Closing Redis connections...');
        await resources.redis.quit();
        console.log('   ✓ Redis connections closed');
      }

      // Step 5: Additional cleanup
      if (resources.additionalCleanup) {
        console.log('5. Running additional cleanup...');
        await resources.additionalCleanup();
        console.log('   ✓ Additional cleanup completed');
      }

      // Clear shutdown timeout
      if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
      }

      console.log('Graceful shutdown completed successfully');
      process.exit(0);

    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // Register signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION').catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED_REJECTION').catch(() => process.exit(1));
  });

  return {
    get isShuttingDown() {
      return isShuttingDown;
    },
    shutdown
  };
}

/**
 * Middleware to reject requests during shutdown
 */
export function createShutdownMiddleware(shutdownManager: ShutdownManager) {
  return async (_request: any, reply: any) => {
    if (shutdownManager.isShuttingDown) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Server is shutting down. Please try again later.'
      });
    }
  };
}
