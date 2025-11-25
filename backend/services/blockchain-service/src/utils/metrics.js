"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeConnections = exports.serviceUptime = exports.cacheSize = exports.cacheMisses = exports.cacheHits = exports.httpRequestDuration = exports.httpRequestsTotal = exports.queueJobDuration = exports.queueSize = exports.queueJobsFailed = exports.queueJobsCompleted = exports.queueJobsAdded = exports.circuitBreakerTrips = exports.circuitBreakerState = exports.retryAttempts = exports.lowBalanceAlerts = exports.treasuryBalanceChecks = exports.treasuryBalance = exports.mintDuration = exports.mintsFailed = exports.mintsCompleted = exports.mintsInitiated = exports.transactionConfirmationTime = exports.transactionsFailed = exports.transactionsConfirmed = exports.transactionsSubmitted = exports.rpcLatency = exports.rpcHealthStatus = exports.rpcFailuresTotal = exports.rpcRequestDuration = exports.rpcRequestsTotal = exports.register = void 0;
exports.recordHttpRequest = recordHttpRequest;
exports.recordRpcRequest = recordRpcRequest;
exports.trackMintOperation = trackMintOperation;
const prom_client_1 = require("prom-client");
exports.register = new prom_client_1.Registry();
exports.rpcRequestsTotal = new prom_client_1.Counter({
    name: 'blockchain_rpc_requests_total',
    help: 'Total number of RPC requests',
    labelNames: ['method', 'status', 'endpoint'],
    registers: [exports.register]
});
exports.rpcRequestDuration = new prom_client_1.Histogram({
    name: 'blockchain_rpc_request_duration_seconds',
    help: 'Duration of RPC requests in seconds',
    labelNames: ['method', 'endpoint'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [exports.register]
});
exports.rpcFailuresTotal = new prom_client_1.Counter({
    name: 'blockchain_rpc_failures_total',
    help: 'Total number of RPC failures',
    labelNames: ['method', 'error', 'endpoint'],
    registers: [exports.register]
});
exports.rpcHealthStatus = new prom_client_1.Gauge({
    name: 'blockchain_rpc_health_status',
    help: 'Health status of RPC endpoints (1 = healthy, 0 = unhealthy)',
    labelNames: ['endpoint'],
    registers: [exports.register]
});
exports.rpcLatency = new prom_client_1.Gauge({
    name: 'blockchain_rpc_latency_ms',
    help: 'Current latency to RPC endpoint in milliseconds',
    labelNames: ['endpoint'],
    registers: [exports.register]
});
exports.transactionsSubmitted = new prom_client_1.Counter({
    name: 'blockchain_transactions_submitted_total',
    help: 'Total number of transactions submitted',
    labelNames: ['type'],
    registers: [exports.register]
});
exports.transactionsConfirmed = new prom_client_1.Counter({
    name: 'blockchain_transactions_confirmed_total',
    help: 'Total number of transactions confirmed',
    labelNames: ['type'],
    registers: [exports.register]
});
exports.transactionsFailed = new prom_client_1.Counter({
    name: 'blockchain_transactions_failed_total',
    help: 'Total number of failed transactions',
    labelNames: ['type', 'reason'],
    registers: [exports.register]
});
exports.transactionConfirmationTime = new prom_client_1.Histogram({
    name: 'blockchain_transaction_confirmation_seconds',
    help: 'Time taken to confirm transactions',
    labelNames: ['type'],
    buckets: [1, 5, 10, 30, 60, 120, 300],
    registers: [exports.register]
});
exports.mintsInitiated = new prom_client_1.Counter({
    name: 'blockchain_mints_initiated_total',
    help: 'Total number of mint operations initiated',
    registers: [exports.register]
});
exports.mintsCompleted = new prom_client_1.Counter({
    name: 'blockchain_mints_completed_total',
    help: 'Total number of successfully completed mints',
    registers: [exports.register]
});
exports.mintsFailed = new prom_client_1.Counter({
    name: 'blockchain_mints_failed_total',
    help: 'Total number of failed mint operations',
    labelNames: ['reason'],
    registers: [exports.register]
});
exports.mintDuration = new prom_client_1.Histogram({
    name: 'blockchain_mint_duration_seconds',
    help: 'Duration of mint operations',
    buckets: [1, 5, 10, 30, 60, 120],
    registers: [exports.register]
});
exports.treasuryBalance = new prom_client_1.Gauge({
    name: 'blockchain_treasury_balance_sol',
    help: 'Current treasury wallet balance in SOL',
    registers: [exports.register]
});
exports.treasuryBalanceChecks = new prom_client_1.Counter({
    name: 'blockchain_treasury_balance_checks_total',
    help: 'Total number of treasury balance checks',
    registers: [exports.register]
});
exports.lowBalanceAlerts = new prom_client_1.Counter({
    name: 'blockchain_low_balance_alerts_total',
    help: 'Total number of low balance alerts triggered',
    registers: [exports.register]
});
exports.retryAttempts = new prom_client_1.Counter({
    name: 'blockchain_retry_attempts_total',
    help: 'Total number of retry attempts',
    labelNames: ['operation', 'attempt'],
    registers: [exports.register]
});
exports.circuitBreakerState = new prom_client_1.Gauge({
    name: 'blockchain_circuit_breaker_state',
    help: 'Circuit breaker state (0 = closed, 1 = open, 2 = half-open)',
    labelNames: ['operation'],
    registers: [exports.register]
});
exports.circuitBreakerTrips = new prom_client_1.Counter({
    name: 'blockchain_circuit_breaker_trips_total',
    help: 'Total number of circuit breaker trips',
    labelNames: ['operation'],
    registers: [exports.register]
});
exports.queueJobsAdded = new prom_client_1.Counter({
    name: 'blockchain_queue_jobs_added_total',
    help: 'Total number of jobs added to queues',
    labelNames: ['queue'],
    registers: [exports.register]
});
exports.queueJobsCompleted = new prom_client_1.Counter({
    name: 'blockchain_queue_jobs_completed_total',
    help: 'Total number of completed queue jobs',
    labelNames: ['queue'],
    registers: [exports.register]
});
exports.queueJobsFailed = new prom_client_1.Counter({
    name: 'blockchain_queue_jobs_failed_total',
    help: 'Total number of failed queue jobs',
    labelNames: ['queue', 'reason'],
    registers: [exports.register]
});
exports.queueSize = new prom_client_1.Gauge({
    name: 'blockchain_queue_size',
    help: 'Current size of queue',
    labelNames: ['queue', 'status'],
    registers: [exports.register]
});
exports.queueJobDuration = new prom_client_1.Histogram({
    name: 'blockchain_queue_job_duration_seconds',
    help: 'Duration of queue job processing',
    labelNames: ['queue'],
    buckets: [0.5, 1, 5, 10, 30, 60, 120],
    registers: [exports.register]
});
exports.httpRequestsTotal = new prom_client_1.Counter({
    name: 'blockchain_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [exports.register]
});
exports.httpRequestDuration = new prom_client_1.Histogram({
    name: 'blockchain_http_request_duration_seconds',
    help: 'Duration of HTTP requests',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [exports.register]
});
exports.cacheHits = new prom_client_1.Counter({
    name: 'blockchain_cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type'],
    registers: [exports.register]
});
exports.cacheMisses = new prom_client_1.Counter({
    name: 'blockchain_cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_type'],
    registers: [exports.register]
});
exports.cacheSize = new prom_client_1.Gauge({
    name: 'blockchain_cache_size',
    help: 'Current size of cache',
    labelNames: ['cache_type'],
    registers: [exports.register]
});
exports.serviceUptime = new prom_client_1.Gauge({
    name: 'blockchain_service_uptime_seconds',
    help: 'Service uptime in seconds',
    registers: [exports.register]
});
exports.activeConnections = new prom_client_1.Gauge({
    name: 'blockchain_active_connections',
    help: 'Number of active connections',
    registers: [exports.register]
});
function recordHttpRequest(method, route, statusCode, durationSeconds) {
    exports.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    exports.httpRequestDuration.observe({ method, route }, durationSeconds);
}
function recordRpcRequest(method, endpoint, status, durationSeconds, error) {
    exports.rpcRequestsTotal.inc({ method, status, endpoint });
    exports.rpcRequestDuration.observe({ method, endpoint }, durationSeconds);
    if (status === 'failure' && error) {
        exports.rpcFailuresTotal.inc({ method, error, endpoint });
    }
}
function trackMintOperation(status, durationSeconds, reason) {
    if (status === 'initiated') {
        exports.mintsInitiated.inc();
    }
    else if (status === 'completed') {
        exports.mintsCompleted.inc();
        if (durationSeconds !== undefined) {
            exports.mintDuration.observe(durationSeconds);
        }
    }
    else if (status === 'failed') {
        exports.mintsFailed.inc({ reason: reason || 'unknown' });
    }
}
const startTime = Date.now();
setInterval(() => {
    exports.serviceUptime.set((Date.now() - startTime) / 1000);
}, 10000);
exports.default = exports.register;
//# sourceMappingURL=metrics.js.map