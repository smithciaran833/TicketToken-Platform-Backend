"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockchainMetrics = void 0;
const prom_client_1 = require("prom-client");
const mintSuccessCounter = new prom_client_1.Counter({
    name: 'blockchain_mints_success_total',
    help: 'Total number of successful NFT mints',
    registers: [prom_client_1.register]
});
const mintFailureCounter = new prom_client_1.Counter({
    name: 'blockchain_mints_failure_total',
    help: 'Total number of failed NFT mints',
    labelNames: ['reason'],
    registers: [prom_client_1.register]
});
const mintDurationHistogram = new prom_client_1.Histogram({
    name: 'blockchain_mint_duration_ms',
    help: 'Duration of NFT mints in milliseconds',
    buckets: [1000, 5000, 10000, 30000, 60000, 120000],
    registers: [prom_client_1.register]
});
const metadataUploadCounter = new prom_client_1.Counter({
    name: 'blockchain_metadata_uploads_total',
    help: 'Total number of metadata uploads to Arweave',
    labelNames: ['status'],
    registers: [prom_client_1.register]
});
const metadataUploadDurationHistogram = new prom_client_1.Histogram({
    name: 'blockchain_metadata_upload_duration_ms',
    help: 'Duration of metadata uploads in milliseconds',
    buckets: [500, 1000, 5000, 10000, 30000],
    registers: [prom_client_1.register]
});
const collectionCreationCounter = new prom_client_1.Counter({
    name: 'blockchain_collections_created_total',
    help: 'Total number of collections created',
    registers: [prom_client_1.register]
});
const collectionVerificationCounter = new prom_client_1.Counter({
    name: 'blockchain_collection_verifications_total',
    help: 'Total number of collection verifications',
    labelNames: ['status'],
    registers: [prom_client_1.register]
});
const rpcCallCounter = new prom_client_1.Counter({
    name: 'blockchain_rpc_calls_total',
    help: 'Total number of RPC calls to Solana',
    labelNames: ['method'],
    registers: [prom_client_1.register]
});
const rpcErrorCounter = new prom_client_1.Counter({
    name: 'blockchain_rpc_errors_total',
    help: 'Total number of RPC errors',
    labelNames: ['method', 'error_type'],
    registers: [prom_client_1.register]
});
const queueJobCounter = new prom_client_1.Counter({
    name: 'blockchain_queue_jobs_total',
    help: 'Total number of queue jobs processed',
    labelNames: ['queue', 'status'],
    registers: [prom_client_1.register]
});
const queueJobDurationHistogram = new prom_client_1.Histogram({
    name: 'blockchain_queue_job_duration_ms',
    help: 'Duration of queue job processing in milliseconds',
    labelNames: ['queue'],
    buckets: [100, 500, 1000, 5000, 10000, 30000, 60000],
    registers: [prom_client_1.register]
});
class BlockchainMetrics {
    recordMintSuccess(durationMs) {
        mintSuccessCounter.inc();
        mintDurationHistogram.observe(durationMs);
    }
    recordMintFailure(reason) {
        mintFailureCounter.labels(reason).inc();
    }
    recordMetadataUpload(status, durationMs) {
        metadataUploadCounter.labels(status).inc();
        if (status === 'success' && durationMs !== undefined) {
            metadataUploadDurationHistogram.observe(durationMs);
        }
    }
    recordCollectionCreation() {
        collectionCreationCounter.inc();
    }
    recordCollectionVerification(status) {
        collectionVerificationCounter.labels(status).inc();
    }
    recordRPCCall(method) {
        rpcCallCounter.labels(method).inc();
    }
    recordRPCError(method, errorType) {
        rpcErrorCounter.labels(method, errorType).inc();
    }
    recordQueueJob(queue, status, durationMs) {
        queueJobCounter.labels(queue, status).inc();
        if (durationMs !== undefined) {
            queueJobDurationHistogram.labels(queue).observe(durationMs);
        }
    }
}
exports.blockchainMetrics = new BlockchainMetrics();
//# sourceMappingURL=blockchain-metrics.js.map