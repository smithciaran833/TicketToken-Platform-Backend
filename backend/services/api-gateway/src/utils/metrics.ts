import { createLogger } from './logger';

const logger = createLogger('metrics');

// Simple in-memory metrics collector
// TODO: Replace with Prometheus client when ready
class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  // Increment a counter
  inc(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  // Set a gauge value
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);
  }

  // Record a histogram value
  histogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  // Get all metrics
  getMetrics(): any {
    const metrics: any = {
      counters: {},
      gauges: {},
      histograms: {},
    };

    // Convert counters
    for (const [key, value] of this.counters) {
      metrics.counters[key] = value;
    }

    // Convert gauges
    for (const [key, value] of this.gauges) {
      metrics.gauges[key] = value;
    }

    // Convert histograms to summary stats
    for (const [key, values] of this.histograms) {
      if (values.length > 0) {
        metrics.histograms[key] = {
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          p50: this.percentile(values, 0.5),
          p95: this.percentile(values, 0.95),
          p99: this.percentile(values, 0.99),
        };
      }
    }

    return metrics;
  }

  // Reset all metrics
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}

// Global metrics instance
export const metrics = new MetricsCollector();

// Common metric names
export const METRIC_NAMES = {
  // HTTP metrics
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_ms',
  HTTP_REQUEST_SIZE: 'http_request_size_bytes',
  HTTP_RESPONSE_SIZE: 'http_response_size_bytes',

  // Circuit breaker metrics
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
  CIRCUIT_BREAKER_FAILURES: 'circuit_breaker_failures_total',

  // Rate limit metrics
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded_total',
  RATE_LIMIT_REMAINING: 'rate_limit_remaining',

  // Service metrics
  SERVICE_CALLS_TOTAL: 'service_calls_total',
  SERVICE_CALL_DURATION: 'service_call_duration_ms',
  SERVICE_CALL_ERRORS: 'service_call_errors_total',

  // Business metrics
  TICKET_PURCHASES: 'ticket_purchases_total',
  TICKET_VALIDATIONS: 'ticket_validations_total',
  NFT_MINTS: 'nft_mints_total',
} as const;

// Log metrics periodically
export function startMetricsLogging(intervalMs: number = 60000): void {
  setInterval(() => {
    const currentMetrics = metrics.getMetrics();
    logger.info({ metrics: currentMetrics }, 'Metrics snapshot');
  }, intervalMs);
}
