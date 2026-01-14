/**
 * Request ID Middleware for Notification Service
 * 
 * AUDIT FIX:
 * - ERR-H2: No correlation ID in responses → Generate and propagate X-Request-ID
 * 
 * Features:
 * - Generates UUID v4 request IDs
 * - Accepts existing X-Request-ID from upstream
 * - Adds to response headers
 * - Integrates with logger
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// FASTIFY REQUEST EXTENSION
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * AUDIT FIX ERR-H2: Generate and propagate request IDs
 */
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Accept existing request ID from headers (for tracing across services)
  const existingId = request.headers['x-request-id'] || 
                     request.headers['x-correlation-id'] ||
                     request.headers['traceparent'];
  
  // Use existing or generate new
  const requestId = typeof existingId === 'string' && existingId.length > 0
    ? existingId
    : uuidv4();
  
  // Attach to request
  request.requestId = requestId;
  (request as any).id = requestId; // Also set Fastify's built-in id
  
  // Add to response headers
  reply.header('X-Request-ID', requestId);
  reply.header('X-Correlation-ID', requestId);
}

/**
 * Get request ID from current request
 */
export function getRequestId(request: FastifyRequest): string {
  return request.requestId || (request as any).id || uuidv4();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  requestIdMiddleware,
  getRequestId
};
