import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

// Import routes
import paymentRoutes from './routes/payment.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import groupPaymentRoutes from './routes/group-payment.routes';
import venueRoutes from './routes/venue.routes';
import complianceRoutes from './routes/compliance.routes';
import webhookRoutes from './routes/webhook.routes';
import internalRoutes from './routes/internal.routes';
import internalTaxRoutes from './routes/internal-tax.routes';
import healthRoutes from './routes/health.routes';
import feeCalculatorRoutes from './routes/fee-calculator.routes';

// Import middleware
import { errorHandler } from './middleware/error-handler';
import { idempotencyCacheHook } from './middleware/idempotency';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024, // 10MB
    trustProxy: true,
  });

  // ============================================================================
  // RAW BODY HANDLER FOR WEBHOOKS (CRITICAL FOR STRIPE SIGNATURE VERIFICATION)
  // ============================================================================
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, async (req: FastifyRequest, payload: Buffer) => {
    // Store raw body for webhook signature verification
    (req as any).rawBody = payload;
    
    // Parse JSON
    const str = payload.toString('utf8');
    try {
      return JSON.parse(str);
    } catch (err) {
      throw new Error('Invalid JSON');
    }
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

  // Idempotency response caching hook (global)
  app.addHook('onSend', idempotencyCacheHook);

  // ============================================================================
  // ROUTES
  // ============================================================================
  
  // Health routes (no prefix)
  app.register(healthRoutes);

  // API routes
  app.register(paymentRoutes, { prefix: '/payments' });
  app.register(marketplaceRoutes, { prefix: '/marketplace' });
  app.register(groupPaymentRoutes, { prefix: '/group-payments' });
  app.register(venueRoutes, { prefix: '/venues' });
  app.register(complianceRoutes, { prefix: '/compliance' });
  app.register(webhookRoutes, { prefix: '/webhooks' });
  app.register(feeCalculatorRoutes, { prefix: '/fees' });

  // Internal routes (no prefix - they define their own /internal paths)
  app.register(internalRoutes);
  app.register(internalTaxRoutes);

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  app.setErrorHandler(errorHandler as any);

  return app;
}
