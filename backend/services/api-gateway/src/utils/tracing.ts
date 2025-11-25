import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import type { FastifyRequest } from 'fastify';
import { trace, SpanStatusCode, context, Span } from '@opentelemetry/api';

const serviceName = 'api-gateway';
const serviceVersion = process.env.npm_package_version || '1.0.0';
const environment = process.env.NODE_ENV || 'development';

const otlpExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

export const sdk = new NodeSDK({
  spanProcessor: new BatchSpanProcessor(otlpExporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
    new FastifyInstrumentation({
      requestHook: (span, info) => {
        const req = info.request as FastifyRequest;
        const route = req.routeOptions?.url || req.raw.url || 'unknown';
        span.setAttribute('http.route', route);
        span.setAttribute('http.tenant_id', (req as any).tenantId || 'unknown');
      },
    }),
    new HttpInstrumentation({
      requestHook: (span) => {
        span.setAttribute('http.downstream', true);
      },
      responseHook: (span, response) => {
        const statusCode = response.statusCode;
        if (statusCode && statusCode >= 400) {
          span.setAttribute('http.error', true);
        }
      },
    }),
    new RedisInstrumentation({
      requireParentSpan: true,
    }),
  ],
});

export function initializeTracing(): void {
  try {
    sdk.start();
    console.log('✅ OpenTelemetry tracing initialized');
    console.log(`   Service: ${serviceName}`);
    console.log(`   Version: ${serviceVersion}`);
    console.log(`   Environment: ${environment}`);
  } catch (error) {
    console.error('❌ Failed to initialize OpenTelemetry tracing:', error);
  }
}

export async function shutdownTracing(): Promise<void> {
  try {
    await sdk.shutdown();
    console.log('✅ OpenTelemetry tracing shut down gracefully');
  } catch (error) {
    console.error('❌ Error shutting down OpenTelemetry tracing:', error);
  }
}

const tracer = trace.getTracer(serviceName, serviceVersion);

export function createSpan(name: string, attributes?: Record<string, any>): Span {
  return tracer.startSpan(name, { attributes });
}

export async function traceAsync<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = createSpan(spanName, attributes);
  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    throw error;
  } finally {
    span.end();
  }
}

export { trace, context, SpanStatusCode };
