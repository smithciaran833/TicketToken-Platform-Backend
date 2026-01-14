import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import formBody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middleware/error.middleware';
import { tracingMiddleware } from './middleware/tracing.middleware';
// AUDIT FIX LOG-M1/M2/M3: Import request logger middleware
import {
  requestLoggerOnRequest,
  requestLoggerOnResponse,
  addCorrelationIdHeader,
} from './middleware/request-logger';

// Import routes
import notificationRoutes from './routes/notification.routes';
import consentRoutes from './routes/consent.routes';
import healthRoutes from './routes/health.routes';
import analyticsRoutes from './routes/analytics.routes';
import preferencesRoutes from './routes/preferences.routes';
import metricsRoutes from './routes/metrics.routes';
import gdprRoutes from './routes/gdpr.routes';
import marketingRoutes from './routes/marketing.routes';
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
  // AUDIT FIX SEC-H2: Configure helmet with HSTS
  await app.register(helmet, {
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    }
  });
  await app.register(formBody);
  await app.register(multipart);

  // Tracing middleware (must be first to capture all requests)
  app.addHook('onRequest', tracingMiddleware);
  
  // AUDIT FIX LOG-M1/M2/M3: Enhanced request logging with PII redaction
  app.addHook('onRequest', requestLoggerOnRequest);
  app.addHook('onRequest', addCorrelationIdHeader);
  
  // AUDIT FIX LOG-M3: Response logging with performance metrics
  app.addHook('onResponse', requestLoggerOnResponse);
  
  // Track API metrics (excluding /metrics endpoint to avoid recursion)
  app.addHook('onResponse', async (request, reply) => {
    if (request.url !== '/metrics') {
      const responseTime = reply.getResponseTime();
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
  await app.register(marketingRoutes, { prefix: '/api/marketing' });

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
