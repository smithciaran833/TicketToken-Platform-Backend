/**
 * Request ID Middleware
 * 
 * AUDIT FIX: SEC-7 - Request ID propagation
 * AUDIT FIX: S2S-8 - Correlation ID propagation to downstream services
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Request ID header names (standard and vendor-specific)
const REQUEST_ID_HEADERS = [
  'x-request-id',
  'x-correlation-id',
  'x-trace-id',
  'request-id'
] as const;

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    correlationId: string;
  }
}

/**
 * Extract request ID from incoming request headers
 * Falls back to generating a new UUID if not present
 */
function extractRequestId(request: FastifyRequest): string {
  for (const header of REQUEST_ID_HEADERS) {
    const value = request.headers[header];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return uuidv4();
}

/**
 * Register request ID middleware on Fastify instance
 * Sets request.requestId and request.correlationId
 * Adds X-Request-ID header to response
 */
export async function registerRequestId(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    
    // Set on request object for access in handlers
    request.requestId = requestId;
    request.correlationId = requestId;
    
    // Set response header for client correlation
    reply.header('X-Request-ID', requestId);
    reply.header('X-Correlation-ID', requestId);
  });
}

/**
 * Get headers to propagate correlation ID to downstream services
 * AUDIT FIX: S2S-8 - Ensure correlation ID is passed to internal services
 */
export function getCorrelationHeaders(requestId: string): Record<string, string> {
  return {
    'X-Request-ID': requestId,
    'X-Correlation-ID': requestId
  };
}

/**
 * Create child context with request ID for logging
 */
export function createRequestContext(requestId: string): Record<string, string> {
  return {
    requestId,
    correlationId: requestId
  };
}
