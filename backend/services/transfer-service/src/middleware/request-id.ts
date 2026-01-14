/**
 * Request ID Middleware for Transfer Service
 * 
 * AUDIT FIX LOG-M3: No correlation ID propagation → Added request ID tracking
 * 
 * Features:
 * - Generate unique request IDs for tracing
 * - Propagate incoming X-Request-ID headers
 * - Add request ID to response headers
 */

import { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

// Extend FastifyRequest to include requestId
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Generate a new request ID
 */
function generateRequestId(): string {
  return randomUUID();
}

/**
 * Request ID plugin
 */
const requestIdPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  // Add request ID to every request
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check for existing request ID in headers
    const existingRequestId = 
      request.headers[REQUEST_ID_HEADER] as string ||
      request.headers[CORRELATION_ID_HEADER] as string;
    
    // Use existing or generate new
    const requestId = existingRequestId || generateRequestId();
    
    // Attach to request
    request.requestId = requestId;
    (request as any).id = requestId; // For Fastify's built-in logging
    
    // Add to response headers
    reply.header(REQUEST_ID_HEADER, requestId);
  });

  done();
};

export const requestIdMiddleware = fp(requestIdPlugin, {
  name: 'request-id',
  fastify: '4.x'
});

export default requestIdMiddleware;
export { generateRequestId, REQUEST_ID_HEADER, CORRELATION_ID_HEADER };
