/**
 * Metrics Utility
 * AUDIT FIX: OBS-1,2,3 - Observability and monitoring
 */

import { getAllCircuits, CircuitState } from './circuit-breaker';

// =============================================================================
// Types
// =============================================================================

interface MetricLabels {
  [key: string]: string | number;
}

// =============================================================================
// In-Memory Metrics Store (for Prometheus scraping)
// =============================================================================

const counters = new Map<string, { value: number; labels: MetricLabels }[]>();
const gauges = new Map<string, { value: number; labels: MetricLabels; timestamp: number }[]>();
const histograms = new Map<string, { sum: number; count: number; buckets: number[]; labels: MetricLabels }[]>();

const HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// =============================================================================
// Counter Operations
// =============================================================================

export function incrementCounter(name: string, value = 1, labels: MetricLabels = {}): void {
  const existing = counters.get(name) || [];
  
  const idx = existing.findIndex(e => JSON.stringify(e.labels) === JSON.stringify(labels));
  if (idx >= 0) {
    existing[idx].value += value;
  } else {
    existing.push({ value, labels });
  }
  
  counters.set(name, existing);
}

// =============================================================================
// Gauge Operations
// =============================================================================

export function setGauge(name: string, value: number, labels: MetricLabels = {}): void {
  const existing = gauges.get(name) || [];
  const idx = existing.findIndex(e => JSON.stringify(e.labels) === JSON.stringify(labels));
  
  const entry = { value, labels, timestamp: Date.now() };
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  
  gauges.set(name, existing);
}

export function incrementGauge(name: string, value = 1, labels: MetricLabels = {}): void {
  const existing = gauges.get(name) || [];
  const idx = existing.findIndex(e => JSON.stringify(e.labels) === JSON.stringify(labels));
  
  if (idx >= 0) {
    existing[idx].value += value;
    existing[idx].timestamp = Date.now();
  } else {
    existing.push({ value, labels, timestamp: Date.now() });
  }
  
  gauges.set(name, existing);
}

export function decrementGauge(name: string, value = 1, labels: MetricLabels = {}): void {
  incrementGauge(name, -value, labels);
}

// =============================================================================
// Histogram Operations
// =============================================================================

export function observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
  const existing = histograms.get(name) || [];
  const idx = existing.findIndex(e => JSON.stringify(e.labels) === JSON.stringify(labels));
  
  if (idx >= 0) {
    existing[idx].sum += value;
    existing[idx].count++;
    // Update bucket counts
    for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
      if (value <= HISTOGRAM_BUCKETS[i]) {
        existing[idx].buckets[i]++;
      }
    }
  } else {
    const buckets = HISTOGRAM_BUCKETS.map(b => (value <= b ? 1 : 0));
    existing.push({ sum: value, count: 1, buckets, labels });
  }
  
  histograms.set(name, existing);
}

// =============================================================================
// Timer Utility
// =============================================================================

export function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => {
    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000_000; // seconds
  };
}

export async function timeAsync<T>(
  name: string,
  fn: () => Promise<T>,
  labels: MetricLabels = {}
): Promise<T> {
  const end = startTimer();
  try {
    const result = await fn();
    observeHistogram(`${name}_duration_seconds`, end(), { ...labels, status: 'success' });
    incrementCounter(`${name}_total`, 1, { ...labels, status: 'success' });
    return result;
  } catch (error) {
    observeHistogram(`${name}_duration_seconds`, end(), { ...labels, status: 'error' });
    incrementCounter(`${name}_total`, 1, { ...labels, status: 'error' });
    throw error;
  }
}

// =============================================================================
// Pre-defined Analytics Metrics
// =============================================================================

export const analyticsMetrics = {
  // Request metrics
  requestsTotal: (method: string, path: string, status: number) =>
    incrementCounter('analytics_http_requests_total', 1, { method, path, status: status.toString() }),
  
  requestDuration: (method: string, path: string, durationSec: number) =>
    observeHistogram('analytics_http_request_duration_seconds', durationSec, { method, path }),
  
  // Database metrics
  dbQueryDuration: (query: string, durationSec: number) =>
    observeHistogram('analytics_db_query_duration_seconds', durationSec, { query }),
  
  dbConnections: (pool: string, count: number) =>
    setGauge('analytics_db_connections', count, { pool }),
  
  // Cache metrics
  cacheHit: (cache: string) => incrementCounter('analytics_cache_hits_total', 1, { cache }),
  cacheMiss: (cache: string) => incrementCounter('analytics_cache_misses_total', 1, { cache }),
  
  // InfluxDB metrics
  influxQueryDuration: (bucket: string, durationSec: number) =>
    observeHistogram('analytics_influx_query_duration_seconds', durationSec, { bucket }),
  
  // RFM metrics
  rfmCalculationDuration: (durationSec: number) =>
    observeHistogram('analytics_rfm_calculation_duration_seconds', durationSec, {}),
  
  rfmCustomersProcessed: (count: number) =>
    incrementCounter('analytics_rfm_customers_processed_total', count, {}),
  
  // Active users/tenants
  activeTenants: (count: number) => setGauge('analytics_active_tenants', count, {}),
  activeConnections: (count: number) => setGauge('analytics_active_connections', count, {}),
};

// =============================================================================
// Prometheus Export Format
// =============================================================================

export function getPrometheusMetrics(): string {
  const lines: string[] = [];
  
  // Export counters
  counters.forEach((values, name) => {
    lines.push(`# TYPE ${name} counter`);
    values.forEach(({ value, labels }) => {
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`${name}${labelStr ? `{${labelStr}}` : ''} ${value}`);
    });
  });
  
  // Export gauges
  gauges.forEach((values, name) => {
    lines.push(`# TYPE ${name} gauge`);
    values.forEach(({ value, labels }) => {
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      lines.push(`${name}${labelStr ? `{${labelStr}}` : ''} ${value}`);
    });
  });
  
  // Export histograms
  histograms.forEach((values, name) => {
    lines.push(`# TYPE ${name} histogram`);
    values.forEach(({ sum, count, buckets, labels }) => {
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      const baseLabels = labelStr ? `${labelStr},` : '';
      
      buckets.forEach((bucketCount, i) => {
        lines.push(`${name}_bucket{${baseLabels}le="${HISTOGRAM_BUCKETS[i]}"} ${bucketCount}`);
      });
      lines.push(`${name}_bucket{${baseLabels}le="+Inf"} ${count}`);
      lines.push(`${name}_sum${labelStr ? `{${labelStr}}` : ''} ${sum}`);
      lines.push(`${name}_count${labelStr ? `{${labelStr}}` : ''} ${count}`);
    });
  });
  
  // Add circuit breaker status
  lines.push('# TYPE circuit_breaker_status gauge');
  getAllCircuits().forEach((circuit, name) => {
    const state = circuit.getState();
    lines.push(`circuit_breaker_status{circuit="${name}",state="${state}"} ${state === CircuitState.CLOSED ? 1 : 0}`);
  });
  
  return lines.join('\n');
}

// =============================================================================
// Health/Status Export
// =============================================================================

export function getMetricsStatus(): Record<string, any> {
  const circuitStatus: Record<string, string> = {};
  getAllCircuits().forEach((circuit, name) => {
    circuitStatus[name] = circuit.getState();
  });
  
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    circuits: circuitStatus,
  };
}

export default {
  incrementCounter,
  setGauge,
  incrementGauge,
  decrementGauge,
  observeHistogram,
  startTimer,
  timeAsync,
  analyticsMetrics,
  getPrometheusMetrics,
  getMetricsStatus,
};
