/**
 * Prometheus Metrics for Payment Service
 * 
 * MEDIUM FIXES:
 * - M-2: HTTP request rate counter
 * - M-3: HTTP duration histogram (not just paymentDuration)
 * - M-4: Error rate counter
 * - PM-7: Monitor Stripe rate limit headers
 */

import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge, Summary } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Add default metrics (Node.js runtime metrics)
collectDefaultMetrics({ 
  register,
  prefix: 'payment_service_',
});

// =============================================================================
// M-2: HTTP REQUEST RATE METRICS
// =============================================================================

/**
 * M-2: Total HTTP requests counter
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [register],
});

/**
 * M-2: HTTP requests in progress
 */
export const httpRequestsInProgress = new Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'path'],
  registers: [register],
});

// =============================================================================
// M-3: HTTP DURATION HISTOGRAM
// =============================================================================

/**
 * M-3: HTTP request duration histogram
 * Tracks latency distribution for all HTTP requests
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * M-3: HTTP request size histogram
 */
export const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP request bodies in bytes',
  labelNames: ['method', 'path'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

/**
 * M-3: HTTP response size histogram
 */
export const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP response bodies in bytes',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [register],
});

// =============================================================================
// M-4: ERROR RATE METRICS
// =============================================================================

/**
 * M-4: Total errors counter
 */
export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code', 'path'],
  registers: [register],
});

/**
 * M-4: HTTP error responses counter (4xx, 5xx)
 */
export const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP error responses',
  labelNames: ['method', 'path', 'status_code', 'error_code'],
  registers: [register],
});

/**
 * M-4: Unhandled exception counter
 */
export const unhandledExceptionsTotal = new Counter({
  name: 'unhandled_exceptions_total',
  help: 'Total number of unhandled exceptions',
  labelNames: ['type'],
  registers: [register],
});

// =============================================================================
// PM-7: STRIPE RATE LIMIT MONITORING
// =============================================================================

/**
 * PM-7: Stripe API request counter
 */
export const stripeRequestsTotal = new Counter({
  name: 'stripe_requests_total',
  help: 'Total number of Stripe API requests',
  labelNames: ['method', 'endpoint', 'status'],
  registers: [register],
});

/**
 * PM-7: Stripe API request duration
 */
