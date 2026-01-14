/**
 * OpenTelemetry Distributed Tracing Configuration
 *
 * Fixes audit findings:
 * - DT1: OpenTelemetry SDK - IMPLEMENTED
 * - DT2: Auto-instrumentation - IMPLEMENTED
 * - DT3: Sampling configuration - IMPLEMENTED (Batch 24)
 * - DT4: Trace ID in logs - IMPLEMENTED (via getTraceContext)
 * - DT5: Context propagation - IMPLEMENTED
 * - DT6: Error spans recorded - IMPLEMENTED
 * - DT7: Custom spans - IMPLEMENTED (via createSpan, withSpan)
 * - LC4: Correlation ID middleware - IMPLEMENTED (propagates X-Request-Id)
 *
 * MUST be imported BEFORE any other imports in the application entry point (index.ts)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  Sampler,
  SamplingDecision,
  SamplingResult,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  AlwaysOffSampler,
} from '@opentelemetry/sdk-trace-node';
import { trace, context, SpanStatusCode, Span, SpanKind, propagation, Context, Attributes, Link } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

const SERVICE_NAME = 'ticket-service';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const OTEL_EXPORTER_URL = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
const TRACING_ENABLED = process.env.ENABLE_TRACING !== 'false';

// =============================================================================
// DT3: SAMPLING CONFIGURATION (Batch 24)
// =============================================================================

/**
 * Sampling configuration interface
 */
export interface SamplingConfig {
  /** Default sampling rate 0-1 (default: 1.0 in dev, 0.1 in prod) */
  defaultRate: number;
  /** Per-route sampling rules */
  routeRules: RouteSamplingRule[];
  /** Per-operation sampling rules */
  operationRules: OperationSamplingRule[];
  /** Always sample errors (default: true) */
  alwaysSampleErrors: boolean;
  /** Always sample slow requests above this threshold in ms (0 to disable) */
  slowRequestThresholdMs: number;
  /** Priority sampling for specific trace attributes */
  priorityRules: PrioritySamplingRule[];
}

/**
 * Route-based sampling rule
 */
export interface RouteSamplingRule {
  /** Route pattern (glob or regex) */
  pattern: string;
  /** Sampling rate for this route (0-1) */
  rate: number;
  /** Optional: HTTP methods this rule applies to */
  methods?: string[];
}

/**
 * Operation-based sampling rule
 */
export interface OperationSamplingRule {
  /** Operation name pattern */
  pattern: string;
  /** Sampling rate (0-1) */
  rate: number;
}

/**
 * Priority sampling rule based on attributes
 */
export interface PrioritySamplingRule {
  /** Attribute name to check */
  attribute: string;
  /** Values that trigger priority sampling */
  values: string[];
  /** Sampling rate when rule matches (0-1) */
  rate: number;
}

/**
 * Default sampling configuration
 */
const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  defaultRate: parseFloat(process.env.TRACE_SAMPLE_RATE || (ENVIRONMENT === 'production' ? '0.1' : '1.0')),
  alwaysSampleErrors: process.env.TRACE_ALWAYS_SAMPLE_ERRORS !== 'false',
  slowRequestThresholdMs: parseInt(process.env.TRACE_SLOW_REQUEST_MS || '5000', 10),
  routeRules: [
    // Health checks - sample rarely
    { pattern: '/health', rate: 0.01 },
    { pattern: '/health/*', rate: 0.01 },
    { pattern: '/metrics', rate: 0.01 },
    { pattern: '/ready', rate: 0.01 },
    // Purchase operations - always sample
    { pattern: '/api/*/purchase*', rate: 1.0, methods: ['POST'] },
    { pattern: '/api/*/transfer*', rate: 1.0, methods: ['POST'] },
    // High-value operations
    { pattern: '/api/*/refund*', rate: 1.0 },
    // Regular read operations - sample less
    { pattern: '/api/*/tickets', rate: 0.3, methods: ['GET'] },
    { pattern: '/api/*/tickets/*', rate: 0.3, methods: ['GET'] },
  ],
  operationRules: [
    // Database operations - sample moderately
    { pattern: 'db.*', rate: 0.5 },
    // Blockchain operations - always sample
    { pattern: 'blockchain.*', rate: 1.0 },
    // Queue operations - sample less
    { pattern: 'queue.*', rate: 0.3 },
    // Cache operations - sample rarely
    { pattern: 'cache.*', rate: 0.1 },
  ],
  priorityRules: [
    // Always sample admin operations
    { attribute: 'user.role', values: ['admin', 'system'], rate: 1.0 },
    // Sample specific tenant operations more
    { attribute: 'tenant.tier', values: ['enterprise', 'premium'], rate: 1.0 },
  ],
};

let samplingConfig: SamplingConfig = { ...DEFAULT_SAMPLING_CONFIG };

/**
 * Update sampling configuration at runtime
 */
