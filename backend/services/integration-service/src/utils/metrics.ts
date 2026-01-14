/**
 * Metrics Collection for Integration Service
 * 
 * AUDIT FIX MET-1: No metrics collection for provider calls
 * 
 * Collects metrics for:
 * - HTTP request latency and counts
 * - Provider API call latency
 * - Sync job statistics
 * - Circuit breaker states
 * - Error rates
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getAllCircuitBreakerStats } from './circuit-breaker';
import { getPoolStats } from '../config/database';

// =============================================================================
// TYPES
// =============================================================================

interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

interface HistogramBucket {
  le: number;
  count: number;
}

interface Histogram {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

interface Counter {
  value: number;
  labels: Record<string, number>;
}

interface Gauge {
  value: number;
  timestamp: number;
}

// =============================================================================
// METRICS STORAGE
// =============================================================================

// HTTP request metrics
const httpRequestsTotal: Counter = { value: 0, labels: {} };
const httpRequestDuration: Map<string, Histogram> = new Map();

// Provider API metrics
const providerRequestsTotal: Counter = { value: 0, labels: {} };
const providerRequestDuration: Map<string, Histogram> = new Map();
const providerErrors: Counter = { value: 0, labels: {} };

// Sync job metrics
const syncJobsTotal: Counter = { value: 0, labels: {} };
const syncJobDuration: Map<string, number[]> = new Map();
const syncRecordsProcessed: Counter = { value: 0, labels: {} };

// Webhook metrics
const webhooksReceived: Counter = { value: 0, labels: {} };
const webhooksProcessed: Counter = { value: 0, labels: {} };
const webhooksFailed: Counter = { value: 0, labels: {} };

// System gauges
const activeConnections: Gauge = { value: 0, timestamp: Date.now() };
const memoryUsage: Gauge = { value: 0, timestamp: Date.now() };

// Histogram buckets (in milliseconds)
const DEFAULT_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

// =============================================================================
// HISTOGRAM HELPERS
// =============================================================================

function createHistogram(): Histogram {
  return {
    buckets: DEFAULT_BUCKETS.map(le => ({ le, count: 0 })),
    sum: 0,
    count: 0
  };
}

function observeHistogram(histogram: Histogram, value: number): void {
  histogram.sum += value;
  histogram.count++;
  
  for (const bucket of histogram.buckets) {
    if (value <= bucket.le) {
      bucket.count++;
    }
  }
}

function getOrCreateHistogram(map: Map<string, Histogram>, key: string): Histogram {
  if (!map.has(key)) {
    map.set(key, createHistogram());
  }
  return map.get(key)!;
}

// =============================================================================
// COUNTER HELPERS
// =============================================================================

function incrementCounter(counter: Counter, labelKey?: string): void {
  counter.value++;
  if (labelKey) {
    counter.labels[labelKey] = (counter.labels[labelKey] || 0) + 1;
  }
}

// =============================================================================
// HTTP METRICS
// =============================================================================

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number
): void {
  const labelKey = `${method}:${path}:${statusCode}`;
  incrementCounter(httpRequestsTotal, labelKey);
  
  const histogramKey = `${method}:${path}`;
  const histogram = getOrCreateHistogram(httpRequestDuration, histogramKey);
  observeHistogram(histogram, durationMs);
}

/**
 * Fastify hook for request metrics - onRequest handler
 * Store start time on request
 */
export async function httpMetricsOnRequest(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  (request as any).metricsStartTime = process.hrtime.bigint();
}

/**
 * Fastify hook for request metrics - onResponse handler
 * Calculate duration and record metrics
 */
export async function httpMetricsOnResponse(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = (request as any).metricsStartTime as bigint;
  if (startTime) {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;
    
    recordHttpRequest(
      request.method,
      request.routeOptions?.url || request.url,
      reply.statusCode,
      durationMs
    );
  }
}

/**
 * @deprecated Use httpMetricsOnRequest and httpMetricsOnResponse instead
 */
export const httpMetricsHook = httpMetricsOnRequest;

