import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import csrf from '@fastify/csrf-protection';
import rateLimit from '@fastify/rate-limit';
import { createDependencyContainer } from './config/dependencies';
import { authRoutes } from './routes/auth.routes';
import { env } from './config/env';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? {
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
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // CSRF Protection
  await app.register(csrf, {
    cookieOpts: {
      signed: true,
      sameSite: 'strict',
      httpOnly: true,
      secure: env.NODE_ENV === 'production'
    }
  });

  // Rate limiting
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '15 minutes',
  });

  // Create and attach dependency container
  const container = createDependencyContainer();
  app.decorate('container', container);

  // Health check
  app.get('/health', async () => {
    return {
      status: 'healthy',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
    };
  });

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    const { register } = await import('./utils/metrics');
    reply.type(register.contentType);
    return register.metrics();
  });

  // Register auth routes
  await app.register(authRoutes, {
    prefix: '/auth',
    container
  });

  // Global error handler
  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error);

    // CSRF token errors
    if (error.code === 'FST_CSRF_INVALID_TOKEN' || error.code === 'FST_CSRF_MISSING_TOKEN') {
      return reply.status(403).send({
        error: 'Invalid or missing CSRF token',
        code: 'CSRF_ERROR'
      });
    }

    // Rate limiting
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'Too many requests. Please try again later.',
      });
    }

    // Map error messages to status codes
    const errorMessage = error.message || '';

    // 422 Unprocessable Entity - validation errors from our ValidationError class
    if (error.statusCode === 422) {
      return reply.status(422).send({
        error: error.message,
        ...(error.errors && { errors: error.errors })
      });
    }

    // 409 Conflict - duplicate resources
    if (errorMessage.includes('already registered') || errorMessage.includes('already exists')) {
      return reply.status(409).send({
        error: error.message
      });
    }

    // 401 Unauthorized - authentication failures
    if (errorMessage.includes('Invalid credentials') ||
        errorMessage.includes('Invalid password') ||
        errorMessage.includes('Invalid refresh token') ||
        error.statusCode === 401) {
      return reply.status(401).send({
        error: error.message || 'Unauthorized',
      });
    }

    // 400 Bad Request - validation errors (includes errors array with field details)
    if (error.statusCode === 400) {
      // If we have validation errors array with details, use the detailed message
      if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
        // Use the first error message which should contain field info
        const firstError = error.errors[0];
        const errorText = typeof firstError === 'string' ? firstError : 
                         firstError.message || error.message;
        return reply.status(400).send({
          error: errorText,
          ...(error.errors && { errors: error.errors })
        });
      }
      return reply.status(400).send({
        error: error.message,
      });
    }

    // 400 Bad Request - Fastify validation
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation error',
        details: error.validation,
      });
    }

    // Default 500
    return reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal server error',
    });
  });

  return app;
}
