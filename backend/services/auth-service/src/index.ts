// DEBUG BREADCRUMBS - Remove after debugging
console.log('[BOOT] 0. Script starting...');

// Tracing must be initialized first
console.log('[BOOT] 1. Importing tracing...');
import { initTracing, shutdownTracing } from './config/tracing';
console.log('[BOOT] 2. Calling initTracing()...');
initTracing();
console.log('[BOOT] 3. Tracing initialized');

console.log('[BOOT] 4. Importing buildApp...');
import { buildApp } from './app';
console.log('[BOOT] 5. Importing env...');
import { env } from './config/env';
console.log('[BOOT] 6. Importing database pool...');
import { pool } from './config/database';
console.log('[BOOT] 7. Importing redis...');
import { initRedis, getRedis, closeRedisConnections } from './config/redis';
console.log('[BOOT] 8. Importing logger...');
import { logger } from './utils/logger';
console.log('[BOOT] 9. Importing secrets...');
import { loadSecrets } from './config/secrets';
console.log('[BOOT] 10. Importing monitoring...');
import { markStartupComplete, markStartupFailed } from './services/monitoring.service';
console.log('[BOOT] 11. All imports complete');

const LB_DRAIN_DELAY = parseInt(process.env.LB_DRAIN_DELAY || '5', 10) * 1000;
let isShuttingDown = false;

async function start() {
  console.log('[BOOT] 12. start() called');
  try {
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from secrets manager...');
      await loadSecrets();
      logger.info('Secrets loaded successfully');
    }

    console.log('[BOOT] 13. About to test database...');
    await pool.query('SELECT NOW()');
    logger.info('Database connected');
    console.log('[BOOT] 14. Database connected');

    console.log('[BOOT] 15. About to init Redis...');
    await initRedis();
    console.log('[BOOT] 16. Redis initialized');

    const redis = getRedis();
    redis.on('error', (err) => {
      logger.error('Redis error', {
        error: err.message,
        code: (err as any).code,
      });
    });

    redis.on('close', () => {
      if (!isShuttingDown) {
        logger.warn('Redis connection closed unexpectedly');
      }
    });

    redis.on('reconnecting', (delay: number) => {
      logger.info('Redis reconnecting', { delay });
    });

    console.log('[BOOT] 17. About to ping Redis...');
    await redis.ping();
    logger.info('Redis connected');
    console.log('[BOOT] 18. Redis ping successful');

    console.log('[BOOT] 19. About to buildApp()...');
    const app = await buildApp();
    console.log('[BOOT] 20. buildApp() complete');

    console.log('[BOOT] 21. About to listen on port', env.PORT);
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });
    console.log('[BOOT] 22. Listening!');

    markStartupComplete();
    logger.info(`Auth service running on port ${env.PORT}`);
    console.log('[BOOT] 23. STARTUP COMPLETE');

    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
      }

      isShuttingDown = true;
      logger.info(`${signal} received, shutting down gracefully...`);

      try {
        if (LB_DRAIN_DELAY > 0) {
          logger.info(`Waiting ${LB_DRAIN_DELAY}ms for LB drain...`);
          await new Promise(resolve => setTimeout(resolve, LB_DRAIN_DELAY));
        }

        await app.close();
        logger.info('HTTP server closed');

        await pool.end();
        logger.info('Database pool closed');

        await closeRedisConnections();
        logger.info('Redis connections closed');

        await shutdownTracing();
        logger.info('Tracing shutdown complete');

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, () => gracefulShutdown(signal));
    });

  } catch (error) {
    console.log('[BOOT] ERROR:', error);
    markStartupFailed(error instanceof Error ? error.message : 'Unknown error');
    logger.error('Failed to start auth service', { error });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.log('[BOOT] UNHANDLED REJECTION:', reason);
  logger.error('Unhandled Rejection', { reason, promise: String(promise) });
});

process.on('uncaughtException', (error) => {
  console.log('[BOOT] UNCAUGHT EXCEPTION:', error);
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

console.log('[BOOT] 11.5. About to call start()...');
start();
