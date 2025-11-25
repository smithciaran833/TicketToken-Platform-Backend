import { Counter, Histogram, register } from 'prom-client';

/**
 * BLOCKCHAIN METRICS
 * 
 * Prometheus metrics for blockchain minting operations
 */

// Mint metrics
const mintSuccessCounter = new Counter({
  name: 'blockchain_mints_success_total',
  help: 'Total number of successful NFT mints',
  registers: [register]
});

const mintFailureCounter = new Counter({
  name: 'blockchain_mints_failure_total',
  help: 'Total number of failed NFT mints',
  labelNames: ['reason'],
  registers: [register]
});

const mintDurationHistogram = new Histogram({
  name: 'blockchain_mint_duration_ms',
  help: 'Duration of NFT mints in milliseconds',
  buckets: [1000, 5000, 10000, 30000, 60000, 120000],
  registers: [register]
});

// Metadata upload metrics
const metadataUploadCounter = new Counter({
  name: 'blockchain_metadata_uploads_total',
  help: 'Total number of metadata uploads to Arweave',
  labelNames: ['status'],
  registers: [register]
});

const metadataUploadDurationHistogram = new Histogram({
  name: 'blockchain_metadata_upload_duration_ms',
  help: 'Duration of metadata uploads in milliseconds',
  buckets: [500, 1000, 5000, 10000, 30000],
  registers: [register]
});

// Collection metrics
const collectionCreationCounter = new Counter({
  name: 'blockchain_collections_created_total',
  help: 'Total number of collections created',
  registers: [register]
});

const collectionVerificationCounter = new Counter({
  name: 'blockchain_collection_verifications_total',
  help: 'Total number of collection verifications',
  labelNames: ['status'],
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

// Queue metrics
const queueJobCounter = new Counter({
  name: 'blockchain_queue_jobs_total',
  help: 'Total number of queue jobs processed',
  labelNames: ['queue', 'status'],
  registers: [register]
});

const queueJobDurationHistogram = new Histogram({
  name: 'blockchain_queue_job_duration_ms',
  help: 'Duration of queue job processing in milliseconds',
  labelNames: ['queue'],
  buckets: [100, 500, 1000, 5000, 10000, 30000, 60000],
  registers: [register]
});

class BlockchainMetrics {
  // Mint operations
  recordMintSuccess(durationMs: number): void {
    mintSuccessCounter.inc();
    mintDurationHistogram.observe(durationMs);
  }

  recordMintFailure(reason: string): void {
    mintFailureCounter.labels(reason).inc();
  }

  // Metadata uploads
  recordMetadataUpload(status: 'success' | 'failure', durationMs?: number): void {
    metadataUploadCounter.labels(status).inc();
    if (status === 'success' && durationMs !== undefined) {
      metadataUploadDurationHistogram.observe(durationMs);
    }
  }

  // Collections
  recordCollectionCreation(): void {
    collectionCreationCounter.inc();
  }

  recordCollectionVerification(status: 'success' | 'failure'): void {
    collectionVerificationCounter.labels(status).inc();
  }

  // RPC calls
  recordRPCCall(method: string): void {
    rpcCallCounter.labels(method).inc();
  }

  recordRPCError(method: string, errorType: string): void {
    rpcErrorCounter.labels(method, errorType).inc();
  }

  // Queue operations
  recordQueueJob(queue: string, status: 'completed' | 'failed', durationMs?: number): void {
    queueJobCounter.labels(queue, status).inc();
    if (durationMs !== undefined) {
      queueJobDurationHistogram.labels(queue).observe(durationMs);
    }
  }
}

export const blockchainMetrics = new BlockchainMetrics();