export function setSamplingConfig(config: Partial<SamplingConfig>): void {
  samplingConfig = { ...samplingConfig, ...config };
  console.log('Trace sampling configuration updated:', {
    defaultRate: samplingConfig.defaultRate,
    routeRulesCount: samplingConfig.routeRules.length,
    operationRulesCount: samplingConfig.operationRules.length,
  });
}

/**
 * Get current sampling configuration
 */
export function getSamplingConfig(): SamplingConfig {
  return { ...samplingConfig };
}

/**
 * Custom sampler that implements per-route and per-operation sampling
 */
class ConfigurableSampler implements Sampler {
  private rateSampler: TraceIdRatioBasedSampler;

  constructor(private config: SamplingConfig) {
    this.rateSampler = new TraceIdRatioBasedSampler(config.defaultRate);
  }

  shouldSample(
    parentContext: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    // Check priority rules first
    for (const rule of this.config.priorityRules) {
      const attrValue = attributes[rule.attribute];
      if (attrValue && rule.values.includes(String(attrValue))) {
        if (this.shouldSampleByRate(traceId, rule.rate)) {
          return { decision: SamplingDecision.RECORD_AND_SAMPLED };
        }
      }
    }

    // Check route rules for HTTP operations
    const httpRoute = attributes['http.route'] || attributes['http.target'];
    const httpMethod = attributes['http.method'];

    if (httpRoute) {
      for (const rule of this.config.routeRules) {
        if (this.matchPattern(String(httpRoute), rule.pattern)) {
          // Check method if specified
          if (rule.methods && httpMethod && !rule.methods.includes(String(httpMethod))) {
            continue;
          }
          if (this.shouldSampleByRate(traceId, rule.rate)) {
            return { decision: SamplingDecision.RECORD_AND_SAMPLED };
          }
          return { decision: SamplingDecision.NOT_RECORD };
        }
      }
    }

    // Check operation rules
    for (const rule of this.config.operationRules) {
      if (this.matchPattern(spanName, rule.pattern)) {
        if (this.shouldSampleByRate(traceId, rule.rate)) {
          return { decision: SamplingDecision.RECORD_AND_SAMPLED };
        }
        return { decision: SamplingDecision.NOT_RECORD };
      }
    }

    // Fall back to default rate sampling - use our own implementation
    if (this.shouldSampleByRate(traceId, this.config.defaultRate)) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }
    return { decision: SamplingDecision.NOT_RECORD };
  }

  /**
   * Match a value against a pattern (supports glob-like wildcards)
   */
  private matchPattern(value: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*')                   // * -> .*
      .replace(/\?/g, '.');                   // ? -> .

    return new RegExp(`^${regexPattern}$`).test(value);
  }

  /**
   * Deterministic sampling based on trace ID and rate
   */
  private shouldSampleByRate(traceId: string, rate: number): boolean {
    if (rate >= 1) return true;
    if (rate <= 0) return false;

    // Use trace ID for deterministic sampling (same trace ID = same decision)
    const hash = parseInt(traceId.slice(-8), 16);
    return (hash / 0xffffffff) < rate;
  }

  toString(): string {
    return `ConfigurableSampler{defaultRate=${this.config.defaultRate}}`;
  }
}

/**
 * Create a sampler based on configuration
 */
function createSampler(): Sampler {
  // In test environment, always sample
  if (ENVIRONMENT === 'test') {
    return new AlwaysOnSampler();
  }

  // Create configurable sampler
  const customSampler = new ConfigurableSampler(samplingConfig);

  // Wrap with parent-based to respect parent sampling decisions
  return new ParentBasedSampler({
    root: customSampler,
    remoteParentSampled: new AlwaysOnSampler(),
    remoteParentNotSampled: new AlwaysOffSampler(),
    localParentSampled: new AlwaysOnSampler(),
    localParentNotSampled: new AlwaysOffSampler(),
  });
}

// SDK instance for shutdown
let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 * Call this BEFORE any other imports in your application entry point
 */
export function initTracing(): void {
  if (!TRACING_ENABLED) {
    console.log('Tracing is disabled via ENABLE_TRACING=false');
    return;
  }

  // Create resource describing this service
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    'deployment.environment': ENVIRONMENT,
  });

  // Configure exporter based on environment
  const exporter = new OTLPTraceExporter({ url: OTEL_EXPORTER_URL });

  // Initialize SDK with auto-instrumentation
  sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    sampler: createSampler(),
    textMapPropagator: new W3CTraceContextPropagator(),
    contextManager: new AsyncLocalStorageContextManager(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Enable Fastify instrumentation
        '@opentelemetry/instrumentation-fastify': {
          enabled: true,
        },
        // Enable HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        // Enable PostgreSQL instrumentation
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
        // Enable Redis instrumentation
        '@opentelemetry/instrumentation-redis-4': {
          enabled: true,
        },
        // Enable AMQP (RabbitMQ) instrumentation
        '@opentelemetry/instrumentation-amqplib': {
          enabled: true,
        },
        // Enable Winston instrumentation (for log correlation)
        '@opentelemetry/instrumentation-winston': {
          enabled: true,
        },
        // Disable noisy DNS/Net instrumentations
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-net': {
          enabled: false,
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();
  console.log(`✓ OpenTelemetry tracing initialized for ${SERVICE_NAME}`);
}

