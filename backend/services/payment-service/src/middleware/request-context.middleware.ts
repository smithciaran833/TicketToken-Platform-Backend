/**
 * Request Context Middleware
 * 
 * HIGH FIX: Implements request context propagation with:
 * - Trace ID generation/extraction
 * - Request ID generation
 * - Context propagation via AsyncLocalStorage
 * - Correlation ID support
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RequestContext' });

// =============================================================================
// TYPES
// =============================================================================

export interface RequestContext {
  requestId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  tenantId?: string;
  userId?: string;
  correlationId?: string;
  startTime: number;
  path: string;
  method: string;
  clientIp?: string;
  userAgent?: string;
}

// =============================================================================
// ASYNC LOCAL STORAGE
// =============================================================================

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get the current trace ID
 */
export function getTraceId(): string | undefined {
  return getRequestContext()?.traceId;
}

/**
 * Get the current request ID
 */
export function getRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}

/**
 * Run a function with a specific context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

// =============================================================================
// TRACE ID PARSING
// =============================================================================

/**
 * Parse trace context from headers
 * Supports W3C Trace Context, X-Trace-ID, and X-Request-ID
 */
function parseTraceContext(request: FastifyRequest): {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
} {
  // W3C Trace Context (traceparent header)
  // Format: version-traceId-parentId-flags
  // Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
  const traceparent = request.headers['traceparent'] as string;
  
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length === 4) {
      return {
        traceId: parts[1],
        spanId: generateSpanId(),
        parentSpanId: parts[2],
      };
    }
  }

  // X-Trace-ID or X-Request-ID header
  const xTraceId = request.headers['x-trace-id'] as string;
  const xRequestId = request.headers['x-request-id'] as string;

  // B3 Trace Context (common in Zipkin)
  const b3TraceId = request.headers['x-b3-traceid'] as string;
  const b3SpanId = request.headers['x-b3-spanid'] as string;
  const b3ParentSpanId = request.headers['x-b3-parentspanid'] as string;

  if (b3TraceId) {
    return {
      traceId: b3TraceId,
      spanId: generateSpanId(),
      parentSpanId: b3SpanId || b3ParentSpanId,
    };
  }

  // Generate new trace ID if none provided
  return {
    traceId: xTraceId || xRequestId || generateTraceId(),
    spanId: generateSpanId(),
  };
}

/**
 * Generate a W3C-compatible trace ID (32 hex chars)
 */
function generateTraceId(): string {
  return uuidv4().replace(/-/g, '');
}

/**
 * Generate a span ID (16 hex chars)
 */
function generateSpanId(): string {
  return uuidv4().replace(/-/g, '').substring(0, 16);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Request context middleware
 */
export function requestContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  const { traceId, spanId, parentSpanId } = parseTraceContext(request);
  
  const context: RequestContext = {
    requestId: uuidv4(),
    traceId,
    spanId,
    parentSpanId,
    tenantId: (request as any).tenantId,
    userId: (request as any).userId,
    correlationId: request.headers['x-correlation-id'] as string,
    startTime: Date.now(),
    path: request.url,
    method: request.method,
    clientIp: request.ip,
    userAgent: request.headers['user-agent'],
  };

  // Attach context to request for easy access
  (request as any).context = context;
  (request as any).traceId = traceId;
  (request as any).requestId = context.requestId;

  // Add trace headers to response
  reply.header('X-Request-ID', context.requestId);
  reply.header('X-Trace-ID', traceId);
  
  // W3C traceparent response
  reply.header('traceparent', `00-${traceId}-${spanId}-01`);

  // Run the rest of the request in the context
  asyncLocalStorage.run(context, () => {
    done();
  });
}

/**
 * Register request context hooks on Fastify instance
 */
export function registerRequestContext(fastify: FastifyInstance): void {
  // Add context to every request
  fastify.addHook('onRequest', requestContextMiddleware);

  // Log request completion with timing
  fastify.addHook('onResponse', (request, reply, done) => {
    const context = (request as any).context as RequestContext | undefined;
    
    if (context) {
      const duration = Date.now() - context.startTime;
      
      log.info({
        requestId: context.requestId,
        traceId: context.traceId,
        method: context.method,
        path: context.path,
        statusCode: reply.statusCode,
        durationMs: duration,
        tenantId: context.tenantId,
      }, 'Request completed');
    }
    
    done();
  });

  log.info('Request context middleware registered');
}

// =============================================================================
// CONTEXT-AWARE LOGGING
// =============================================================================

/**
 * Create a logger that includes request context
 */
export function createContextLogger(component: string) {
  const baseLogger = logger.child({ component });

  return {
    info: (obj: object, msg: string) => {
      const context = getRequestContext();
      baseLogger.info({ ...obj, traceId: context?.traceId, requestId: context?.requestId }, msg);
    },
    warn: (obj: object, msg: string) => {
      const context = getRequestContext();
      baseLogger.warn({ ...obj, traceId: context?.traceId, requestId: context?.requestId }, msg);
    },
    error: (obj: object, msg: string) => {
      const context = getRequestContext();
      baseLogger.error({ ...obj, traceId: context?.traceId, requestId: context?.requestId }, msg);
    },
    debug: (obj: object, msg: string) => {
      const context = getRequestContext();
      baseLogger.debug({ ...obj, traceId: context?.traceId, requestId: context?.requestId }, msg);
    },
  };
}

// =============================================================================
// CONTEXT PROPAGATION FOR OUTGOING REQUESTS
// =============================================================================

/**
 * Get headers for outgoing requests that propagate trace context
 */
export function getTracePropagationHeaders(): Record<string, string> {
  const context = getRequestContext();
  
  if (!context) {
    return {};
  }

  return {
    'traceparent': `00-${context.traceId}-${context.spanId}-01`,
    'x-trace-id': context.traceId,
    'x-request-id': context.requestId,
    'x-correlation-id': context.correlationId || context.requestId,
    // B3 format for compatibility
    'x-b3-traceid': context.traceId,
    'x-b3-spanid': context.spanId,
    ...(context.parentSpanId && { 'x-b3-parentspanid': context.parentSpanId }),
  };
}

/**
 * Get headers including tenant context for service-to-service calls
 */
export function getServiceCallHeaders(): Record<string, string> {
  const context = getRequestContext();
  
  return {
    ...getTracePropagationHeaders(),
    ...(context?.tenantId && { 'x-tenant-id': context.tenantId }),
    ...(context?.userId && { 'x-user-id': context.userId }),
  };
}
