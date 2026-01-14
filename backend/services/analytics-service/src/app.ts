/**
 * Fastify Application Setup
 * 
 * AUDIT FIX: ERR-4 - RFC 7807 compliant error handling
 */

import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { connectDatabases } from './config/database';
import { 
  AppError, 
  BadRequestError, 
  UnauthorizedError, 
  ForbiddenError, 
  NotFoundError,
  TooManyRequestsError,
  InternalServerError,
  toRFC7807Response 
} from './errors';

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
  await healthRoutes.registerHealthRoutes(app);
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

  // =============================================================================
  // AUDIT FIX: ERR-4 - RFC 7807 Compliant Global Error Handler
  // =============================================================================
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    const requestId = request.id || request.headers['x-request-id'] as string;
    
    // Log error with context (but not in response)
    app.log.error({
      err: error,
      requestId,
      method: request.method,
      url: request.url,
      // Don't log request body in production - may contain PII
      ...(config.env === 'development' && { body: request.body }),
    }, 'Request error');

    // Handle AppError (our custom errors) - already RFC 7807 compliant
    if (error instanceof AppError) {
      const rfc7807Response = toRFC7807Response(error, request.url, requestId);
      return reply
        .status(error.statusCode)
        .header('Content-Type', 'application/problem+json')
        .send(rfc7807Response);
    }

    // Handle Fastify validation errors
    if ('validation' in error && error.validation) {
      const validationError = new BadRequestError(
        'Validation failed',
        'VALIDATION_ERROR',
        {
          errors: error.validation.map((v: any) => ({
            field: v.instancePath || v.dataPath || 'unknown',
            message: v.message,
            keyword: v.keyword,
          })),
        }
      );
      const rfc7807Response = toRFC7807Response(validationError, request.url, requestId);
      return reply
        .status(400)
        .header('Content-Type', 'application/problem+json')
        .send(rfc7807Response);
    }

    // Handle known HTTP errors from Fastify
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      let appError: AppError;
      
      switch (error.statusCode) {
        case 400:
          appError = new BadRequestError(error.message || 'Bad Request');
          break;
        case 401:
          appError = new UnauthorizedError(error.message || 'Unauthorized');
          break;
        case 403:
          appError = new ForbiddenError(error.message || 'Forbidden');
          break;
        case 404:
          appError = new NotFoundError(error.message || 'Not Found');
          break;
        case 429:
          appError = new TooManyRequestsError(error.message || 'Too Many Requests');
          break;
        default:
          if (error.statusCode >= 500) {
            // Don't expose internal error details in production
            appError = new InternalServerError(
              config.env === 'production' 
                ? 'An internal error occurred' 
                : error.message || 'Internal Server Error'
            );
          } else {
            appError = new BadRequestError(error.message || 'Request Error');
            appError.statusCode = error.statusCode;
          }
      }
      
      const rfc7807Response = toRFC7807Response(appError, request.url, requestId);
      return reply
        .status(appError.statusCode)
        .header('Content-Type', 'application/problem+json')
        .send(rfc7807Response);
    }

    // Handle unexpected errors - never expose internal details in production
    const internalError = new InternalServerError(
      config.env === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : error.message || 'Internal Server Error'
    );
    
    const rfc7807Response = toRFC7807Response(internalError, request.url, requestId);
    return reply
      .status(500)
      .header('Content-Type', 'application/problem+json')
      .send(rfc7807Response);
  });

  // Not Found handler for unmatched routes
  app.setNotFoundHandler((request, reply) => {
    const requestId = request.id || request.headers['x-request-id'] as string;
    const notFoundError = new NotFoundError(
      `Route ${request.method} ${request.url} not found`,
      'ROUTE_NOT_FOUND'
    );
    
    const rfc7807Response = toRFC7807Response(notFoundError, request.url, requestId);
    return reply
      .status(404)
      .header('Content-Type', 'application/problem+json')
      .send(rfc7807Response);
  });

  return app;
}
