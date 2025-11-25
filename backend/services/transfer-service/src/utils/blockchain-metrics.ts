import { Counter, Histogram, register } from 'prom-client';

/**
 * BLOCKCHAIN METRICS
 * 
 * Prometheus metrics for blockchain operations
 */

// Transfer metrics
const transferSuccessCounter = new Counter({
  name: 'blockchain_transfers_success_total',
  help: 'Total number of successful blockchain transfers',
  registers: [register]
});

const transferFailureCounter = new Counter({
  name: 'blockchain_transfers_failure_total',
  help: 'Total number of failed blockchain transfers',
  labelNames: ['reason'],
  registers: [register]
});

const transferDurationHistogram = new Histogram({
  name: 'blockchain_transfer_duration_ms',
  help: 'Duration of blockchain transfers in milliseconds',
  buckets: [100, 500, 1000, 2000, 5000, 10000, 30000, 60000],
  registers: [register]
});

// Confirmation metrics
const confirmationTimeHistogram = new Histogram({
  name: 'blockchain_confirmation_time_ms',
  help: 'Time to confirm blockchain transactions in milliseconds',
  buckets: [1000, 2000, 5000, 10000, 20000, 30000, 60000],
  registers: [register]
});

const confirmationFailureCounter = new Counter({
  name: 'blockchain_confirmation_timeout_total',
  help: 'Total number of confirmation timeouts',
  registers: [register]
});

// RPC metrics
const rpcCallCounter = new Counter({
  name: 'blockchain_rpc_calls_total',
  help: 'Total number of RPC calls to Solana',
  labelNames: ['method'],
  registers: [register]
});

const rpcErrorCounter = new Counter({
  name: 'blockchain_rpc_errors_total',
  help: 'Total number of RPC errors',
  labelNames: ['method', 'error_type'],
  registers: [register]
});

class BlockchainMetrics {
  recordTransferSuccess(durationMs: number): void {
    transferSuccessCounter.inc();
    transferDurationHistogram.observe(durationMs);
  }

  recordTransferFailure(reason: string): void {
    transferFailureCounter.labels(reason).inc();
  }

  recordConfirmationTime(durationMs: number): void {
    confirmationTimeHistogram.observe(durationMs);
  }

  recordConfirmationTimeout(): void {
    confirmationFailureCounter.inc();
  }

  recordRPCCall(method: string): void {
    rpcCallCounter.labels(method).inc();
  }

  recordRPCError(method: string, errorType: string): void {
    rpcErrorCounter.labels(method, errorType).inc();
  }
}

export const blockchainMetrics = new BlockchainMetrics();
