/**
 * Correlation ID Middleware
 * 
 * AUDIT FIXES:
 * - ERR-5: No correlation ID → Request tracing across services
 * - LOG-2: No correlation ID middleware → Propagation to logs
 * - LOG-6: No request ID generation → UUID generation for each request
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';

// =============================================================================
// Constants
// =============================================================================

const CORRELATION_ID_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

// =============================================================================
// Types
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

// =============================================================================
// Middleware Implementation
// =============================================================================

async function correlationIdPlugin(fastify: FastifyInstance): Promise<void> {
  // Add correlation ID to every request
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract correlation ID from incoming header or generate new one
    const incomingCorrelationId = request.headers[CORRELATION_ID_HEADER] as string | undefined;
    const correlationId = incomingCorrelationId || crypto.randomUUID();
    
    // Store on request object for access in handlers
    request.correlationId = correlationId;
    
    // Set on reply headers for propagation
    reply.header(CORRELATION_ID_HEADER, correlationId);
    reply.header(REQUEST_ID_HEADER, request.id);
  });

  // Ensure correlation ID is in response headers
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!reply.getHeader(CORRELATION_ID_HEADER)) {
      reply.header(CORRELATION_ID_HEADER, request.correlationId);
    }
  });

  fastify.log.info('Correlation ID middleware registered');
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get correlation ID from request
 */
export function getCorrelationId(request: FastifyRequest): string {
  return request.correlationId || request.headers[CORRELATION_ID_HEADER] as string || 'unknown';
}

/**
 * Create headers for outgoing requests with correlation ID
 */
export function createTracingHeaders(request: FastifyRequest): Record<string, string> {
  return {
    [CORRELATION_ID_HEADER]: request.correlationId,
    [REQUEST_ID_HEADER]: request.id as string,
  };
}

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

// =============================================================================
// Export
// =============================================================================

export default fp(correlationIdPlugin, {
  name: 'correlation-id',
  fastify: '4.x',
});

export { correlationIdPlugin, CORRELATION_ID_HEADER, REQUEST_ID_HEADER };
