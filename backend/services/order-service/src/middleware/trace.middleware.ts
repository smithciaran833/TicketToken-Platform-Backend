import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

/**
 * LOW: Trace ID middleware for distributed tracing
 * Propagates X-Trace-ID header across service calls
 */

const TRACE_ID_HEADER = 'x-trace-id';
const REQUEST_ID_HEADER = 'x-request-id';
const SPAN_ID_HEADER = 'x-span-id';
const PARENT_SPAN_HEADER = 'x-parent-span-id';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  requestId: string;
}

/**
 * Extract or generate trace context from request headers
 */
export function extractTraceContext(request: FastifyRequest): TraceContext {
  // Use existing trace ID or generate new one
  const traceId = (request.headers[TRACE_ID_HEADER] as string) || uuidv4();
  
  // Generate new span ID for this service
  const spanId = uuidv4().slice(0, 16);
  
  // Parent span is the incoming span ID (if any)
  const parentSpanId = request.headers[SPAN_ID_HEADER] as string | undefined;
  
  // Request ID from header or Fastify's generated ID
  const requestId = (request.headers[REQUEST_ID_HEADER] as string) || request.id;

  return {
    traceId,
    spanId,
    parentSpanId,
    requestId,
  };
}

/**
 * Trace middleware - adds trace context to request and response
 */
export function traceMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const traceContext = extractTraceContext(request);

  // Attach to request for use in handlers and downstream calls
  (request as any).traceContext = traceContext;

  // Also attach individual properties for convenience
  (request as any).traceId = traceContext.traceId;
  (request as any).spanId = traceContext.spanId;

  // Set response headers for tracing
  reply.header(TRACE_ID_HEADER, traceContext.traceId);
  reply.header(REQUEST_ID_HEADER, traceContext.requestId);
  reply.header(SPAN_ID_HEADER, traceContext.spanId);

  // Log trace info
  logger.debug('Request trace context', {
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    parentSpanId: traceContext.parentSpanId,
    requestId: traceContext.requestId,
    path: request.url,
    method: request.method,
  });

  done();
}

/**
 * Get headers to propagate to downstream services
 */
export function getTracePropagationHeaders(request: FastifyRequest): Record<string, string> {
  const traceContext = (request as any).traceContext as TraceContext | undefined;

  if (!traceContext) {
    // Generate new context if not present
    const newTraceId = uuidv4();
    return {
      [TRACE_ID_HEADER]: newTraceId,
      [SPAN_ID_HEADER]: uuidv4().slice(0, 16),
      [REQUEST_ID_HEADER]: request.id,
    };
  }

  return {
    [TRACE_ID_HEADER]: traceContext.traceId,
    [SPAN_ID_HEADER]: uuidv4().slice(0, 16), // New span for downstream
    [PARENT_SPAN_HEADER]: traceContext.spanId, // Current span becomes parent
    [REQUEST_ID_HEADER]: traceContext.requestId,
  };
}
