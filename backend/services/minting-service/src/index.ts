import 'dotenv/config';
import fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import logger from './utils/logger';
import { initializeDatabase } from './config/database';
import { initializeSolana } from './config/solana';
import { startMintingWorker } from './workers/mintingWorker';
import { initializeQueues } from './queues/mintQueue';
import { startBalanceMonitoring, stopBalanceMonitoring } from './services/BalanceMonitor';
import webhookRoutes from './routes/webhook';
import internalMintRoutes from './routes/internal-mint';
import metricsRoutes from './routes/metrics';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting Minting Service...');

    // Initialize connections
    await initializeDatabase();
    await initializeSolana();
    await initializeQueues();

    // Start worker
    await startMintingWorker();

    // Start balance monitoring
    startBalanceMonitoring();

    logger.info('✅ Minting Service started successfully');
    logger.info(`   Port: ${process.env.MINTING_SERVICE_PORT || 3018}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);

    // Fastify app for webhooks and health checks
    const app = fastify({ logger: false });

    // Apply security middleware
    await app.register(helmet);
    await app.register(rateLimit, {
      max: 100,
      timeWindow: 60 * 1000
    });

    // Register routes
    await app.register(healthRoutes);
    await app.register(metricsRoutes);
    await app.register(adminRoutes);
    await app.register(webhookRoutes, { prefix: '/api' });
    await app.register(internalMintRoutes);

    const port = parseInt(process.env.MINTING_SERVICE_PORT || '3018');
    await app.listen({ port, host: '0.0.0.0' });
    logger.info(`🌐 API listening on port ${port}`);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      stopBalanceMonitoring();
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      stopBalanceMonitoring();
      await app.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start Minting Service:', error);
    process.exit(1);
  }
}

main();