// =============================================================================
// PROVIDER METRICS
// =============================================================================

/**
 * Record provider API call metrics
 */
export function recordProviderRequest(
  provider: string,
  operation: string,
  durationMs: number,
  success: boolean
): void {
  const labelKey = `${provider}:${operation}:${success ? 'success' : 'failure'}`;
  incrementCounter(providerRequestsTotal, labelKey);
  
  if (!success) {
    incrementCounter(providerErrors, `${provider}:${operation}`);
  }
  
  const histogramKey = `${provider}:${operation}`;
  const histogram = getOrCreateHistogram(providerRequestDuration, histogramKey);
  observeHistogram(histogram, durationMs);
}

/**
 * Create a timer for provider operations
 */
export function startProviderTimer(provider: string, operation: string): () => void {
  const startTime = process.hrtime.bigint();
  
  return (success = true) => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;
    recordProviderRequest(provider, operation, durationMs, success);
  };
}

// =============================================================================
// SYNC METRICS
// =============================================================================

/**
 * Record sync job metrics
 */
export function recordSyncJob(
  provider: string,
  syncType: string,
  durationMs: number,
  recordsProcessed: number,
  success: boolean
): void {
  const labelKey = `${provider}:${syncType}:${success ? 'success' : 'failure'}`;
  incrementCounter(syncJobsTotal, labelKey);
  
  const durationKey = `${provider}:${syncType}`;
  if (!syncJobDuration.has(durationKey)) {
    syncJobDuration.set(durationKey, []);
  }
  const durations = syncJobDuration.get(durationKey)!;
  durations.push(durationMs);
  if (durations.length > 100) durations.shift(); // Keep last 100
  
  incrementCounter(syncRecordsProcessed, `${provider}:${syncType}`);
  syncRecordsProcessed.labels[`${provider}:${syncType}`] += recordsProcessed - 1;
}

// =============================================================================
// WEBHOOK METRICS
// =============================================================================

/**
 * Record webhook metrics
 */
export function recordWebhook(
  provider: string,
  eventType: string,
  status: 'received' | 'processed' | 'failed'
): void {
  const labelKey = `${provider}:${eventType}`;
  
  switch (status) {
    case 'received':
      incrementCounter(webhooksReceived, labelKey);
      break;
    case 'processed':
      incrementCounter(webhooksProcessed, labelKey);
      break;
    case 'failed':
      incrementCounter(webhooksFailed, labelKey);
      break;
  }
}

// =============================================================================
// SYSTEM METRICS
// =============================================================================

/**
 * Update system gauges
 */
export function updateSystemMetrics(): void {
  const mem = process.memoryUsage();
  memoryUsage.value = mem.heapUsed;
  memoryUsage.timestamp = Date.now();
}

/**
 * Record active connections
 */
export function setActiveConnections(count: number): void {
  activeConnections.value = count;
  activeConnections.timestamp = Date.now();
}

// =============================================================================
// METRICS EXPORT
// =============================================================================

/**
 * Get all metrics in Prometheus format
 */
