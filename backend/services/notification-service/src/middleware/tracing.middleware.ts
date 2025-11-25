import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger';

// Trace context interface
interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

// Simple trace ID generator
function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function generateSpanId(): string {
  return `span_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Tracing middleware for Fastify
 * Extracts trace context from headers and adds to request
 */
export async function tracingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract trace context from headers (W3C Trace Context format)
  const traceParent = request.headers['traceparent'] as string;
  const traceState = request.headers['tracestate'] as string;
  
  let traceId: string;
  let parentSpanId: string | undefined;
  
  if (traceParent) {
    // Parse traceparent header: version-trace_id-parent_id-flags
    const parts = traceParent.split('-');
    if (parts.length === 4) {
      traceId = parts[1];
      parentSpanId = parts[2];
    } else {
      traceId = generateTraceId();
    }
  } else {
    // No incoming trace, create new trace ID
    traceId = generateTraceId();
  }
  
  // Generate span ID for this service's work
  const spanId = generateSpanId();
  
  // Attach trace context to request
  (request as any).traceContext = {
    traceId,
    spanId,
    parentSpanId,
    traceState
  };
  
  // Add trace context to logs
  logger.info('Request started', {
    traceId,
    spanId,
    parentSpanId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent']
  });
  
  // Add trace headers to response for downstream services
  reply.header('X-Trace-Id', traceId);
  reply.header('X-Span-Id', spanId);
}

/**
 * Create a span for a specific operation
 */
export class Span {
  private traceId: string;
  private spanId: string;
  private parentSpanId?: string;
  private operation: string;
  private startTime: number;
  private attributes: Record<string, any>;
  
  constructor(traceContext: TraceContext, operation: string, attributes: Record<string, any> = {}) {
    this.traceId = traceContext.traceId;
    this.parentSpanId = traceContext.spanId;
    this.spanId = generateSpanId();
    this.operation = operation;
    this.startTime = Date.now();
    this.attributes = attributes;
    
    logger.debug('Span started', {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      operation: this.operation,
      attributes: this.attributes
    });
  }
  
  /**
   * Add attribute to span
   */
  setAttribute(key: string, value: any): void {
    this.attributes[key] = value;
  }
  
  /**
   * Add multiple attributes to span
   */
  setAttributes(attributes: Record<string, any>): void {
    Object.assign(this.attributes, attributes);
  }
  
  /**
   * Record an event in the span
   */
  addEvent(name: string, attributes?: Record<string, any>): void {
    logger.debug('Span event', {
      traceId: this.traceId,
      spanId: this.spanId,
      event: name,
      attributes
    });
  }
  
  /**
   * Record an error in the span
   */
  recordError(error: Error): void {
    this.attributes.error = true;
    this.attributes.errorMessage = error.message;
    this.attributes.errorStack = error.stack;
    
    logger.error('Span error', {
      traceId: this.traceId,
      spanId: this.spanId,
      operation: this.operation,
      error: error.message,
      stack: error.stack
    });
  }
  
  /**
   * End the span
   */
  end(status: 'success' | 'error' = 'success'): void {
    const duration = Date.now() - this.startTime;
    
    this.attributes.status = status;
    this.attributes.duration_ms = duration;
    
    logger.debug('Span ended', {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      operation: this.operation,
      duration_ms: duration,
      status,
      attributes: this.attributes
    });
  }
  
  /**
   * Get trace context for propagation
   */
  getContext(): TraceContext {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId
    };
  }
}

/**
 * Helper to extract trace context from request
 */
export function getTraceContext(request: FastifyRequest): TraceContext | null {
  return (request as any).traceContext || null;
}

/**
 * Helper to create a span from request
 */
export function createSpan(
  request: FastifyRequest,
  operation: string,
  attributes?: Record<string, any>
): Span | null {
  const traceContext = getTraceContext(request);
  if (!traceContext) {
    return null;
  }
  
  return new Span(traceContext, operation, attributes);
}

/**
 * Helper to run an async operation with tracing
 */
export async function withSpan<T>(
  request: FastifyRequest,
  operation: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = createSpan(request, operation, attributes);
  
  if (!span) {
    // No trace context, just run the function
    return await fn(null as any);
  }
  
  try {
    const result = await fn(span);
    span.end('success');
    return result;
  } catch (error) {
    if (error instanceof Error) {
      span.recordError(error);
    }
    span.end('error');
    throw error;
  }
}
