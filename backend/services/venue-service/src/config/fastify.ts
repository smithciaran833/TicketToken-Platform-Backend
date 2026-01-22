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
import { getConfig } from './index';
import fs from 'fs';
import path from 'path';

// Import route handlers
import { venueRoutes } from '../controllers/venues.controller';
import healthRoutes from '../routes/health.routes';
import internalValidationRoutes from '../routes/internal-validation.routes';
import { brandingRoutes } from '../routes/branding.routes';
import { domainRoutes } from '../routes/domain.routes';

export async function configureFastify(
  fastify: FastifyInstance,
  container: AwilixContainer
) {
  const config = getConfig();

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
      status_category: Math.floor(reply.statusCode / 100) + 'xx'
    };

    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });

  // SECURITY FIX (SEC-R14): Security headers with HSTS
  await fastify.register(helmet, {
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS - use centralized config
  const allowedOrigins = config.security.corsOrigins;
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
  });

  // Rate limiting - skip in test environment
  if (process.env.DISABLE_RATE_LIMIT !== 'true') {
    await fastify.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.windowMs,
      keyGenerator: (request): string => {
        const apiKey = request.headers['x-api-key'] as string;
        const venueId = request.headers['x-venue-id'] as string;
        return apiKey || venueId || request.ip;
      },
    });
  }

  // JWT - RS256 with public key verification (load at runtime for test compatibility)
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ||
    path.join(process.env.HOME || '/tmp', 'tickettoken-secrets', 'jwt-public.pem');

  let publicKey: string;
  try {
    publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    logger.info('✓ JWT RS256 public key loaded successfully', { path: publicKeyPath });
  } catch (error) {
    logger.error('✗ Failed to load JWT public key:', { error, path: publicKeyPath });
    throw new Error('JWT public key not found at: ' + publicKeyPath);
  }

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

  // API Documentation - only in non-production
  if (!config.server.isProduction) {
    await fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Venue Service API',
          description: 'TicketToken Venue Management Service',
          version: config.server.serviceVersion,
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

  // Register routes
  await fastify.register(internalValidationRoutes, { prefix: '/' });
  await fastify.register(venueRoutes, { prefix: '/api/v1/venues' });
  await fastify.register(brandingRoutes, { prefix: '/api/v1/branding' });
  await fastify.register(domainRoutes, { prefix: '/api/v1/domains' });
  await fastify.register(healthRoutes, { prefix: '/' });
}
