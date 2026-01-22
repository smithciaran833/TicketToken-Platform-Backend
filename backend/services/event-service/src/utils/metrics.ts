import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Add default metrics (CPU, memory, GC, etc.)
collectDefaultMetrics({ register });

/**
 * ⚠️ CARDINALITY WARNING:
 * tenant_id has been added to many metrics below. If you have a large number of tenants,
 * this could cause high cardinality and impact Prometheus performance.
 * 
 * Monitor your Prometheus instance and consider:
 * - Recording rules to aggregate by tenant
 * - Using exemplars instead of labels for some metrics
 * - Sampling or filtering tenants in queries
 */

// Custom metrics for event service

// Event operations
export const eventCreatedTotal = new Counter({
  name: 'event_created_total',
  help: 'Total number of events created',
  labelNames: ['status', 'event_type', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const eventUpdatedTotal = new Counter({
  name: 'event_updated_total',
  help: 'Total number of events updated',
  labelNames: ['status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const eventPublishedTotal = new Counter({
  name: 'event_published_total',
  help: 'Total number of events published',
  labelNames: ['status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const eventDeletedTotal = new Counter({
  name: 'event_deleted_total',
  help: 'Total number of events deleted',
  labelNames: ['status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

// Capacity operations
export const capacityReservedTotal = new Counter({
  name: 'capacity_reserved_total',
  help: 'Total capacity reservations',
  labelNames: ['status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const capacityCheckedTotal = new Counter({
  name: 'capacity_checked_total',
  help: 'Total capacity availability checks',
  labelNames: ['available', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

// ⚠️ WARNING: This gauge could have very high cardinality with event_id + tenant_id
// Consider removing event_id or aggregating differently
export const capacityAvailable = new Gauge({
  name: 'capacity_available',
  help: 'Current available capacity',
  labelNames: ['event_id', 'section_name', 'tenant_id'], // ✅ FIXED: Added tenant_id (but watch cardinality!)
  registers: [register]
});

// Pricing operations
export const pricingCreatedTotal = new Counter({
  name: 'pricing_created_total',
  help: 'Total pricing tiers created',
  labelNames: ['status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const pricingCalculatedTotal = new Counter({
  name: 'pricing_calculated_total',
  help: 'Total price calculations',
  labelNames: ['tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const priceLockCreatedTotal = new Counter({
  name: 'price_lock_created_total',
  help: 'Total price locks created',
  labelNames: ['tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

// Schedule operations
export const scheduleCreatedTotal = new Counter({
  name: 'schedule_created_total',
  help: 'Total schedules created',
  labelNames: ['status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const scheduleUpdatedTotal = new Counter({
  name: 'schedule_updated_total',
  help: 'Total schedules updated',
  labelNames: ['status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

// Performance metrics
export const eventOperationDuration = new Histogram({
  name: 'event_operation_duration_seconds',
  help: 'Duration of event operations in seconds',
  labelNames: ['operation', 'tenant_id'], // ✅ FIXED: Added tenant_id
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const capacityOperationDuration = new Histogram({
  name: 'capacity_operation_duration_seconds',
  help: 'Duration of capacity operations in seconds',
  labelNames: ['operation', 'tenant_id'], // ✅ FIXED: Added tenant_id
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table', 'tenant_id'], // ✅ FIXED: Added tenant_id
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

// HTTP request metrics (tenant_id optional for public endpoints)
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Reservation cleanup job metrics
export const reservationCleanupRunsTotal = new Counter({
  name: 'reservation_cleanup_runs_total',
  help: 'Total reservation cleanup job runs',
  labelNames: ['status'],
  registers: [register]
});

export const reservationsExpiredTotal = new Counter({
  name: 'reservations_expired_total',
  help: 'Total expired reservations cleaned up',
  labelNames: ['tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const reservationCleanupDuration = new Histogram({
  name: 'reservation_cleanup_duration_seconds',
  help: 'Duration of reservation cleanup in seconds',
  buckets: [0.1, 0.5, 1, 5, 10, 30],
  registers: [register]
});

// Cache operations metrics
export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_key'],
  registers: [register]
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_key'],
  registers: [register]
});

export const cacheInvalidationTotal = new Counter({
  name: 'cache_invalidation_total',
  help: 'Total cache invalidations',
  labelNames: ['status', 'cache_key'],
  registers: [register]
});

export const cacheInvalidationFailuresTotal = new Counter({
  name: 'cache_invalidation_failures_total',
  help: 'Total cache invalidation failures',
  labelNames: ['cache_key', 'error_type'],
  registers: [register]
});

// Rate limiting metrics
export const rateLimitHitsTotal = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Total requests that hit rate limit',
  labelNames: ['endpoint', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const rateLimitFailOpenTotal = new Counter({
  name: 'rate_limit_fail_open_total',
  help: 'Total times rate limiting failed open due to errors',
  labelNames: ['error_type'],
  registers: [register]
});

// External service call metrics
export const externalServiceCallsTotal = new Counter({
  name: 'external_service_calls_total',
  help: 'Total external service calls',
  labelNames: ['service', 'operation', 'status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const externalServiceDuration = new Histogram({
  name: 'external_service_duration_seconds',
  help: 'Duration of external service calls in seconds',
  labelNames: ['service', 'operation', 'tenant_id'], // ✅ FIXED: Added tenant_id
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// Circuit breaker metrics
export const circuitBreakerStateChanges = new Counter({
  name: 'circuit_breaker_state_changes_total',
  help: 'Total circuit breaker state changes',
  labelNames: ['service', 'from_state', 'to_state'],
  registers: [register]
});

export const circuitBreakerCallsTotal = new Counter({
  name: 'circuit_breaker_calls_total',
  help: 'Total circuit breaker calls',
  labelNames: ['service', 'status'],
  registers: [register]
});

// Search sync metrics
export const searchSyncPublishedTotal = new Counter({
  name: 'search_sync_published_total',
  help: 'Total search sync events published',
  labelNames: ['event_type', 'status', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const searchSyncFailuresTotal = new Counter({
  name: 'search_sync_failures_total',
  help: 'Total search sync failures',
  labelNames: ['event_type', 'error_type', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

// Event transition job metrics
export const eventTransitionsTotal = new Counter({
  name: 'event_transitions_total',
  help: 'Total event state transitions',
  labelNames: ['transition_type', 'result', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

export const eventTransitionDuration = new Histogram({
  name: 'event_transition_duration_seconds',
  help: 'Duration of event state transitions',
  labelNames: ['transition_type', 'tenant_id'], // ✅ FIXED: Added tenant_id
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const scanEventsFound = new Gauge({
  name: 'scan_events_found',
  help: 'Number of events found in last scan',
  labelNames: ['transition_type'],
  registers: [register]
});

export const lockAcquisitionFailuresTotal = new Counter({
  name: 'lock_acquisition_failures_total',
  help: 'Total lock acquisition failures',
  labelNames: ['lock_type', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

// Error tracking metrics
export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total errors by type and status code',
  labelNames: ['error_type', 'status_code', 'endpoint', 'tenant_id'], // ✅ FIXED: Added tenant_id
  registers: [register]
});

/**
 * Increment error metric for tracking error patterns.
 * Call this from error handlers to track errors by type, status code, and endpoint.
 *
 * @param errorType - The type of error (validation, auth, not_found, conflict, internal, etc.)
 * @param statusCode - HTTP status code (400, 401, 403, 404, 409, 500, etc.)
 * @param endpoint - The endpoint that generated the error (e.g., '/events', '/capacity')
 * @param tenantId - Optional tenant ID for multi-tenant tracking
 */
export function incrementErrorMetric(
  errorType: string,
  statusCode: number | string,
  endpoint: string,
  tenantId?: string // ✅ FIXED: Added tenantId parameter
): void {
  try {
    errorsTotal.inc({
      error_type: errorType,
      status_code: String(statusCode),
      endpoint: normalizeEndpoint(endpoint),
      tenant_id: tenantId || 'unknown', // ✅ FIXED: Include tenant_id
    });
  } catch (err) {
    // Don't let metrics failures break error handling
    console.error('Failed to increment error metric:', err);
  }
}

/**
 * Normalize endpoint path for consistent metric labels.
 * Removes path parameters to avoid high cardinality.
 */
function normalizeEndpoint(path: string): string {
  if (!path) return 'unknown';

  // Remove query strings
  const basePath = path.split('?')[0];

  // Replace UUIDs with placeholder
  const normalized = basePath.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );

  // Replace numeric IDs with placeholder
  return normalized.replace(/\/\d+/g, '/:id');
}
