import * as client from 'prom-client';

// Create a Registry
export const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ 
  register,
  prefix: 'scanning_service_'
});

// Phase 3.4: Enhanced Prometheus Metrics

// HTTP metrics
export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Scanning specific metrics
export const scansAllowedTotal = new client.Counter({
  name: 'scans_allowed_total',
  help: 'Total number of allowed scans',
  labelNames: ['venue_id', 'event_id', 'access_level'],
  registers: [register]
});

export const scansDeniedTotal = new client.Counter({
  name: 'scans_denied_total',
  help: 'Total number of denied scans',
  labelNames: ['reason', 'venue_id', 'event_id'],
  registers: [register]
});

export const scanLatency = new client.Histogram({
  name: 'scan_latency_seconds',
  help: 'Scan operation latency in seconds',
  labelNames: ['result', 'venue_id'],
  buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
  registers: [register]
});

export const qrGenerationDuration = new client.Histogram({
  name: 'qr_generation_duration_seconds',
  help: 'QR code generation duration',
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1],
  registers: [register]
});

// Nonce validation metrics (Phase 2.8)
export const replayAttemptsTotal = new client.Counter({
  name: 'replay_attacks_detected_total',
  help: 'Total number of replay attack attempts detected',
  labelNames: ['venue_id'],
  registers: [register]
});

export const expiredQRAttemptsTotal = new client.Counter({
  name: 'expired_qr_attempts_total',
  help: 'Total number of expired QR code scan attempts',
  labelNames: ['venue_id'],
  registers: [register]
});

// Duplicate detection metrics
export const duplicateScansDetected = new client.Counter({
  name: 'duplicate_scans_detected_total',
  help: 'Total number of duplicate scans detected',
  labelNames: ['venue_id', 'within_window'],
  registers: [register]
});

// Re-entry policy metrics
export const reentryAllowed = new client.Counter({
  name: 'reentry_allowed_total',
  help: 'Total number of successful re-entries',
  labelNames: ['venue_id', 'event_id'],
  registers: [register]
});

export const reentryDenied = new client.Counter({
  name: 'reentry_denied_total',
  help: 'Total number of denied re-entries',
  labelNames: ['reason', 'venue_id'],
  registers: [register]
});

// Access zone metrics
export const accessZoneViolations = new client.Counter({
  name: 'access_zone_violations_total',
  help: 'Total number of access zone violations',
  labelNames: ['required_level', 'device_zone', 'venue_id'],
  registers: [register]
});

// Offline mode metrics
export const offlineManifestsGenerated = new client.Counter({
  name: 'offline_manifests_generated_total',
  help: 'Total number of offline manifests generated',
  labelNames: ['event_id', 'device_id'],
  registers: [register]
});

export const offlineScansReconciled = new client.Counter({
  name: 'offline_scans_reconciled_total',
  help: 'Total number of offline scans reconciled',
  labelNames: ['event_id', 'result'],
  registers: [register]
});

// Active connections gauge
export const activeScans = new client.Gauge({
  name: 'active_scans_current',
  help: 'Current number of active scan operations',
  registers: [register]
});

// Database metrics
export const databaseQueryDuration = new client.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

export const databaseConnectionsActive = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  registers: [register]
});

// Redis metrics
export const redisCacheHits = new client.Counter({
  name: 'redis_cache_hits_total',
  help: 'Total number of Redis cache hits',
  labelNames: ['key_type'],
  registers: [register]
});

export const redisCacheMisses = new client.Counter({
  name: 'redis_cache_misses_total',
  help: 'Total number of Redis cache misses',
  labelNames: ['key_type'],
  registers: [register]
});

// Rate limiting metrics
export const rateLimitExceeded = new client.Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit violations',
  labelNames: ['endpoint', 'client_ip'],
  registers: [register]
});

// Security metrics
export const authenticationFailures = new client.Counter({
  name: 'authentication_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['reason'],
  registers: [register]
});

export const venueIsolationViolations = new client.Counter({
  name: 'venue_isolation_violations_total',
  help: 'Total number of venue isolation violations detected',
  labelNames: ['staff_venue', 'attempted_venue'],
  registers: [register]
});

export const tenantIsolationViolations = new client.Counter({
  name: 'tenant_isolation_violations_total',
  help: 'Total number of tenant isolation violations detected',
  labelNames: ['staff_tenant', 'attempted_tenant'],
  registers: [register]
});

// Business metrics
export const scansPerMinute = new client.Gauge({
  name: 'scans_per_minute_current',
  help: 'Current scan rate per minute',
  labelNames: ['venue_id'],
  registers: [register]
});

export const uniqueTicketsScanned = new client.Counter({
  name: 'unique_tickets_scanned_total', 
  help: 'Total number of unique tickets scanned',
  labelNames: ['event_id', 'access_level'],
  registers: [register]
});
