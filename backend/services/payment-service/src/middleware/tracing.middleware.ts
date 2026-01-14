import { FastifyRequest, FastifyReply } from 'fastify';
import { SafeLogger } from '../utils/pci-log-scrubber.util';

const logger = new SafeLogger('TracingMiddleware');

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  attributes: Record<string, any>;
}

function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateSpanId(): string {
  return Math.random().toString(36).substr(2, 16);
}

function extractTraceContext(request: FastifyRequest): Partial<TraceContext> {
  const traceparent = request.headers['traceparent'] as string;
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length === 4) {
      return { traceId: parts[1], parentSpanId: parts[2] };
    }
  }
  return {
    traceId: request.headers['x-trace-id'] as string,
    parentSpanId: request.headers['x-parent-span-id'] as string,
  };
}

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

export function tracingMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const traceContext = createTraceContext(request);
    (request as any).traceContext = traceContext;

    reply.header('x-trace-id', traceContext.traceId);
    reply.header('x-span-id', traceContext.spanId);

    logger.info({
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      method: request.method,
      url: request.url,
    }, 'Request started');

    reply.raw.on('finish', () => {
      const duration = Date.now() - traceContext.startTime;
      traceContext.attributes['http.status_code'] = reply.statusCode;
      traceContext.attributes['http.duration_ms'] = duration;

      logger.info({
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        statusCode: reply.statusCode,
        durationMs: duration,
      }, 'Request completed');

      exportSpan(traceContext, reply.statusCode, duration);
    });
  };
}

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
    attributes: { ...context.attributes, 'http.status_code': statusCode },
    status: { code: statusCode >= 400 ? 'ERROR' : 'OK' },
  };
  logger.debug(span, 'Span exported');
}

export function createChildSpan(request: FastifyRequest, spanName: string, attributes?: Record<string, any>): TraceContext {
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
    attributes: { ...attributes, 'span.name': spanName, 'service.name': 'payment-service' },
  };
}

export function endChildSpan(context: TraceContext, status: 'OK' | 'ERROR' = 'OK', error?: Error): void {
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
    status: { code: status, message: error?.message },
  };
  logger.debug(span, 'Child span ended');
  exportSpan(context, status === 'ERROR' ? 500 : 200, duration);
}

export function Trace(spanName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const name = spanName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const request = args.find((arg) => arg && arg.traceContext);
      if (!request) return originalMethod.apply(this, args);

      const context = createChildSpan(request, name, { 'code.function': propertyKey, 'code.namespace': target.constructor.name });
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

export async function traceAsyncOperation<T>(request: FastifyRequest, operationName: string, fn: () => Promise<T>, attributes?: Record<string, any>): Promise<T> {
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