export const stripeRequestDuration = new Histogram({
  name: 'stripe_request_duration_seconds',
  help: 'Duration of Stripe API requests in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * PM-7: Stripe rate limit remaining gauge
 * Tracks the remaining requests from Stripe-RateLimit-Remaining header
 */
export const stripeRateLimitRemaining = new Gauge({
  name: 'stripe_rate_limit_remaining',
  help: 'Number of remaining Stripe API requests before rate limit',
  registers: [register],
});

/**
 * PM-7: Stripe rate limit header tracking
 */
export const stripeRateLimitReset = new Gauge({
  name: 'stripe_rate_limit_reset_seconds',
  help: 'Seconds until Stripe rate limit resets',
  registers: [register],
});

/**
 * PM-7: Stripe rate limit hit counter
 */
export const stripeRateLimitHits = new Counter({
  name: 'stripe_rate_limit_hits_total',
  help: 'Total number of Stripe rate limit errors (429)',
  labelNames: ['endpoint'],
  registers: [register],
});

/**
 * PM-7: Stripe retry counter
 */
export const stripeRetriesTotal = new Counter({
  name: 'stripe_retries_total',
  help: 'Total number of Stripe API request retries',
  labelNames: ['endpoint', 'reason'],
  registers: [register],
});

// =============================================================================
// PAYMENT-SPECIFIC METRICS (existing + enhanced)
// =============================================================================

/**
 * Total payment transactions
 */
export const paymentTotal = new Counter({
  name: 'payment_transactions_total',
  help: 'Total number of payment transactions',
  labelNames: ['status', 'method', 'currency'],
  registers: [register],
});

/**
 * Payment amounts histogram
 */
export const paymentAmount = new Histogram({
  name: 'payment_amount_dollars',
  help: 'Payment amounts in dollars',
  labelNames: ['currency', 'status'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000],
  registers: [register],
});

/**
 * Refund totals
 */
export const refundTotal = new Counter({
  name: 'payment_refunds_total',
  help: 'Total number of refunds processed',
  labelNames: ['status', 'reason'],
  registers: [register],
});

/**
 * Payment processing duration (specific to payment flow)
 */
export const paymentDuration = new Histogram({
  name: 'payment_processing_duration_seconds',
  help: 'Payment processing duration in seconds',
  labelNames: ['method', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

/**
 * Active transactions gauge
 */
export const activeTransactions = new Gauge({
  name: 'payment_active_transactions',
  help: 'Number of active transactions',
  registers: [register],
});

/**
 * Transfer metrics
 */
export const transferTotal = new Counter({
  name: 'payment_transfers_total',
  help: 'Total number of transfers to connected accounts',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Webhook processing metrics
 */
export const webhookTotal = new Counter({
  name: 'webhook_events_total',
  help: 'Total webhook events received',
  labelNames: ['type', 'status'],
  registers: [register],
});

export const webhookDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Webhook processing duration in seconds',
  labelNames: ['type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * PM-7: Record Stripe API response with rate limit headers
 */
export function recordStripeResponse(
  endpoint: string,
  method: string,
  statusCode: number,
  durationSeconds: number,
  headers?: { 
    'stripe-ratelimit-remaining'?: string;
    'stripe-ratelimit-reset'?: string;
    'stripe-request-id'?: string;
  }
): void {
  // Record request
  stripeRequestsTotal.inc({ 
    method, 
    endpoint, 
    status: statusCode.toString() 
  });
  stripeRequestDuration.observe({ method, endpoint }, durationSeconds);
  
  // PM-7: Track rate limit headers
  if (headers) {
    if (headers['stripe-ratelimit-remaining']) {
      const remaining = parseInt(headers['stripe-ratelimit-remaining'], 10);
      if (!isNaN(remaining)) {
        stripeRateLimitRemaining.set(remaining);
      }
    }
    
    if (headers['stripe-ratelimit-reset']) {
      const reset = parseInt(headers['stripe-ratelimit-reset'], 10);
      if (!isNaN(reset)) {
        stripeRateLimitReset.set(reset);
      }
    }
  }
  
  // Track rate limit hits
  if (statusCode === 429) {
    stripeRateLimitHits.inc({ endpoint });
  }
}

/**
 * M-2, M-3: Record HTTP request completion
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationSeconds: number,
  requestSize?: number,
  responseSize?: number
): void {
  // Normalize path to prevent high cardinality
  const normalizedPath = normalizePath(path);
  
  // M-2: Record request count
  httpRequestsTotal.inc({ 
    method, 
    path: normalizedPath, 
    status_code: statusCode.toString() 
  });
  
  // M-3: Record duration
  httpRequestDuration.observe({ 
    method, 
    path: normalizedPath, 
    status_code: statusCode.toString() 
  }, durationSeconds);
  
  // Record sizes if provided
  if (requestSize !== undefined) {
    httpRequestSize.observe({ method, path: normalizedPath }, requestSize);
  }
  
  if (responseSize !== undefined) {
    httpResponseSize.observe({ 
      method, 
      path: normalizedPath, 
      status_code: statusCode.toString() 
    }, responseSize);
  }
  
  // M-4: Record errors
  if (statusCode >= 400) {
    httpErrorsTotal.inc({ 
      method, 
      path: normalizedPath, 
      status_code: statusCode.toString(),
      error_code: statusCode >= 500 ? 'server_error' : 'client_error'
    });
  }
}

/**
 * M-4: Record application error
 */
export function recordError(
  type: string,
  code: string,
  path?: string
): void {
  errorsTotal.inc({ type, code, path: path || 'unknown' });
}

/**
 * Normalize path to prevent high cardinality labels
 * Replaces UUIDs, IDs, and numbers with placeholders
 */
function normalizePath(path: string): string {
  return path
    // Remove query string
    .split('?')[0]
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace Stripe IDs (pi_, re_, ch_, etc.)
    .replace(/\b(pi|re|ch|cus|acct|sub|in|pm|src|tok|tr|po|ba|bt|card|file)_[a-zA-Z0-9]+/g, ':stripe_id')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Clean up trailing slashes
    .replace(/\/+$/, '');
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  normalizePath,
};
