import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { AwilixContainer } from 'awilix';
import { logger } from '../utils/logger';
import { httpRequestDuration, httpRequestTotal, register } from '../utils/metrics';
import fs from 'fs';
import path from 'path';

// Import route handlers
import { venueRoutes } from '../controllers/venues.controller';
import healthRoutes from '../routes/health.routes';
import internalValidationRoutes from '../routes/internal-validation.routes';
import { brandingRoutes } from '../routes/branding.routes';
import { domainRoutes } from '../routes/domain.routes';

// Load RSA public key for JWT verification
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ||
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let publicKey: string;
try {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  logger.info('✓ JWT RS256 public key loaded successfully');
} catch (error) {
  logger.error('✗ Failed to load JWT public key:', error);
  throw new Error('JWT public key not found at: ' + publicKeyPath);
}

export async function configureFastify(
  fastify: FastifyInstance,
  container: AwilixContainer
) {
  // Container is already decorated in app.ts, so we don't need to do it here

  // Metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // Metrics collection
  fastify.addHook('onRequest', async (request, _reply) => {
    request.startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = (Date.now() - (request.startTime || Date.now())) / 1000;
    const labels = {
      method: request.method,
      route: request.routerPath || request.url,
      status_code: reply.statusCode.toString()
    };

    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: (origin, cb) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://api-gateway:3000',
        process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
  });

  // Rate limiting - DISABLED FOR TESTS
  if (true) { // Rate limiting enabled for tests
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      keyGenerator: (request): string => {
        const apiKey = request.headers['x-api-key'] as string;
        const venueId = request.headers['x-venue-id'] as string;
        return apiKey || venueId || request.ip;
      },
    });
  } else {
    logger.info('Rate limiting disabled in test environment');
  }

  // JWT - RS256 with public key verification
  await fastify.register(jwt, {
    secret: {
      public: publicKey,
    },
    verify: {
      algorithms: ['RS256'],
    },
  });

  // Request ID and context
  fastify.addHook('onRequest', async (request, reply) => {
    request.id = request.headers['x-request-id']?.toString() ||
                 require('crypto').randomUUID();
    reply.header('X-Request-ID', request.id);
  });

  // API Documentation
  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Venue Service API',
          description: 'TicketToken Venue Management Service',
          version: '1.0.0',
        },
        host: '0.0.0.0',
        schemes: ['http'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'venues', description: 'Venue management endpoints' },
          { name: 'settings', description: 'Venue settings endpoints' },
          { name: 'integrations', description: 'Third-party integrations' },
          { name: 'compliance', description: 'Compliance and regulatory' },
          { name: 'analytics', description: 'Analytics and reporting' },
          { name: 'branding', description: 'White-label branding' },
          { name: 'health', description: 'Health check endpoints' },
        ],
        securityDefinitions: {
          bearerAuth: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header'
          }
        }
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/documentation',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });
  }

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({
      err: error,
      request: {
        id: request.id,
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
      },
    }, 'Request error');

    if (error.validation) {
      return reply.status(422).send({
        error: 'Validation failed',
        message: error.message,
        details: error.validation,
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
      });
    }

    return reply.status(500).send({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  });

  // Register routes
  await fastify.register(internalValidationRoutes, { prefix: '/' });
  await fastify.register(venueRoutes, { prefix: '/api/v1/venues' });
  await fastify.register(brandingRoutes, { prefix: '/api/v1/branding' });
  await fastify.register(domainRoutes, { prefix: '/api/v1/domains' });
  await fastify.register(healthRoutes, { prefix: '/' });
}
