import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// ===== RPC METRICS =====

export const rpcRequestsTotal = new Counter({
  name: 'blockchain_rpc_requests_total',
  help: 'Total number of RPC requests',
  labelNames: ['method', 'status', 'endpoint'],
  registers: [register]
});

export const rpcRequestDuration = new Histogram({
  name: 'blockchain_rpc_request_duration_seconds',
  help: 'Duration of RPC requests in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const rpcFailuresTotal = new Counter({
  name: 'blockchain_rpc_failures_total',
  help: 'Total number of RPC failures',
  labelNames: ['method', 'error', 'endpoint'],
  registers: [register]
});

export const rpcHealthStatus = new Gauge({
  name: 'blockchain_rpc_health_status',
  help: 'Health status of RPC endpoints (1 = healthy, 0 = unhealthy)',
  labelNames: ['endpoint'],
  registers: [register]
});

export const rpcLatency = new Gauge({
  name: 'blockchain_rpc_latency_ms',
  help: 'Current latency to RPC endpoint in milliseconds',
  labelNames: ['endpoint'],
  registers: [register]
});

// ===== TRANSACTION METRICS =====

export const transactionsSubmitted = new Counter({
  name: 'blockchain_transactions_submitted_total',
  help: 'Total number of transactions submitted',
  labelNames: ['type'],
  registers: [register]
});

export const transactionsConfirmed = new Counter({
  name: 'blockchain_transactions_confirmed_total',
  help: 'Total number of transactions confirmed',
  labelNames: ['type'],
  registers: [register]
});

export const transactionsFailed = new Counter({
  name: 'blockchain_transactions_failed_total',
  help: 'Total number of failed transactions',
  labelNames: ['type', 'reason'],
  registers: [register]
});

export const transactionConfirmationTime = new Histogram({
  name: 'blockchain_transaction_confirmation_seconds',
  help: 'Time taken to confirm transactions',
  labelNames: ['type'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

// ===== MINT METRICS =====

export const mintsInitiated = new Counter({
  name: 'blockchain_mints_initiated_total',
  help: 'Total number of mint operations initiated',
  registers: [register]
});

export const mintsCompleted = new Counter({
  name: 'blockchain_mints_completed_total',
  help: 'Total number of successfully completed mints',
  registers: [register]
});

export const mintsFailed = new Counter({
  name: 'blockchain_mints_failed_total',
  help: 'Total number of failed mint operations',
  labelNames: ['reason'],
  registers: [register]
});

export const mintDuration = new Histogram({
  name: 'blockchain_mint_duration_seconds',
  help: 'Duration of mint operations',
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [register]
});

// ===== WALLET METRICS =====

export const treasuryBalance = new Gauge({
  name: 'blockchain_treasury_balance_sol',
  help: 'Current treasury wallet balance in SOL',
  registers: [register]
});

export const treasuryBalanceChecks = new Counter({
  name: 'blockchain_treasury_balance_checks_total',
  help: 'Total number of treasury balance checks',
  registers: [register]
});

export const lowBalanceAlerts = new Counter({
  name: 'blockchain_low_balance_alerts_total',
  help: 'Total number of low balance alerts triggered',
  registers: [register]
});

// ===== RETRY & CIRCUIT BREAKER METRICS =====

export const retryAttempts = new Counter({
  name: 'blockchain_retry_attempts_total',
  help: 'Total number of retry attempts',
  labelNames: ['operation', 'attempt'],
  registers: [register]
});

export const circuitBreakerState = new Gauge({
  name: 'blockchain_circuit_breaker_state',
  help: 'Circuit breaker state (0 = closed, 1 = open, 2 = half-open)',
  labelNames: ['operation'],
  registers: [register]
});

export const circuitBreakerTrips = new Counter({
  name: 'blockchain_circuit_breaker_trips_total',
  help: 'Total number of circuit breaker trips',
  labelNames: ['operation'],
  registers: [register]
});

// ===== QUEUE METRICS =====

export const queueJobsAdded = new Counter({
  name: 'blockchain_queue_jobs_added_total',
  help: 'Total number of jobs added to queues',
  labelNames: ['queue'],
  registers: [register]
});

export const queueJobsCompleted = new Counter({
  name: 'blockchain_queue_jobs_completed_total',
  help: 'Total number of completed queue jobs',
  labelNames: ['queue'],
  registers: [register]
});

export const queueJobsFailed = new Counter({
  name: 'blockchain_queue_jobs_failed_total',
  help: 'Total number of failed queue jobs',
  labelNames: ['queue', 'reason'],
  registers: [register]
});

export const queueSize = new Gauge({
  name: 'blockchain_queue_size',
  help: 'Current size of queue',
  labelNames: ['queue', 'status'],
  registers: [register]
});

export const queueJobDuration = new Histogram({
  name: 'blockchain_queue_job_duration_seconds',
  help: 'Duration of queue job processing',
  labelNames: ['queue'],
  buckets: [0.5, 1, 5, 10, 30, 60, 120],
  registers: [register]
});

// ===== API METRICS =====

export const httpRequestsTotal = new Counter({
  name: 'blockchain_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const httpRequestDuration = new Histogram({
  name: 'blockchain_http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// ===== CACHE METRICS =====

export const cacheHits = new Counter({
  name: 'blockchain_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register]
});

export const cacheMisses = new Counter({
  name: 'blockchain_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register]
});

export const cacheSize = new Gauge({
  name: 'blockchain_cache_size',
  help: 'Current size of cache',
  labelNames: ['cache_type'],
  registers: [register]
});

// ===== SYSTEM METRICS =====

export const serviceUptime = new Gauge({
  name: 'blockchain_service_uptime_seconds',
  help: 'Service uptime in seconds',
  registers: [register]
});

export const activeConnections = new Gauge({
  name: 'blockchain_active_connections',
  help: 'Number of active connections',
  registers: [register]
});

// Helper function to record request metrics
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
) {
  httpRequestsTotal.inc({ method, route, status_code: statusCode });
  httpRequestDuration.observe({ method, route }, durationSeconds);
}

// Helper function to record RPC request
export function recordRpcRequest(
  method: string,
  endpoint: string,
  status: 'success' | 'failure',
  durationSeconds: number,
  error?: string
) {
  rpcRequestsTotal.inc({ method, status, endpoint });
  rpcRequestDuration.observe({ method, endpoint }, durationSeconds);
  
  if (status === 'failure' && error) {
    rpcFailuresTotal.inc({ method, error, endpoint });
  }
}

// Helper function to track mint operation
export function trackMintOperation(
  status: 'initiated' | 'completed' | 'failed',
  durationSeconds?: number,
  reason?: string
) {
  if (status === 'initiated') {
    mintsInitiated.inc();
  } else if (status === 'completed') {
    mintsCompleted.inc();
    if (durationSeconds !== undefined) {
      mintDuration.observe(durationSeconds);
    }
  } else if (status === 'failed') {
    mintsFailed.inc({ reason: reason || 'unknown' });
  }
}

// Initialize service uptime tracking
const startTime = Date.now();
setInterval(() => {
  serviceUptime.set((Date.now() - startTime) / 1000);
}, 10000); // Update every 10 seconds

export default register;
