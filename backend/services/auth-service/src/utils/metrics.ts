import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// Custom metrics for auth service
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
  registers: [register]
});
