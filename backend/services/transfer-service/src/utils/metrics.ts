/**
 * Prometheus Metrics for Transfer Service
 * 
 * AUDIT FIXES:
 * - MTR-M1: No Prometheus metrics → Added comprehensive metrics
 * - MTR-M2: Missing business metrics → Transfer-specific metrics
 * - MTR-M3: No blockchain metrics → Solana operation metrics
 * 
 * Features:
 * - HTTP request metrics
 * - Business metrics (transfers, acceptance rates)
 * - Blockchain operation metrics
 * - Circuit breaker metrics
 * - Cache hit/miss metrics
 */

import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import logger from './logger';

// =============================================================================
// REGISTRY SETUP
// =============================================================================

export const register = new Registry();

// Add default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register,
  prefix: 'transfer_service_',
  labels: { service: 'transfer-service' }
});

// =============================================================================
// HTTP METRICS
// =============================================================================

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
  name: 'transfer_service_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

/**
 * HTTP request counter
 */
export const httpRequestCounter = new Counter({
  name: 'transfer_service_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'],
  registers: [register]
});

/**
 * HTTP request size histogram
 */
export const httpRequestSize = new Histogram({
  name: 'transfer_service_http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [register]
});

/**
 * HTTP response size histogram
 */
export const httpResponseSize = new Histogram({
  name: 'transfer_service_http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [register]
});

// =============================================================================
// TRANSFER BUSINESS METRICS
// =============================================================================

/**
 * Transfers initiated counter
 */
export const transfersInitiated = new Counter({
  name: 'transfer_service_transfers_initiated_total',
  help: 'Total number of transfers initiated',
  labelNames: ['type', 'tenant_id'],
  registers: [register]
});

/**
 * Transfers accepted counter
 */
export const transfersAccepted = new Counter({
  name: 'transfer_service_transfers_accepted_total',
  help: 'Total number of transfers accepted',
  labelNames: ['type', 'tenant_id'],
  registers: [register]
});

/**
 * Transfers rejected counter
 */
export const transfersRejected = new Counter({
  name: 'transfer_service_transfers_rejected_total',
  help: 'Total number of transfers rejected',
  labelNames: ['type', 'tenant_id', 'reason'],
  registers: [register]
});

/**
 * Transfers cancelled counter
 */
export const transfersCancelled = new Counter({
  name: 'transfer_service_transfers_cancelled_total',
  help: 'Total number of transfers cancelled',
  labelNames: ['type', 'tenant_id', 'reason'],
  registers: [register]
});

/**
 * Transfers completed counter
 */
export const transfersCompleted = new Counter({
  name: 'transfer_service_transfers_completed_total',
  help: 'Total number of transfers completed',
  labelNames: ['type', 'tenant_id'],
  registers: [register]
});

/**
 * Transfers failed counter
 */
export const transfersFailed = new Counter({
  name: 'transfer_service_transfers_failed_total',
  help: 'Total number of transfers failed',
  labelNames: ['type', 'tenant_id', 'error_code'],
  registers: [register]
});

/**
 * Transfers expired counter
 */
export const transfersExpired = new Counter({
  name: 'transfer_service_transfers_expired_total',
  help: 'Total number of transfers expired',
  labelNames: ['type', 'tenant_id'],
  registers: [register]
});

/**
 * Transfer acceptance time histogram
 */
export const transferAcceptanceTime = new Histogram({
  name: 'transfer_service_acceptance_time_seconds',
  help: 'Time between transfer initiation and acceptance',
  labelNames: ['type', 'tenant_id'],
  buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 43200, 86400],
  registers: [register]
});

/**
 * Pending transfers gauge
 */
export const pendingTransfers = new Gauge({
  name: 'transfer_service_pending_transfers',
  help: 'Current number of pending transfers',
  labelNames: ['tenant_id'],
  registers: [register]
});

/**
 * Batch transfer size histogram
 */
