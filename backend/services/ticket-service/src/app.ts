import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
// Import routes
import ticketRoutes from './routes/ticketRoutes';
import purchaseRoutes from './routes/purchaseRoutes';
import orderRoutes from './routes/orders.routes';
import webhookRoutes from './routes/webhookRoutes';
import healthRoutes from './routes/health.routes';
import internalRoutes from './routes/internalRoutes';
import transferRoutes from './routes/transferRoutes';
import qrRoutes from './routes/qrRoutes';
import validationRoutes from './routes/validationRoutes';
import mintRoutes from './routes/mintRoutes';
// Import middleware
import { errorHandler } from './middleware/errorHandler';
// Import services
import { DatabaseService } from './services/databaseService';

export async function buildApp(): Promise<FastifyInstance> {
  // Initialize database connection FIRST
  await DatabaseService.initialize();

  const app = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024, // 10MB
    trustProxy: true,
  });
  // ============================================================================
  // PLUGINS
  // ============================================================================
  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });
  // Helmet (security headers)
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  // Rate Limiting (global)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  // ============================================================================
  // ROUTES
  // ============================================================================
  // Health routes (no prefix)
  await app.register(healthRoutes);
  // Internal routes (no prefix - they define their own paths)
  await app.register(internalRoutes);
  // Webhook routes
  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  // API routes with auth
  await app.register(ticketRoutes, { prefix: '/api/v1/tickets' });
  await app.register(purchaseRoutes, { prefix: '/api/v1/purchase' });
  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(transferRoutes, { prefix: '/api/v1/transfer' });
  await app.register(qrRoutes, { prefix: '/api/v1/qr' });
  await app.register(validationRoutes, { prefix: '/api/v1/validation' });
  await app.register(mintRoutes, { prefix: '/mint' });
  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  app.setErrorHandler(errorHandler as any);
  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: 'Route not found' });
  });
  return app;
}
