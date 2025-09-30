import { Request, Response, NextFunction } from 'express';
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
  'user-agent'
];

// Additional headers for debugging
const DEBUG_HEADERS = [
  'x-debug-mode',
  'x-force-error',
  'x-slow-query',
  'x-bypass-cache'
];

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
function extractHeaders(req: Request): Map<string, string> {
  const headers = new Map<string, string>();
  
  for (const header of [...PROPAGATED_HEADERS, ...DEBUG_HEADERS]) {
    const value = req.headers[header];
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
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract or generate IDs
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const traceId = (req.headers['x-trace-id'] as string) || requestId;
    const parentSpanId = req.headers['x-parent-span-id'] as string;
    const spanId = generateSpanId();
    const correlationId = (req.headers['x-correlation-id'] as string) || traceId;
    
    // Extract user context
    const tenantId = (req as any).user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = (req as any).user?.id || req.headers['x-user-id'] as string;
    const sessionId = req.headers['x-session-id'] as string;
    const clientId = req.headers['x-client-id'] as string;
    
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
      headers: extractHeaders(req),
      startTime: Date.now(),
      path: req.path,
      method: req.method
    };
    
    // Store context in AsyncLocalStorage
    requestContext.run(context, () => {
      // Set response headers
      res.setHeader('x-request-id', requestId);
      res.setHeader('x-trace-id', traceId);
      res.setHeader('x-span-id', spanId);
      
      // Log request with context
      const logger = (req as any).logger;
      if (logger) {
        logger.child({
          requestId,
          traceId,
          spanId,
          parentSpanId,
          correlationId,
          tenantId,
          userId,
          service: serviceName
        });
      }
      
      // Add context to request object for backward compatibility
      (req as any).context = context;
      
      // Continue with request
      next();
    });
  };
}

/**
 * Create headers for outgoing requests
 */
export function getOutgoingHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
  const context = getRequestContext();
  
  if (!context) {
    return additionalHeaders || {};
  }
  
  const headers: Record<string, string> = {
    'x-request-id': context.requestId,
    'x-trace-id': context.traceId,
    'x-parent-span-id': context.spanId, // Current span becomes parent for next service
    'x-correlation-id': context.correlationId,
    ...additionalHeaders
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
 * Express middleware to log request completion
 */
export function requestLogging(logger: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = getRequestContext();
    
    if (!context) {
      return next();
    }
    
    // Log request start
    logger.info({
      type: 'request_start',
      ...context,
      headers: undefined // Don't log all headers
    });
    
    // Track response
    const originalSend = res.send;
    res.send = function(data: any) {
      const duration = Date.now() - context.startTime;
      
      logger.info({
        type: 'request_complete',
        requestId: context.requestId,
        traceId: context.traceId,
        spanId: context.spanId,
        duration,
        statusCode: res.statusCode,
        path: context.path,
        method: context.method
      });
      
      // Set duration header
      res.setHeader('x-response-time', `${duration}ms`);
      
      return originalSend.call(this, data);
    };
    
    next();
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
      parentSpanId: ''
    };
  }
  
  return {
    spanId: generateSpanId(),
    parentSpanId: context.spanId
  };
}
