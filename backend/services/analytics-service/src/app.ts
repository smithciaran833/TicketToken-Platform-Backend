import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { connectDatabases } from './config/database';
import { logger } from './utils/logger';

// Import routes
import healthRoutes from './routes/health.routes';
import analyticsRoutes from './routes/analytics.routes';
import metricsRoutes from './routes/metrics.routes';
import dashboardRoutes from './routes/dashboard.routes';
import alertsRoutes from './routes/alerts.routes';
import reportsRoutes from './routes/reports.routes';
import exportRoutes from './routes/export.routes';
import customerRoutes from './routes/customer.routes';
import campaignRoutes from './routes/campaign.routes';
import insightsRoutes from './routes/insights.routes';
import predictionRoutes from './routes/prediction.routes';
import realtimeRoutes from './routes/realtime.routes';
import widgetRoutes from './routes/widget.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.env === 'development' ? 'debug' : 'info',
      transport: config.env === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } : undefined
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
    bodyLimit: 10485760, // 10MB
  });

  // Register plugins
  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  // Rate limiting
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '15 minutes',
  });

  // Connect to databases
  try {
    await connectDatabases();
    app.log.info('Database connections established');
  } catch (error) {
    app.log.error({ err: error }, 'Failed to connect to databases');
    throw error;
  }

  // Register routes
  await app.register(healthRoutes);
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(metricsRoutes, { prefix: '/api/metrics' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboards' });
  await app.register(alertsRoutes, { prefix: '/api/alerts' });
  await app.register(reportsRoutes, { prefix: '/api/reports' });
  await app.register(exportRoutes, { prefix: '/api/exports' });
  await app.register(customerRoutes, { prefix: '/api/customers' });
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });
  await app.register(insightsRoutes, { prefix: '/api/insights' });
  await app.register(predictionRoutes, { prefix: '/api/predictions' });
  await app.register(realtimeRoutes, { prefix: '/api/realtime' });
  await app.register(widgetRoutes, { prefix: '/api/widgets' });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    reply.status(statusCode).send({
      error: {
        message,
        statusCode,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  });

  return app;
}
