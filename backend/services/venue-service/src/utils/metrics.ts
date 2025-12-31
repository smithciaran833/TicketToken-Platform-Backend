import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * SECURITY FIX (M5): Enable default Node.js metrics
 * This provides essential runtime metrics:
 * - process_cpu_user_seconds_total
 * - process_cpu_system_seconds_total
 * - process_resident_memory_bytes
 * - nodejs_heap_size_total_bytes
 * - nodejs_heap_size_used_bytes
 * - nodejs_external_memory_bytes
 * - nodejs_eventloop_lag_seconds
 * - nodejs_gc_duration_seconds
 * - nodejs_active_handles
 * - nodejs_active_requests
 */
collectDefaultMetrics({
  prefix: 'venue_service_',
  labels: { service: 'venue-service' },
});

/**
 * SECURITY FIX (M7): Control label cardinality to prevent memory exhaustion
 * - Use normalized routes instead of raw URLs
 * - Use status code categories instead of individual codes
 * - Limit operation types to known values
 */

// Helper to normalize routes for metrics (M7: prevent high cardinality)
export function normalizeRoute(route: string): string {
  if (!route) return 'unknown';
  // Replace UUIDs and numeric IDs with placeholders
  return route
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id')
    .substring(0, 100); // Limit length
}

// Helper to categorize status codes (M7: reduce cardinality)
export function categorizeStatusCode(code: number): string {
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500) return '5xx';
  return 'other';
}

// Valid operation types (M7: whitelist approach)
const VALID_OPERATIONS = new Set([
  'create', 'read', 'update', 'delete', 'list',
  'connect', 'disconnect', 'sync', 'webhook',
  'unknown'
]);

export function normalizeOperation(op: string): string {
  const normalized = op?.toLowerCase() || 'unknown';
  return VALID_OPERATIONS.has(normalized) ? normalized : 'unknown';
}

// Custom Metrics with controlled cardinality
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_category'], // M7: use category
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_category'] // M7: use category
});

export const venueOperations = new Counter({
  name: 'venue_operations_total',
  help: 'Total number of venue operations',
  labelNames: ['operation', 'status'] // M7: operations are whitelisted
});

export const activeVenues = new Gauge({
  name: 'active_venues_total',
  help: 'Total number of active venues'
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(venueOperations);
register.registerMetric(activeVenues);

export { register };