export const batchTransferSize = new Histogram({
  name: 'transfer_service_batch_transfer_size',
  help: 'Number of transfers in batch operations',
  labelNames: ['tenant_id'],
  buckets: [1, 5, 10, 20, 30, 40, 50],
  registers: [register]
});

// =============================================================================
// BLOCKCHAIN METRICS
// =============================================================================

/**
 * Blockchain transfer duration histogram
 */
export const blockchainTransferDuration = new Histogram({
  name: 'transfer_service_blockchain_transfer_duration_seconds',
  help: 'Duration of blockchain NFT transfers',
  labelNames: ['status', 'endpoint'],
  buckets: [1, 2, 5, 10, 15, 30, 45, 60, 90, 120],
  registers: [register]
});

/**
 * Blockchain transfer counter
 */
export const blockchainTransfers = new Counter({
  name: 'transfer_service_blockchain_transfers_total',
  help: 'Total number of blockchain transfer attempts',
  labelNames: ['status', 'endpoint'],
  registers: [register]
});

/**
 * RPC request duration histogram
 */
export const rpcRequestDuration = new Histogram({
  name: 'transfer_service_rpc_request_duration_seconds',
  help: 'Duration of Solana RPC requests',
  labelNames: ['method', 'endpoint', 'status'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register]
});

/**
 * RPC request counter
 */
export const rpcRequests = new Counter({
  name: 'transfer_service_rpc_requests_total',
  help: 'Total number of Solana RPC requests',
  labelNames: ['method', 'endpoint', 'status'],
  registers: [register]
});

/**
 * Transaction confirmation time histogram
 */
export const txConfirmationTime = new Histogram({
  name: 'transfer_service_tx_confirmation_seconds',
  help: 'Time for transaction confirmation on Solana',
  labelNames: ['commitment_level'],
  buckets: [1, 2, 5, 10, 15, 30, 45, 60],
  registers: [register]
});

/**
 * Priority fee paid histogram
 */