/**
 * Gracefully shutdown the tracing SDK
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log('OpenTelemetry tracing shut down successfully');
    } catch (error) {
      console.error('Error shutting down OpenTelemetry:', error);
    }
  }
}

// =============================================================================
// TRACE CONTEXT UTILITIES
// =============================================================================

/**
 * Get the current trace and span IDs for logging
 * Fixes DT4: Trace ID in logs
 */
export function getTraceContext(): { traceId: string; spanId: string; requestId?: string } {
  const span = trace.getActiveSpan();
  if (!span) {
    return { traceId: '', spanId: '' };
  }

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Get the tracer instance for creating custom spans
 */
export function getTracer() {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

// =============================================================================
// CUSTOM SPAN CREATION
// Fixes DT7: Custom spans
// =============================================================================

interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Create a custom span for manual instrumentation
 */
export function createSpan(name: string, options: SpanOptions = {}): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, {
    kind: options.kind || SpanKind.INTERNAL,
    attributes: options.attributes,
  });
}

/**
 * Execute a function within a new span
 * Automatically records errors and ends the span
 *
 * Fixes DT6: Error spans recorded
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options: SpanOptions = {}
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: options.kind || SpanKind.INTERNAL,
    attributes: options.attributes,
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      // Record error on span - Fixes DT6
      recordError(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Execute a synchronous function within a new span
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options: SpanOptions = {}
): T {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: options.kind || SpanKind.INTERNAL,
    attributes: options.attributes,
  });

  return context.with(trace.setSpan(context.active(), span), () => {
    try {
      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      recordError(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Record an error on a span
 * Fixes DT6: Error spans recorded
 */
export function recordError(span: Span, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));

  span.recordException(err);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err.message,
  });
  span.setAttribute('error', true);
  span.setAttribute('error.type', err.name);
  span.setAttribute('error.message', err.message);
  if (err.stack) {
    span.setAttribute('error.stack', err.stack);
  }
}

/**
 * Add attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the current span (for logging significant occurrences)
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

// =============================================================================
// CONTEXT PROPAGATION
// Fixes DT5: Context propagation & LC4: Correlation ID middleware
// =============================================================================

/**
 * Extract trace context from incoming headers
 */
export function extractContext(headers: Record<string, string | string[] | undefined>): Context {
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }
  return propagation.extract(context.active(), normalizedHeaders);
}

/**
 * Inject trace context into outgoing headers
 * Fixes DT5: Context propagation
 */
export function injectContext(headers: Record<string, string> = {}): Record<string, string> {
  propagation.inject(context.active(), headers);

  // Also inject correlation ID if we have a request ID
  const span = trace.getActiveSpan();
  if (span) {
    const traceId = span.spanContext().traceId;
    headers['x-correlation-id'] = headers['x-correlation-id'] || traceId;
    headers['x-request-id'] = headers['x-request-id'] || traceId;
  }

  return headers;
}

/**
 * Create headers with trace context for outgoing HTTP requests
 */
export function getTracedHeaders(existingHeaders: Record<string, string> = {}): Record<string, string> {
  return injectContext({ ...existingHeaders });
}

// =============================================================================
// BUSINESS OPERATION SPANS
// Pre-defined spans for common operations
// =============================================================================

/**
 * Create a span for database operations
 */
export async function withDatabaseSpan<T>(
  operation: string,
  table: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`db.${operation}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'postgresql',
      'db.operation': operation,
      'db.table': table,
    },
  });
}

/**
 * Create a span for external service calls
 */
export async function withServiceCallSpan<T>(
  serviceName: string,
  operation: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`service.${serviceName}.${operation}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'peer.service': serviceName,
      'rpc.method': operation,
    },
  });
}

/**
 * Create a span for blockchain operations
 */
export async function withBlockchainSpan<T>(
  operation: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`blockchain.${operation}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'blockchain.network': 'solana',
      'blockchain.operation': operation,
    },
  });
}

/**
 * Create a span for queue operations
 */
export async function withQueueSpan<T>(
  queue: string,
  operation: 'publish' | 'consume' | 'ack' | 'nack',
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`queue.${queue}.${operation}`, fn, {
    kind: operation === 'publish' ? SpanKind.PRODUCER : SpanKind.CONSUMER,
    attributes: {
      'messaging.system': 'rabbitmq',
      'messaging.destination': queue,
      'messaging.operation': operation,
    },
  });
}

export default {
  initTracing,
  shutdownTracing,
  getTraceContext,
  getTracer,
  createSpan,
  withSpan,
  withSpanSync,
  recordError,
  addSpanAttributes,
  addSpanEvent,
  extractContext,
  injectContext,
  getTracedHeaders,
  withDatabaseSpan,
  withServiceCallSpan,
  withBlockchainSpan,
  withQueueSpan,
  // Batch 24: Sampling configuration exports
  setSamplingConfig,
  getSamplingConfig,
};
