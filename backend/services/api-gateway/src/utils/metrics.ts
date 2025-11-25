import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry for metrics
export const register = new Registry();

// Default labels for all metrics
register.setDefaultLabels({
  service: 'api-gateway',
  environment: process.env.NODE_ENV || 'development',
});

// ================================
// HTTP REQUEST METRICS
// ================================

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

export const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register],
});

// ================================
// AUTHENTICATION METRICS
// ================================

export const authAttemptsTotal = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['status'], // success, failure, expired
  registers: [register],
});

export const authDuration = new Histogram({
  name: 'auth_duration_seconds',
  help: 'Authentication duration in seconds',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const jwtValidationErrors = new Counter({
  name: 'jwt_validation_errors_total',
  help: 'Total number of JWT validation errors',
  labelNames: ['error_type'], // expired, invalid, malformed, missing
  registers: [register],
});

// ================================
// CIRCUIT BREAKER METRICS
// ================================

export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerFailures = new Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerSuccesses = new Counter({
  name: 'circuit_breaker_successes_total',
  help: 'Total number of circuit breaker successes',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerTimeouts = new Counter({
  name: 'circuit_breaker_timeouts_total',
  help: 'Total number of circuit breaker timeouts',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerRejects = new Counter({
  name: 'circuit_breaker_rejects_total',
  help: 'Total number of circuit breaker rejects (open circuit)',
  labelNames: ['service'],
  registers: [register],
});

// ================================
// DOWNSTREAM SERVICE METRICS
// ================================

export const downstreamRequestsTotal = new Counter({
  name: 'downstream_requests_total',
  help: 'Total number of requests to downstream services',
  labelNames: ['service', 'status_code'],
  registers: [register],
});

export const downstreamRequestDuration = new Histogram({
  name: 'downstream_request_duration_seconds',
  help: 'Downstream service request duration in seconds',
  labelNames: ['service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const downstreamErrors = new Counter({
  name: 'downstream_errors_total',
  help: 'Total number of downstream service errors',
  labelNames: ['service', 'error_type'],
  registers: [register],
});

// ================================
// CACHE METRICS
// ================================

export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'], // user, venue_access
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheErrors = new Counter({
  name: 'cache_errors_total',
  help: 'Total number of cache errors',
  labelNames: ['cache_type', 'operation'], // get, set, delete
  registers: [register],
});

// ================================
// TENANT ISOLATION METRICS
// ================================

export const tenantRequests = new Counter({
  name: 'tenant_requests_total',
  help: 'Total number of requests per tenant',
  labelNames: ['tenant_id'],
  registers: [register],
});

export const tenantAuthFailures = new Counter({
  name: 'tenant_auth_failures_total',
  help: 'Total number of authentication failures per tenant',
  labelNames: ['tenant_id', 'reason'],
  registers: [register],
});

export const crossTenantAttempts = new Counter({
  name: 'cross_tenant_attempts_total',
  help: 'Total number of attempted cross-tenant access (security violation)',
  labelNames: ['source_tenant', 'target_tenant'],
  registers: [register],
});

// ================================
// SECURITY METRICS
// ================================

export const securityViolations = new Counter({
  name: 'security_violations_total',
  help: 'Total number of security violations detected',
  labelNames: ['violation_type'], // header_manipulation, tenant_bypass, auth_bypass
  registers: [register],
});

export const dangerousHeadersFiltered = new Counter({
  name: 'dangerous_headers_filtered_total',
  help: 'Total number of dangerous headers filtered',
  labelNames: ['header_name'],
  registers: [register],
});

export const rateLimitExceeded = new Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit violations',
  labelNames: ['endpoint', 'tenant_id'],
  registers: [register],
});

// ================================
// SYSTEM METRICS
// ================================

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

export const memoryUsage = new Gauge({
  name: 'memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'], // heapUsed, heapTotal, rss, external
  registers: [register],
});

export const eventLoopLag = new Histogram({
  name: 'event_loop_lag_seconds',
  help: 'Event loop lag in seconds',
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// ================================
// HEALTH CHECK METRICS
// ================================

export const healthCheckStatus = new Gauge({
  name: 'health_check_status',
  help: 'Health check status (1=healthy, 0=unhealthy)',
  labelNames: ['check_type'], // redis, auth_service, venue_service
  registers: [register],
});

export const healthCheckDuration = new Histogram({
  name: 'health_check_duration_seconds',
  help: 'Health check duration in seconds',
  labelNames: ['check_type'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// ================================
// UTILITY FUNCTIONS
// ================================

/**
 * Update system metrics (call this periodically)
 */
export function updateSystemMetrics(): void {
  const memUsage = process.memoryUsage();
  memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
  memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
  memoryUsage.set({ type: 'rss' }, memUsage.rss);
  memoryUsage.set({ type: 'external' }, memUsage.external);
}

/**
 * Measure event loop lag
 */
export function measureEventLoopLag(): void {
  const start = Date.now();
  setImmediate(() => {
    const lag = (Date.now() - start) / 1000;
    eventLoopLag.observe(lag);
  });
}

// Start periodic system metrics updates
setInterval(updateSystemMetrics, 10000); // Every 10 seconds
setInterval(measureEventLoopLag, 5000); // Every 5 seconds

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics content type
 */
export function getMetricsContentType(): string {
  return register.contentType;
}
