import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

const CORRELATION_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

export async function correlationMiddleware(app: FastifyInstance): Promise<void> {
  // Add correlation ID to every request
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check for existing correlation ID from upstream services
    const existingCorrelationId = 
      request.headers[CORRELATION_HEADER] as string ||
      request.headers[REQUEST_ID_HEADER] as string ||
      request.id;

    // Use existing or generate new
    const correlationId = existingCorrelationId || crypto.randomUUID();
    
    // Attach to request object
    request.correlationId = correlationId;

    // Set response header for tracing
    reply.header(CORRELATION_HEADER, correlationId);
    reply.header(REQUEST_ID_HEADER, correlationId);
  });

  // Log with correlation ID
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    request.log.info({
      correlationId: request.correlationId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'Request completed');
  });
}

// Helper to get correlation ID for outbound requests
export function getCorrelationHeaders(request: FastifyRequest): Record<string, string> {
  return {
    [CORRELATION_HEADER]: request.correlationId,
    [REQUEST_ID_HEADER]: request.correlationId,
  };
}
