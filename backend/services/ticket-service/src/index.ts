import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger } from './utils/logger';
import { DatabaseService } from './services/databaseService';
import { RedisService } from './services/redisService';
import { QueueService } from './services/queueService';
import { ReservationCleanupWorker } from './workers/reservation-cleanup.worker';
import { setupGlobalErrorHandlers, asyncHandler } from '@tickettoken/shared/utils/async-handler';
import { loggingMiddleware, errorLoggingMiddleware } from '@tickettoken/shared/middleware/logging.middleware';

// Import middleware
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware, webhookTenantMiddleware } from './middleware/tenant';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import ticketRoutes from './routes/ticketRoutes';
import purchaseRoutes from './routes/purchaseRoutes';
import orderRoutes from './routes/orders.routes';
import webhookRoutes from './routes/webhookRoutes';
import healthRoutes from './routes/health.routes';
import internalRoutes from './routes/internalRoutes';  // ISSUE #22 FIX: Add internal routes

// Set up global error handlers first
setupGlobalErrorHandlers();

const app = express();
const PORT = process.env.PORT || 3004;

// Initialize cleanup worker
const reservationCleanupWorker = new ReservationCleanupWorker();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(loggingMiddleware(logger));

// Health check route (no auth required)
app.use('/health', healthRoutes);

// Admin route for reservation cleanup metrics
app.get('/admin/reservations/metrics', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // Should verify admin role in production
  const metrics = reservationCleanupWorker.getMetrics();
  res.json(metrics);
}));

// ISSUE #22 FIX: Internal service-to-service routes (no user auth, uses service auth)
app.use('/', internalRoutes);  // Mount at root since routes include /internal prefix

// Webhook routes (use webhook tenant middleware for default tenant)
app.use('/api/v1/webhooks', webhookTenantMiddleware, webhookRoutes);

// API routes (require auth and tenant context)
app.use('/api/v1/tickets', authMiddleware, tenantMiddleware, ticketRoutes);
app.use('/api/v1/purchase', authMiddleware, tenantMiddleware, purchaseRoutes);
app.use('/api/v1/orders', authMiddleware, tenantMiddleware, orderRoutes);

// Error handling middleware (must be last)
app.use(errorLoggingMiddleware(logger));
app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize services and start server
async function startServer() {
  try {
    logger.info('Starting ticket service...');

    // Initialize database with retry
    await DatabaseService.initialize();
    logger.info('Database initialized');

    // Initialize Redis with retry
    await RedisService.initialize();
    logger.info('Redis initialized');

    // Initialize Queue service
    await QueueService.initialize();
    logger.info('Queue service initialized');

    // Start reservation cleanup worker
    const cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL_MS || '60000');
    await reservationCleanupWorker.start(cleanupInterval);
    logger.info('Reservation cleanup worker started');

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Ticket service running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Stop workers
          reservationCleanupWorker.stop();
          logger.info('Workers stopped');

          // Close database connections
          await DatabaseService.close();
          logger.info('Database connections closed');

          // Close Redis connections
          await RedisService.close();
          logger.info('Redis connections closed');

          // Close Queue connections
          await QueueService.close();
          logger.info('Queue connections closed');

          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error('Unhandled error during startup:', error);
  process.exit(1);
});
