import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import formBody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middleware/error.middleware';
import { tracingMiddleware } from './middleware/tracing.middleware';

// Import routes
import notificationRoutes from './routes/notification.routes';
import consentRoutes from './routes/consent.routes';
import healthRoutes from './routes/health.routes';
import analyticsRoutes from './routes/analytics.routes';
import preferencesRoutes from './routes/preferences.routes';
import metricsRoutes from './routes/metrics.routes';
import gdprRoutes from './routes/gdpr.routes';
import { webhookController } from './controllers/webhook.controller';
import { metricsService } from './services/metrics.service';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Using our custom logger
    requestIdLogLabel: 'requestId',
    disableRequestLogging: true,
  });

  // Register plugins
  await app.register(cors);
  await app.register(helmet);
  await app.register(formBody);
  await app.register(multipart);

  // Tracing middleware (must be first to capture all requests)
  app.addHook('onRequest', tracingMiddleware);
  
  // Request logging
  app.addHook('onRequest', async (request, reply) => {
    const traceContext = (request as any).traceContext;
    logger.info({
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      traceId: traceContext?.traceId,
      spanId: traceContext?.spanId
    });
  });

  // Response logging and metrics
  app.addHook('onResponse', async (request, reply) => {
    const responseTime = reply.getResponseTime();
    
    logger.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: responseTime,
    });
    
    // Track API metrics (excluding /metrics endpoint to avoid recursion)
    if (request.url !== '/metrics') {
      metricsService.trackApiRequest(
        request.url,
        request.method,
        reply.statusCode
      );
      
      metricsService.recordApiRequestDuration(
        request.url,
        request.method,
        reply.statusCode,
        responseTime / 1000 // Convert ms to seconds
      );
    }
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(metricsRoutes); // Metrics endpoint at /metrics
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(consentRoutes, { prefix: '/api/consent' });
  await app.register(analyticsRoutes, { prefix: '/api' });
  await app.register(preferencesRoutes, { prefix: '/api' });
  await app.register(gdprRoutes, { prefix: '/api' });

  // Webhook endpoints
  app.post('/webhooks/sendgrid', 
    webhookController.handleSendGridWebhook.bind(webhookController)
  );

  app.post('/webhooks/twilio',
    webhookController.handleTwilioWebhook.bind(webhookController)
  );

  app.post('/webhooks/:provider',
    webhookController.handleGenericWebhook.bind(webhookController)
  );

  // Error handler
  app.setErrorHandler(errorHandler);

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: 'Resource not found',
    });
  });

  return app;
}

export default buildApp;
