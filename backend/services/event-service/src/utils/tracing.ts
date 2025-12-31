/**
 * OpenTelemetry Distributed Tracing Setup
 *
 * CRITICAL FIX for audit findings MT13, MT14, MT15:
 * - Distributed tracing with OpenTelemetry
 * - W3C Trace Context propagation
 * - Span creation and instrumentation
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SpanProcessor
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT
} from '@opentelemetry/semantic-conventions';
import { trace, context, SpanKind, SpanStatusCode, Span, Context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { FastifyRequest, FastifyReply } from 'fastify';

const SERVICE_NAME = 'event-service';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';

let tracerProvider: NodeTracerProvider | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry tracing
 */
export function initTracing(): void {
  if (isInitialized) {
    return;
  }

  // Build span processors based on environment
  const spanProcessors: SpanProcessor[] = [];
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (otlpEndpoint) {
    // Production: Send to OTLP collector (Jaeger, Zipkin, etc.)
    const otlpExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpExporter));
    console.log(`✓ OpenTelemetry: Tracing enabled, exporting to ${otlpEndpoint}`);
  } else if (process.env.NODE_ENV === 'development' && process.env.ENABLE_TRACE_LOGGING === 'true') {
    // Development: Log spans to console (optional)
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    console.log('✓ OpenTelemetry: Tracing enabled with console exporter');
  } else {
    console.log('✓ OpenTelemetry: Tracing initialized (no exporter configured)');
  }

  // Create resource with semantic conventions
  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  });

  // Create provider with span processors in constructor
  tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: spanProcessors.length > 0 ? spanProcessors : undefined,
  });

  // Register the provider globally
  tracerProvider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  isInitialized = true;
}

/**
 * Get the tracer instance
 */
export function getTracer() {
  if (!isInitialized) {
    initTracing();
  }
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

/**
 * Create a new span for an operation
 */
export function createSpan(
  name: string,
  kind: SpanKind = SpanKind.INTERNAL,
  parentContext?: Context
): Span {
  const tracer = getTracer();
  const ctx = parentContext || context.active();
  return tracer.startSpan(name, { kind }, ctx);
}

/**
 * Wrap an async function with tracing
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  } = {}
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: options.kind || SpanKind.INTERNAL,
    attributes: options.attributes,
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Extract trace context from incoming HTTP headers
 * Implements W3C Trace Context propagation (MT14)
 */
export function extractTraceContext(headers: Record<string, string | string[] | undefined>): Context {
  const propagator = new W3CTraceContextPropagator();

  // Normalize headers to lowercase with string values
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  return propagator.extract(
    context.active(),
    normalizedHeaders,
    {
      get: (carrier: Record<string, string>, key: string) => carrier[key],
      keys: (carrier: Record<string, string>) => Object.keys(carrier),
    }
  );
}

/**
 * Inject trace context into outgoing HTTP headers
 * Implements W3C Trace Context propagation (MT14)
 */
export function injectTraceContext(headers: Record<string, string>): void {
  const propagator = new W3CTraceContextPropagator();
  propagator.inject(
    context.active(),
    headers,
    {
      set: (carrier: Record<string, string>, key: string, value: string) => {
        carrier[key] = value;
      },
    }
  );
}

/**
 * Get current trace and span IDs for logging correlation
 */
export function getTraceIds(): { traceId: string; spanId: string } | null {
  const span = trace.getActiveSpan();
  if (!span) {
    return null;
  }

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Fastify hook for automatic request tracing
 */
export async function tracingHook(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const parentContext = extractTraceContext(request.headers as Record<string, string>);
  const tracer = getTracer();

  const span = tracer.startSpan(
    `${request.method} ${request.routeOptions?.url || request.url}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': request.method,
        'http.url': request.url,
        'http.route': request.routeOptions?.url || 'unknown',
        'http.user_agent': request.headers['user-agent'] || '',
        'tenant.id': (request as any).user?.tenant_id || 'unknown',
      },
    },
    parentContext
  );

  // Store span in request for later use
  (request as any).span = span;
  (request as any).traceContext = trace.setSpan(parentContext, span);
}

/**
 * Fastify hook to end span on response
 */
export async function tracingResponseHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const span = (request as any).span as Span | undefined;
  if (!span) {
    return;
  }

  span.setAttributes({
    'http.status_code': reply.statusCode,
  });

  if (reply.statusCode >= 400) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: `HTTP ${reply.statusCode}`,
    });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end();
}

/**
 * Create a child span for database operations
 */
export function createDbSpan(operation: string, table: string): Span {
  return createSpan(`db.${operation}`, SpanKind.CLIENT);
}

/**
 * Create a child span for external service calls
 */
export function createExternalCallSpan(service: string, operation: string): Span {
  const span = createSpan(`${service}.${operation}`, SpanKind.CLIENT);
  span.setAttribute('peer.service', service);
  return span;
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    isInitialized = false;
    tracerProvider = null;
    console.log('✓ OpenTelemetry: Tracing shutdown complete');
  }
}
