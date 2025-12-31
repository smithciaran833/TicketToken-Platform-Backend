import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// ============================================
// M2: HTTP METRICS
// ============================================

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

// ============================================
// AUTH-SPECIFIC METRICS
// ============================================

export const loginAttemptsTotal = new Counter({
  name: 'auth_login_attempts_total',
  help: 'Total number of login attempts',
  labelNames: ['status'],
  registers: [register]
});

export const registrationTotal = new Counter({
  name: 'auth_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['status'],
  registers: [register]
});

export const tokenRefreshTotal = new Counter({
  name: 'auth_token_refresh_total',
  help: 'Total number of token refreshes',
  labelNames: ['status'],
  registers: [register]
});

export const authDuration = new Histogram({
  name: 'auth_operation_duration_seconds',
  help: 'Duration of auth operations in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

// ============================================
// KEY ROTATION METRICS
// ============================================

export const keyRotationTotal = new Counter({
  name: 'auth_key_rotations_total',
  help: 'Total number of key rotations',
  labelNames: ['key_type', 'reason'],
  registers: [register]
});

export const keyAgeGauge = new Gauge({
  name: 'auth_key_age_days',
  help: 'Age of current signing key in days',
  labelNames: ['key_type'],
  registers: [register]
});

export const keyRotationNeededGauge = new Gauge({
  name: 'auth_key_rotation_needed',
  help: 'Whether key rotation is needed (1=yes, 0=no)',
  labelNames: ['key_type'],
  registers: [register]
});