export function getPrometheusMetrics(): string {
  updateSystemMetrics();
  
  const lines: string[] = [];
  
  // HTTP request total
  lines.push('# HELP http_requests_total Total HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [label, count] of Object.entries(httpRequestsTotal.labels)) {
    const [method, path, status] = label.split(':');
    lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
  }
  
  // HTTP request duration
  lines.push('# HELP http_request_duration_ms HTTP request duration in milliseconds');
  lines.push('# TYPE http_request_duration_ms histogram');
  for (const [key, histogram] of httpRequestDuration.entries()) {
    const [method, path] = key.split(':');
    for (const bucket of histogram.buckets) {
      lines.push(`http_request_duration_ms_bucket{method="${method}",path="${path}",le="${bucket.le}"} ${bucket.count}`);
    }
    lines.push(`http_request_duration_ms_sum{method="${method}",path="${path}"} ${histogram.sum}`);
    lines.push(`http_request_duration_ms_count{method="${method}",path="${path}"} ${histogram.count}`);
  }
  
  // Provider requests
  lines.push('# HELP provider_requests_total Total provider API requests');
  lines.push('# TYPE provider_requests_total counter');
  for (const [label, count] of Object.entries(providerRequestsTotal.labels)) {
    const [provider, operation, status] = label.split(':');
    lines.push(`provider_requests_total{provider="${provider}",operation="${operation}",status="${status}"} ${count}`);
  }
  
  // Provider errors
  lines.push('# HELP provider_errors_total Total provider API errors');
  lines.push('# TYPE provider_errors_total counter');
  for (const [label, count] of Object.entries(providerErrors.labels)) {
    const [provider, operation] = label.split(':');
    lines.push(`provider_errors_total{provider="${provider}",operation="${operation}"} ${count}`);
  }
  
  // Webhooks
  lines.push('# HELP webhooks_received_total Total webhooks received');
  lines.push('# TYPE webhooks_received_total counter');
  for (const [label, count] of Object.entries(webhooksReceived.labels)) {
    const [provider, event] = label.split(':');
    lines.push(`webhooks_received_total{provider="${provider}",event="${event}"} ${count}`);
  }
  
  // Circuit breakers
  lines.push('# HELP circuit_breaker_state Circuit breaker state (0=closed, 1=half-open, 2=open)');
  lines.push('# TYPE circuit_breaker_state gauge');
  const cbStats = getAllCircuitBreakerStats();
  for (const stat of cbStats) {
    const stateValue = stat.state === 'CLOSED' ? 0 : stat.state === 'HALF_OPEN' ? 1 : 2;
    lines.push(`circuit_breaker_state{name="${stat.name}"} ${stateValue}`);
    lines.push(`circuit_breaker_failures{name="${stat.name}"} ${stat.failures}`);
    lines.push(`circuit_breaker_total_requests{name="${stat.name}"} ${stat.totalRequests}`);
  }
  
  // Database pool
  const poolStats = getPoolStats();
  if (poolStats) {
    lines.push('# HELP db_pool_size Database connection pool size');
    lines.push('# TYPE db_pool_size gauge');
    lines.push(`db_pool_size ${poolStats.size}`);
    lines.push(`db_pool_used ${poolStats.used}`);
    lines.push(`db_pool_free ${poolStats.free}`);
    lines.push(`db_pool_pending ${poolStats.pending}`);
  }
  
  // Memory
  lines.push('# HELP process_heap_bytes Process heap memory in bytes');
  lines.push('# TYPE process_heap_bytes gauge');
  lines.push(`process_heap_bytes ${memoryUsage.value}`);
  
  return lines.join('\n');
}

/**
 * Get metrics as JSON (for dashboard)
 */
export function getMetricsJson(): Record<string, any> {
  updateSystemMetrics();
  
  return {
    http: {
      requestsTotal: httpRequestsTotal.value,
      requestsByLabel: httpRequestsTotal.labels,
      durations: Object.fromEntries(httpRequestDuration)
    },
    providers: {
      requestsTotal: providerRequestsTotal.value,
      requestsByLabel: providerRequestsTotal.labels,
      errors: providerErrors.labels,
      durations: Object.fromEntries(providerRequestDuration)
    },
    sync: {
      jobsTotal: syncJobsTotal.value,
      jobsByLabel: syncJobsTotal.labels,
      recordsProcessed: syncRecordsProcessed.labels
    },
    webhooks: {
      received: webhooksReceived.labels,
      processed: webhooksProcessed.labels,
      failed: webhooksFailed.labels
    },
    circuitBreakers: getAllCircuitBreakerStats(),
    database: getPoolStats(),
    system: {
      memoryUsage: memoryUsage.value,
      activeConnections: activeConnections.value
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  recordHttpRequest,
  httpMetricsHook,
  recordProviderRequest,
  startProviderTimer,
  recordSyncJob,
  recordWebhook,
  setActiveConnections,
  getPrometheusMetrics,
  getMetricsJson
};
