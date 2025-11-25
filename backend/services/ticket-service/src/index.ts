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

const reservationCleanupWorker = new ReservationCleanupWorker();
let app: FastifyInstance | null = null;
let isShuttingDown = false;

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
