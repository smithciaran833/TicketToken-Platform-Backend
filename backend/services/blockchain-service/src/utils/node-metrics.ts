/**
 * Node.js Default Metrics
 * 
 * AUDIT FIX #15: Add default Node.js metrics
 * 
 * Provides standard Node.js process metrics:
 * - CPU usage (user, system)
 * - Memory usage (RSS, heap)
 * - Event loop lag
 * - Active handles/requests
 * - GC duration (if available)
 */

import * as promClient from 'prom-client';
import { logger } from './logger';

// Node.js globals
declare const process: NodeJS.Process;

// =============================================================================
// CONFIGURATION
// =============================================================================

// Collection interval for default metrics (10 seconds)
const METRICS_COLLECTION_INTERVAL = 10000;

// =============================================================================
// CUSTOM METRICS
// =============================================================================

// Event loop lag histogram
const eventLoopLag = new promClient.Histogram({
  name: 'nodejs_eventloop_lag_seconds',
  help: 'Event loop lag in seconds',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

// Memory usage gauges
const memoryUsageGauges = {
  heapTotal: new promClient.Gauge({
    name: 'nodejs_heap_total_bytes',
    help: 'Total heap size in bytes'
  }),
  heapUsed: new promClient.Gauge({
    name: 'nodejs_heap_used_bytes',
    help: 'Used heap size in bytes'
  }),
  external: new promClient.Gauge({
    name: 'nodejs_external_memory_bytes',
    help: 'External memory in bytes (C++ objects bound to JavaScript)'
  }),
  arrayBuffers: new promClient.Gauge({
    name: 'nodejs_arraybuffers_bytes',
    help: 'Memory allocated for ArrayBuffers and SharedArrayBuffers'
  }),
  rss: new promClient.Gauge({
    name: 'nodejs_rss_bytes',
    help: 'Resident Set Size - total memory allocated for the process'
  })
};

// Active resources
const activeHandles = new promClient.Gauge({
  name: 'nodejs_active_handles_total',
  help: 'Number of active handles'
});

const activeRequests = new promClient.Gauge({
  name: 'nodejs_active_requests_total',
  help: 'Number of active requests'
});

// Uptime
const uptimeGauge = new promClient.Gauge({
  name: 'nodejs_uptime_seconds',
  help: 'Process uptime in seconds'
});

// Version info
const versionInfo = new promClient.Gauge({
  name: 'nodejs_version_info',
  help: 'Node.js version info',
  labelNames: ['version', 'major', 'minor', 'patch']
});

// =============================================================================
// CUSTOM COLLECTORS
// =============================================================================

/**
 * Measure event loop lag
 * Returns the time in seconds that a setTimeout(0) takes to execute
 */
function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const end = process.hrtime.bigint();
      const lagNs = Number(end - start);
      const lagSeconds = lagNs / 1e9;
      resolve(lagSeconds);
    });
  });
}

/**
 * Collect custom metrics
 */
async function collectCustomMetrics(): Promise<void> {
  try {
    // Memory usage
    const memory = process.memoryUsage();
    memoryUsageGauges.heapTotal.set(memory.heapTotal);
    memoryUsageGauges.heapUsed.set(memory.heapUsed);
    memoryUsageGauges.external.set(memory.external);
    memoryUsageGauges.arrayBuffers.set(memory.arrayBuffers || 0);
    memoryUsageGauges.rss.set(memory.rss);

    // Active handles and requests
    // @ts-ignore - _getActiveHandles exists but not in types
    if (typeof process._getActiveHandles === 'function') {
      // @ts-ignore
      activeHandles.set(process._getActiveHandles().length);
    }
    // @ts-ignore - _getActiveRequests exists but not in types
    if (typeof process._getActiveRequests === 'function') {
      // @ts-ignore
      activeRequests.set(process._getActiveRequests().length);
    }

    // Uptime
    uptimeGauge.set(process.uptime());

    // Event loop lag
    const lag = await measureEventLoopLag();
    eventLoopLag.observe(lag);

  } catch (error) {
    logger.error('Error collecting custom metrics', {
      error: (error as Error).message
    });
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

let collectionInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize default Node.js metrics collection
 * AUDIT FIX #15: Use prom-client default metrics
 */
export function initializeNodeMetrics(): void {
  // Register default metrics from prom-client
  promClient.collectDefaultMetrics({
    prefix: 'nodejs_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    eventLoopMonitoringPrecision: 10
  });

  // Set version info (once)
  const versionMatch = process.version.match(/v(\d+)\.(\d+)\.(\d+)/);
  if (versionMatch) {
    versionInfo.set({
      version: process.version,
      major: versionMatch[1],
      minor: versionMatch[2],
      patch: versionMatch[3]
    }, 1);
  }

  // Start custom metrics collection
  collectionInterval = setInterval(collectCustomMetrics, METRICS_COLLECTION_INTERVAL);
  
  // Initial collection
  collectCustomMetrics();

  logger.info('Node.js metrics initialized', {
    collectionInterval: `${METRICS_COLLECTION_INTERVAL}ms`,
    nodeVersion: process.version
  });
}

/**
 * Stop metrics collection
 */
export function stopNodeMetrics(): void {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
    logger.info('Node.js metrics collection stopped');
  }
}

// =============================================================================
// METRICS ACCESS
// =============================================================================

/**
 * Get the Prometheus registry
 */
export function getRegistry(): promClient.Registry {
  return promClient.register;
}

/**
 * Get all metrics as string
 */
export async function getMetrics(): Promise<string> {
  return promClient.register.metrics();
}

/**
 * Get content type for metrics response
 */
export function getContentType(): string {
  return promClient.register.contentType;
}

/**
 * Get specific metric by name
 */
export function getMetric(name: string): promClient.Metric<string> | undefined {
  return promClient.register.getSingleMetric(name);
}

/**
 * Create a custom counter
 */
export function createCounter(config: promClient.CounterConfiguration<string>): promClient.Counter<string> {
  return new promClient.Counter(config);
}

/**
 * Create a custom gauge
 */
export function createGauge(config: promClient.GaugeConfiguration<string>): promClient.Gauge<string> {
  return new promClient.Gauge(config);
}

/**
 * Create a custom histogram
 */
export function createHistogram(config: promClient.HistogramConfiguration<string>): promClient.Histogram<string> {
  return new promClient.Histogram(config);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  eventLoopLag,
  memoryUsageGauges,
  activeHandles,
  activeRequests,
  uptimeGauge,
  METRICS_COLLECTION_INTERVAL
};