export const priorityFeePaid = new Histogram({
  name: 'transfer_service_priority_fee_lamports',
  help: 'Priority fee paid for transactions',
  labelNames: ['tenant_id'],
  buckets: [0, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [register]
});

// =============================================================================
// CIRCUIT BREAKER METRICS
// =============================================================================

/**
 * Circuit breaker state gauge
 */
export const circuitBreakerState = new Gauge({
  name: 'transfer_service_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['name'],
  registers: [register]
});

/**
 * Circuit breaker trips counter
 */
export const circuitBreakerTrips = new Counter({
  name: 'transfer_service_circuit_breaker_trips_total',
  help: 'Total number of circuit breaker trips',
  labelNames: ['name'],
  registers: [register]
});

// =============================================================================
// CACHE METRICS
// =============================================================================

/**
 * Cache operations counter
 */
export const cacheOperations = new Counter({
  name: 'transfer_service_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'status'],
  registers: [register]
});

/**
 * Cache hit rate gauge
 */
export const cacheHitRate = new Gauge({
  name: 'transfer_service_cache_hit_rate',
  help: 'Cache hit rate (0-1)',
  labelNames: ['cache_name'],
  registers: [register]
});

// =============================================================================
// DATABASE METRICS
// =============================================================================

/**
 * Database query duration histogram
 */
export const dbQueryDuration = new Histogram({
  name: 'transfer_service_db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

/**
 * Database pool size gauge
 */
export const dbPoolSize = new Gauge({
  name: 'transfer_service_db_pool_size',
  help: 'Current database connection pool size',
  labelNames: ['state'],
  registers: [register]
});

// =============================================================================
// RATE LIMITING METRICS
// =============================================================================

/**
 * Rate limit hits counter
 */
export const rateLimitHits = new Counter({
  name: 'transfer_service_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['route', 'tenant_id'],
  registers: [register]
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number,
  tenantId?: string
): void {
  const labels = {
    method,
    route,
    status_code: String(statusCode),
    tenant_id: tenantId || 'unknown'
  };
  
  httpRequestDuration.observe(labels, durationSeconds);
  httpRequestCounter.inc(labels);
}

/**
 * Record transfer event
 */
export function recordTransferEvent(
  event: 'initiated' | 'accepted' | 'rejected' | 'cancelled' | 'completed' | 'failed' | 'expired',
  transferType: string,
  tenantId: string,
  extraLabels?: Record<string, string>
): void {
  const baseLabels = { type: transferType, tenant_id: tenantId };
  
  switch (event) {
    case 'initiated':
      transfersInitiated.inc(baseLabels);
      break;
    case 'accepted':
      transfersAccepted.inc(baseLabels);
      break;
    case 'rejected':
      transfersRejected.inc({ ...baseLabels, reason: extraLabels?.reason || 'unknown' });
      break;
    case 'cancelled':
      transfersCancelled.inc({ ...baseLabels, reason: extraLabels?.reason || 'unknown' });
      break;
    case 'completed':
      transfersCompleted.inc(baseLabels);
      break;
    case 'failed':
      transfersFailed.inc({ ...baseLabels, error_code: extraLabels?.error_code || 'unknown' });
      break;
    case 'expired':
      transfersExpired.inc(baseLabels);
      break;
  }
}

/**
 * Record blockchain operation
 */
export function recordBlockchainOp(
  status: 'success' | 'failure',
  endpoint: string,
  durationSeconds: number
): void {
  blockchainTransfers.inc({ status, endpoint });
  blockchainTransferDuration.observe({ status, endpoint }, durationSeconds);
}

/**
 * Record RPC request
 */
export function recordRpcRequest(
  method: string,
  endpoint: string,
  status: 'success' | 'failure',
  durationSeconds: number
): void {
  rpcRequests.inc({ method, endpoint, status });
  rpcRequestDuration.observe({ method, endpoint, status }, durationSeconds);
}

/**
 * Update circuit breaker state
 */
export function updateCircuitBreakerState(
  name: string,
  state: 'closed' | 'half_open' | 'open'
): void {
  const stateValue = state === 'closed' ? 0 : state === 'half_open' ? 1 : 2;
  circuitBreakerState.set({ name }, stateValue);
  
  if (state === 'open') {
    circuitBreakerTrips.inc({ name });
  }
}

/**
 * Record cache operation
 */
export function recordCacheOp(
  operation: 'get' | 'set' | 'delete',
  hit: boolean
): void {
  cacheOperations.inc({
    operation,
    status: operation === 'get' ? (hit ? 'hit' : 'miss') : 'success'
  });
}

// =============================================================================
// METRICS ENDPOINT HANDLER
// =============================================================================

/**
 * Get metrics for Prometheus scraping
 */
export async function getMetrics(): Promise<string> {
  try {
    return await register.metrics();
  } catch (error) {
    logger.error({ error }, 'Failed to collect metrics');
    throw error;
  }
}

/**
 * Get content type for metrics
 */
export function getContentType(): string {
  return register.contentType;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  register,
  getMetrics,
  getContentType,
  
  // HTTP metrics
  httpRequestDuration,
  httpRequestCounter,
  httpRequestSize,
  httpResponseSize,
  
  // Transfer metrics
  transfersInitiated,
  transfersAccepted,
  transfersRejected,
  transfersCancelled,
  transfersCompleted,
  transfersFailed,
  transfersExpired,
  transferAcceptanceTime,
  pendingTransfers,
  batchTransferSize,
  
  // Blockchain metrics
  blockchainTransferDuration,
  blockchainTransfers,
  rpcRequestDuration,
  rpcRequests,
  txConfirmationTime,
  priorityFeePaid,
  
  // Circuit breaker metrics
  circuitBreakerState,
  circuitBreakerTrips,
  
  // Cache metrics
  cacheOperations,
  cacheHitRate,
  
  // Database metrics
  dbQueryDuration,
  dbPoolSize,
  
  // Rate limiting metrics
  rateLimitHits,
  
  // Helper functions
  recordHttpRequest,
  recordTransferEvent,
  recordBlockchainOp,
  recordRpcRequest,
  updateCircuitBreakerState,
  recordCacheOp
};
