import crypto from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';

// Request ID header name
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Middleware to ensure every request has a unique ID for tracing
 * - Uses existing x-request-id header if provided
 * - Generates a new UUID if not provided
 * - Includes request ID in response headers
 * - Makes request ID available throughout the request lifecycle
 */
export function registerRequestIdMiddleware(app: FastifyInstance): void {
  // Add request ID on every incoming request
  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    // Use existing request ID from header or generate new one
    const existingId = request.headers[REQUEST_ID_HEADER] as string | undefined;
    const requestId = existingId || crypto.randomUUID();
    
    // Store on request object for use throughout the request
    request.id = requestId;
    
    // Include in response headers for client correlation
    reply.header(REQUEST_ID_HEADER, requestId);
    
    done();
  });

  // Log request start with ID
  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    logger.info('Incoming request', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });
    done();
  });

  // Log request completion with timing
  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done) => {
    const responseTime = reply.elapsedTime;
    
    logger.info('Request completed', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime?.toFixed(2) || 0}ms`
    });
    done();
  });

  logger.info('Request ID middleware registered');
}

/**
 * Helper to get request ID from current request
 * Useful for logging in deep service calls
 */
export function getRequestId(request: FastifyRequest): string {
  return request.id || 'unknown';
}

// Extend Fastify types to include our properties
declare module 'fastify' {
  interface FastifyRequest {
    id: string;
  }
}
