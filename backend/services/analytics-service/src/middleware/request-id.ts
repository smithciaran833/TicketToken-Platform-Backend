/**
 * Request ID Middleware
 * AUDIT FIX: LOG-2,3 - Distributed tracing and correlation
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const TRACE_ID_HEADER = 'x-trace-id';

declare module 'fastify' {
  interface FastifyRequest {
    requestId?: string;
    correlationId?: string;
    traceId?: string;
  }
}

/**
 * Request ID middleware - generates or propagates request IDs
 */
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get or generate request ID
  const requestId = (request.headers[REQUEST_ID_HEADER] as string) || randomUUID();
  const correlationId = (request.headers[CORRELATION_ID_HEADER] as string) || requestId;
  const traceId = (request.headers[TRACE_ID_HEADER] as string) || randomUUID();

  // Attach to request
  request.requestId = requestId;
  request.correlationId = correlationId;
  request.traceId = traceId;

  // Add to response headers for tracing
  reply.header(REQUEST_ID_HEADER, requestId);
  reply.header(CORRELATION_ID_HEADER, correlationId);
  reply.header(TRACE_ID_HEADER, traceId);
}

export async function registerRequestId(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('requestId', null);
  fastify.decorateRequest('correlationId', null);
  fastify.decorateRequest('traceId', null);
  fastify.addHook('preHandler', requestIdMiddleware);
}

export default { requestIdMiddleware, registerRequestId };
