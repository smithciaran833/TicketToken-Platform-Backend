import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

// Context headers that should be propagated
const PROPAGATED_HEADERS = [
  'x-request-id',
  'x-trace-id',
  'x-span-id',
  'x-parent-span-id',
  'x-correlation-id',
  'x-tenant-id',
  'x-user-id',
  'x-session-id',
  'x-client-id',
  'x-forwarded-for',
  'x-real-ip',
  'x-originating-service',
  'x-api-version',
  'authorization',
  'user-agent',
];

// Additional headers for debugging
const DEBUG_HEADERS = ['x-debug-mode', 'x-force-error', 'x-slow-query', 'x-bypass-cache'];

export interface RequestContext {
  requestId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  correlationId: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  clientId?: string;
  service: string;
  headers: Map<string, string>;
  startTime: number;
  path: string;
  method: string;
}

// AsyncLocalStorage for request context
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Extract headers from incoming request
 */
function extractHeaders(request: FastifyRequest): Map<string, string> {
  const headers = new Map<string, string>();

  for (const header of [...PROPAGATED_HEADERS, ...DEBUG_HEADERS]) {
    const value = request.headers[header];
    if (value && typeof value === 'string') {
      headers.set(header, value);
    }
  }

  return headers;
}

/**
 * Generate new span ID
 */
function generateSpanId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Context propagation middleware
 */
export function contextPropagation(serviceName: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Extract or generate IDs
    const requestId = (request.headers['x-request-id'] as string) || uuidv4();
    const traceId = (request.headers['x-trace-id'] as string) || requestId;
    const parentSpanId = request.headers['x-parent-span-id'] as string;
    const spanId = generateSpanId();
    const correlationId = (request.headers['x-correlation-id'] as string) || traceId;

    // Extract user context
    const tenantId = (request as any).user?.tenantId || (request.headers['x-tenant-id'] as string);
    const userId = (request as any).user?.id || (request.headers['x-user-id'] as string);
    const sessionId = request.headers['x-session-id'] as string;
    const clientId = request.headers['x-client-id'] as string;

    // Build context
    const context: RequestContext = {
      requestId,
      traceId,
      spanId,
      parentSpanId,
      correlationId,
      tenantId,
      userId,
      sessionId,
      clientId,
      service: serviceName,
      headers: extractHeaders(request),
      startTime: Date.now(),
      path: request.url,
      method: request.method,
    };

    // Store context in AsyncLocalStorage
    requestContext.run(context, () => {
      // Set response headers
      reply.header('x-request-id', requestId);
      reply.header('x-trace-id', traceId);
      reply.header('x-span-id', spanId);

      // Log request with context
      const logger = request.log;
      if (logger) {
        logger.child({
          requestId,
          traceId,
          spanId,
          parentSpanId,
          correlationId,
          tenantId,
          userId,
          service: serviceName,
        });
      }

      // Add context to request object for backward compatibility
      (request as any).context = context;
    });
  };
}

/**
 * Create headers for outgoing requests
 */
export function getOutgoingHeaders(
  additionalHeaders?: Record<string, string>
): Record<string, string> {
  const context = getRequestContext();

  if (!context) {
    return additionalHeaders || {};
  }

  const headers: Record<string, string> = {
    'x-request-id': context.requestId,
    'x-trace-id': context.traceId,
    'x-parent-span-id': context.spanId, // Current span becomes parent for next service
    'x-correlation-id': context.correlationId,
    ...additionalHeaders,
  };

  // Add optional headers if present
  if (context.tenantId) headers['x-tenant-id'] = context.tenantId;
  if (context.userId) headers['x-user-id'] = context.userId;
  if (context.sessionId) headers['x-session-id'] = context.sessionId;
  if (context.clientId) headers['x-client-id'] = context.clientId;

  // Add any debug headers
  for (const [key, value] of context.headers.entries()) {
    if (DEBUG_HEADERS.includes(key)) {
      headers[key] = value;
    }
  }

  // Add originating service
  headers['x-originating-service'] = context.service;

  return headers;
}

/**
 * Fastify hook to log request completion
 */
export function requestLogging(logger: any) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const context = getRequestContext();

    if (!context) {
      return;
    }

    // Log request start
    logger.info({
      type: 'request_start',
      ...context,
      headers: undefined, // Don't log all headers
    });

    // Track response
    reply.raw.on('finish', () => {
      const duration = Date.now() - context.startTime;

      logger.info({
        type: 'request_complete',
        requestId: context.requestId,
        traceId: context.traceId,
        spanId: context.spanId,
        duration,
        statusCode: reply.statusCode,
        path: context.path,
        method: context.method,
      });

      // Set duration header
      reply.header('x-response-time', `${duration}ms`);
    });
  };
}

/**
 * Create a child span for async operations
 */
export function createChildSpan(name: string): { spanId: string; parentSpanId: string } {
  const context = getRequestContext();

  if (!context) {
    return {
      spanId: generateSpanId(),
      parentSpanId: '',
    };
  }

  return {
    spanId: generateSpanId(),
    parentSpanId: context.spanId,
  };
}
