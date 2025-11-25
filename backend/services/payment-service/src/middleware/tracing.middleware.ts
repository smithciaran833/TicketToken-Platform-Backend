/**
 * OpenTelemetry Tracing Middleware
 * Distributed tracing for payment service requests
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { SafeLogger } from '../utils/pci-log-scrubber.util';

const logger = new SafeLogger('TracingMiddleware');

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  attributes: Record<string, any>;
}

/**
 * Generate trace ID
 */
function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate span ID
 */
function generateSpanId(): string {
  return Math.random().toString(36).substr(2, 16);
}

/**
 * Extract trace context from headers
 */
function extractTraceContext(request: FastifyRequest): Partial<TraceContext> {
  // Support W3C Trace Context standard
  const traceparent = request.headers['traceparent'] as string;
  
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length === 4) {
      return {
        traceId: parts[1],
        parentSpanId: parts[2],
      };
    }
  }

  // Fallback to custom headers
  return {
    traceId: request.headers['x-trace-id'] as string,
    parentSpanId: request.headers['x-parent-span-id'] as string,
  };
}

/**
 * Create trace context for request
 */
function createTraceContext(request: FastifyRequest): TraceContext {
  const extracted = extractTraceContext(request);
  
  return {
    traceId: extracted.traceId || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: extracted.parentSpanId,
    startTime: Date.now(),
    attributes: {
      'http.method': request.method,
      'http.url': request.url,
      'http.route': request.routerPath,
      'http.user_agent': request.headers['user-agent'],
      'http.request_id': request.headers['x-request-id'],
      'service.name': 'payment-service',
    },
  };
}

/**
 * Tracing middleware
 */
export function tracingMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const traceContext = createTraceContext(request);
    
    // Attach trace context to request
    (request as any).traceContext = traceContext;
    
    // Add trace headers to response
    reply.header('x-trace-id', traceContext.traceId);
    reply.header('x-span-id', traceContext.spanId);
    
    // Log request start
    logger.info('Request started', {
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      method: request.method,
      url: request.url,
    });
    
    // Hook into response to capture completion
    reply.raw.on('finish', () => {
      const duration = Date.now() - traceContext.startTime;
      
      // Add response attributes
      traceContext.attributes['http.status_code'] = reply.statusCode;
      traceContext.attributes['http.duration_ms'] = duration;
      
      // Log request completion
      logger.info('Request completed', {
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        statusCode: reply.statusCode,
        durationMs: duration,
      });
      
      // Export span (in production, this would go to OTel collector)
      exportSpan(traceContext, reply.statusCode, duration);
    });
  };
}

/**
 * Export span to tracing backend
 * In production, this would send to OpenTelemetry collector
 */
function exportSpan(context: TraceContext, statusCode: number, duration: number): void {
  const span = {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    name: `${context.attributes['http.method']} ${context.attributes['http.route'] || context.attributes['http.url']}`,
    kind: 'SERVER',
    startTime: context.startTime,
    endTime: context.startTime + duration,
    duration,
    attributes: {
      ...context.attributes,
      'http.status_code': statusCode,
    },
    status: {
      code: statusCode >= 400 ? 'ERROR' : 'OK',
    },
  };
  
  // In production, send to OTel collector
  // For now, just log at debug level
  logger.debug('Span exported', span);
}

/**
 * Create child span for internal operations
 */
export function createChildSpan(
  request: FastifyRequest,
  spanName: string,
  attributes?: Record<string, any>
): TraceContext {
  const parentContext = (request as any).traceContext as TraceContext;
  
  if (!parentContext) {
    logger.warn('No parent trace context found');
    return createTraceContext(request);
  }
  
  return {
    traceId: parentContext.traceId,
    spanId: generateSpanId(),
    parentSpanId: parentContext.spanId,
    startTime: Date.now(),
    attributes: {
      ...attributes,
      'span.name': spanName,
      'service.name': 'payment-service',
    },
  };
}

/**
 * End child span
 */
export function endChildSpan(
  context: TraceContext,
  status: 'OK' | 'ERROR' = 'OK',
  error?: Error
): void {
  const duration = Date.now() - context.startTime;
  
  const span = {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    name: context.attributes['span.name'],
    kind: 'INTERNAL',
    startTime: context.startTime,
    endTime: context.startTime + duration,
    duration,
    attributes: context.attributes,
    status: {
      code: status,
      message: error?.message,
    },
  };
  
  logger.debug('Child span ended', span);
  exportSpan(context, status === 'ERROR' ? 500 : 200, duration);
}

/**
 * Decorator to trace method execution
 */
export function Trace(spanName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = spanName || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      // Try to get request from args (if available)
      const request = args.find((arg) => arg && arg.traceContext);
      
      if (!request) {
        // No tracing context available, just execute
        return originalMethod.apply(this, args);
      }
      
      const context = createChildSpan(request, name, {
        'code.function': propertyKey,
        'code.namespace': target.constructor.name,
      });
      
      try {
        const result = await originalMethod.apply(this, args);
        endChildSpan(context, 'OK');
        return result;
      } catch (error) {
        endChildSpan(context, 'ERROR', error as Error);
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Trace async operation
 */
export async function traceAsyncOperation<T>(
  request: FastifyRequest,
  operationName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const context = createChildSpan(request, operationName, attributes);
  
  try {
    const result = await fn();
    endChildSpan(context, 'OK');
    return result;
  } catch (error) {
    endChildSpan(context, 'ERROR', error as Error);
    throw error;
  }
}
