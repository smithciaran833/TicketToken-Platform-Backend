import promClient from 'prom-client';
import logger from './logger';

// Create registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Business Metrics
export const mintsTotal = new promClient.Counter({
  name: 'mints_total',
  help: 'Total number of mint attempts',
  labelNames: ['status', 'tenant_id'],
  registers: [register]
});

export const mintsSuccessTotal = new promClient.Counter({
  name: 'mints_success_total',
  help: 'Total number of successful mints',
  labelNames: ['tenant_id'],
  registers: [register]
});

export const mintsFailedTotal = new promClient.Counter({
  name: 'mints_failed_total',
  help: 'Total number of failed mints',
  labelNames: ['reason', 'tenant_id'],
  registers: [register]
});

export const mintDuration = new promClient.Histogram({
  name: 'mint_duration_seconds',
  help: 'Duration of mint operations in seconds',
  labelNames: ['tenant_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register]
});

export const ipfsUploadDuration = new promClient.Histogram({
  name: 'ipfs_upload_duration_seconds',
  help: 'Duration of IPFS upload operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const solanaTxConfirmationDuration = new promClient.Histogram({
  name: 'solana_tx_confirmation_duration_seconds',
  help: 'Duration of Solana transaction confirmation in seconds',
  buckets: [1, 5, 10, 20, 30, 60, 120],
  registers: [register]
});

// Resource Metrics
export const queueDepth = new promClient.Gauge({
  name: 'queue_depth',
  help: 'Current depth of the minting queue',
  registers: [register]
});

export const walletBalanceSOL = new promClient.Gauge({
  name: 'wallet_balance_sol',
  help: 'Current wallet balance in SOL',
  registers: [register]
});

export const activeWorkers = new promClient.Gauge({
  name: 'active_workers',
  help: 'Number of active minting workers',
  registers: [register]
});

export const databaseConnections = new promClient.Gauge({
  name: 'database_connections',
  help: 'Number of active database connections',
  registers: [register]
});

// Error Metrics
export const errors = new promClient.Counter({
  name: 'errors_total',
  help: 'Total number of errors by type',
  labelNames: ['error_type', 'service'],
  registers: [register]
});

// API Metrics
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Export registry for /metrics endpoint
export { register };

// Helper function to start timer
export function startTimer(histogram: promClient.Histogram<string>) {
  return histogram.startTimer();
}

// Log metrics initialization
logger.info('Prometheus metrics initialized');

// Cache Metrics
export const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  registers: [register]
});

export const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  registers: [register]
});

// System Health Gauge
export const systemHealth = new promClient.Gauge({
  name: 'system_health',
  help: 'System health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'],
  registers: [register]
});

// Helper functions
export function updateSystemHealth(component: string, isHealthy: boolean): void {
  systemHealth.set({ component }, isHealthy ? 1 : 0);
}

export function recordMintSuccess(tenantId: string, _duration?: number): void {
  mintsSuccessTotal.inc({ tenant_id: tenantId });
}

export function recordMintFailure(reason: string, tenantId: string): void {
  mintsFailedTotal.inc({ reason, tenant_id: tenantId });
}

export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

export async function getMetricsJSON(): Promise<object> {
  return await register.getMetricsAsJSON();
}
