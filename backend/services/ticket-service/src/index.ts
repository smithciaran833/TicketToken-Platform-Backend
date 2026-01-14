/**
 * OpenTelemetry MUST be initialized BEFORE any other imports
 * This ensures all subsequent modules are properly instrumented
 * Fixes audit findings: DT1, DT2 (OpenTelemetry SDK, Auto-instrumentation)
 */
import { initTracing, shutdownTracing } from './utils/tracing';

// Initialize tracing FIRST - before other imports load their modules
initTracing();

// Now import everything else
import { buildApp } from './app';
import { DatabaseService } from './services/databaseService';
import { RedisService } from './services/redisService';
import { ReservationCleanupWorker } from './workers/reservation-cleanup.worker';
import { setupGlobalErrorHandlers } from './utils/async-handler';
import { authMiddleware } from './middleware/auth';
import { logger } from './utils/logger';
import type { FastifyInstance } from 'fastify';

setupGlobalErrorHandlers();

const log = logger.child({ component: 'Server' });
const PORT = 3004;
const HOST = '0.0.0.0';
const SHUTDOWN_TIMEOUT = 30000; // 30 seconds
const CONNECTION_DRAIN_TIMEOUT = parseInt(process.env.CONNECTION_DRAIN_TIMEOUT || '15000', 10);

const reservationCleanupWorker = new ReservationCleanupWorker();
let app: FastifyInstance | null = null;
let isShuttingDown = false;

// =============================================================================
// GD5: CONNECTION DRAINING (Batch 25)
// Track in-flight requests and wait for them to complete
// =============================================================================

let inFlightRequests = 0;
const requestCounters = {
  total: 0,
  completed: 0,
  errors: 0,
};

/**
 * Increment in-flight request counter
 */
function onRequestStart(): void {
  inFlightRequests++;
  requestCounters.total++;
}

/**
 * Decrement in-flight request counter
 */
function onRequestEnd(hasError: boolean = false): void {
  inFlightRequests--;
  requestCounters.completed++;
  if (hasError) {
    requestCounters.errors++;
  }
}

/**
 * Get current in-flight request count
 */
export function getInFlightRequests(): number {
  return inFlightRequests;
}

/**
 * Get request statistics
 */
export function getRequestStats(): typeof requestCounters & { inFlight: number } {
  return {
    ...requestCounters,
    inFlight: inFlightRequests,
  };
}

/**
 * Wait for in-flight requests to drain
 * Returns true if all requests completed, false if timeout
 */
async function waitForConnectionDrain(timeoutMs: number = CONNECTION_DRAIN_TIMEOUT): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 100; // Check every 100ms

  log.info('Waiting for in-flight requests to complete', { 
    inFlightRequests,
    timeoutMs 
  });

  while (inFlightRequests > 0) {
    const elapsed = Date.now() - startTime;
    
    if (elapsed >= timeoutMs) {
      log.warn('Connection drain timeout reached', { 
        remainingRequests: inFlightRequests,
        timeoutMs 
      });
      return false;
    }

    // Log progress every second
    if (elapsed % 1000 < checkInterval) {
      log.info('Connection drain progress', {
        inFlightRequests,
        elapsedMs: elapsed,
        remainingMs: timeoutMs - elapsed,
      });
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  log.info('All in-flight requests completed', { 
    drainTimeMs: Date.now() - startTime 
  });
  return true;
}

async function startServer() {
  log.info('Starting ticket service...');
  
  await DatabaseService.initialize();
  log.info('Database initialized');
  
  await RedisService.initialize();
  log.info('Redis initialized');

  const cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL_MS || '60000');
  await reservationCleanupWorker.start(cleanupInterval);
  log.info('Cleanup worker started', { intervalMs: cleanupInterval });

  app = await buildApp();
  
  // Add reservation metrics endpoint BEFORE listening
  app.get('/admin/reservations/metrics', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    const metrics = reservationCleanupWorker.getMetrics();
    return reply.send(metrics);
  });

  await app.listen({ port: PORT, host: HOST });
  log.info(`Ticket Service (Fastify) running`, { 
    host: HOST, 
    port: PORT,
    url: `http://${HOST}:${PORT}`
  });
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress, ignoring signal', { signal });
    return;
  }
  
  isShuttingDown = true;
  log.info('Graceful shutdown initiated', { signal });

  const shutdownStart = Date.now();

  try {
    // GD5: Wait for in-flight requests to complete before stopping
    log.info('Draining active connections...', { inFlightRequests });
    const drainComplete = await waitForConnectionDrain(CONNECTION_DRAIN_TIMEOUT);
    if (!drainComplete) {
      log.warn('Some requests may have been interrupted during shutdown', {
        remainingRequests: inFlightRequests,
      });
    }

    // 1. Stop accepting new requests
    if (app) {
      log.info('Closing Fastify server...');
      await Promise.race([
        app.close(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Server close timeout')), 10000)
        )
      ]);
      log.info('Fastify server closed');
    }

    // 2. Stop background workers
    log.info('Stopping cleanup worker...');
    await reservationCleanupWorker.stop();
    log.info('Cleanup worker stopped');

    // 3. Close database connections
    log.info('Closing database connections...');
    await DatabaseService.close();
    log.info('Database closed');

    // 4. Close Redis connections
    log.info('Closing Redis connections...');
    await RedisService.close();
    log.info('Redis closed');

    // 5. Close queue connections if they exist
    try {
      const QueueService = await import('./services/queueService').then(m => m.QueueService);
      if (QueueService && typeof QueueService.close === 'function') {
        log.info('Closing queue connections...');
        await QueueService.close();
        log.info('Queue closed');
      }
    } catch (err) {
      // QueueService might not exist or have close method
      log.debug('Queue service not available or already closed');
    }

    // 6. Shutdown OpenTelemetry tracing (flush pending spans)
    log.info('Shutting down tracing...');
    await shutdownTracing();
    log.info('Tracing shut down');

    const shutdownDuration = Date.now() - shutdownStart;
    log.info('Graceful shutdown complete', { 
      durationMs: shutdownDuration,
      signal 
    });
    
    process.exit(0);
  } catch (error) {
    const shutdownDuration = Date.now() - shutdownStart;
    log.error('Error during graceful shutdown', { 
      error,
      durationMs: shutdownDuration,
      signal
    });
    // Force exit after error
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors during shutdown
process.on('beforeExit', (code) => {
  log.info('Process beforeExit event', { code });
});

startServer().catch(err => {
  log.error('Failed to start server', { error: err });
  process.exit(1);
});
