import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register, prefix: 'blockchain_indexer_' });

// Indexing metrics
export const transactionsProcessedTotal = new Counter({
  name: 'blockchain_indexer_transactions_processed_total',
  help: 'Total number of transactions processed',
  labelNames: ['instruction_type', 'status'],
  registers: [register]
});

export const blocksProcessedTotal = new Counter({
  name: 'blockchain_indexer_blocks_processed_total',
  help: 'Total number of blocks processed',
  registers: [register]
});

export const currentSlot = new Gauge({
  name: 'blockchain_indexer_current_slot',
  help: 'Current Solana slot being processed',
  registers: [register]
});

export const indexerLag = new Gauge({
  name: 'blockchain_indexer_lag_slots',
  help: 'Number of slots behind the current blockchain tip',
  registers: [register]
});

export const lastProcessedSlot = new Gauge({
  name: 'blockchain_indexer_last_processed_slot',
  help: 'Last successfully processed slot',
  registers: [register]
});

// Performance metrics
export const transactionProcessingDuration = new Histogram({
  name: 'blockchain_indexer_transaction_processing_duration_seconds',
  help: 'Time taken to process a transaction',
  labelNames: ['instruction_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

export const rpcCallDuration = new Histogram({
  name: 'blockchain_indexer_rpc_call_duration_seconds',
  help: 'Duration of RPC calls to Solana',
  labelNames: ['method'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const databaseWriteDuration = new Histogram({
  name: 'blockchain_indexer_database_write_duration_seconds',
  help: 'Duration of database write operations',
  labelNames: ['database', 'operation'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

// Error metrics
export const rpcErrorsTotal = new Counter({
  name: 'blockchain_indexer_rpc_errors_total',
  help: 'Total number of RPC errors',
  labelNames: ['error_type'],
  registers: [register]
});

export const databaseErrorsTotal = new Counter({
  name: 'blockchain_indexer_database_errors_total',
  help: 'Total number of database errors',
  labelNames: ['database', 'operation'],
  registers: [register]
});

export const processingErrorsTotal = new Counter({
  name: 'blockchain_indexer_processing_errors_total',
  help: 'Total number of transaction processing errors',
  labelNames: ['error_type'],
  registers: [register]
});

// MongoDB metrics
export const mongodbWrites = new Counter({
  name: 'blockchain_indexer_mongodb_writes_total',
  help: 'Total number of MongoDB write operations',
  labelNames: ['collection', 'status'],
  registers: [register]
});

// PostgreSQL metrics
export const postgresqlQueries = new Counter({
  name: 'blockchain_indexer_postgresql_queries_total',
  help: 'Total number of PostgreSQL queries',
  labelNames: ['operation', 'status'],
  registers: [register]
});

// Reconciliation metrics
export const reconciliationRuns = new Counter({
  name: 'blockchain_indexer_reconciliation_runs_total',
  help: 'Total number of reconciliation runs',
  labelNames: ['status'],
  registers: [register]
});

export const discrepanciesFound = new Counter({
  name: 'blockchain_indexer_discrepancies_found_total',
  help: 'Total number of discrepancies found during reconciliation',
  labelNames: ['discrepancy_type'],
  registers: [register]
});

// Health metrics
export const indexerUptime = new Gauge({
  name: 'blockchain_indexer_uptime_seconds',
  help: 'Time since indexer started',
  registers: [register]
});

export const isHealthy = new Gauge({
  name: 'blockchain_indexer_is_healthy',
  help: 'Whether the indexer is healthy (1) or not (0)',
  registers: [register]
});

// Start time for uptime calculation
const startTime = Date.now();

export function updateUptimeMetric(): void {
  const uptimeSeconds = (Date.now() - startTime) / 1000;
  indexerUptime.set(uptimeSeconds);
}

// Update uptime every 60 seconds
setInterval(updateUptimeMetric, 60000);

// =============================================================================
// JOB METRICS
// AUDIT FIX: BG-6 - Add job metrics beyond basic counts
// =============================================================================

export const jobsStarted = new Counter({
  name: 'blockchain_indexer_jobs_started_total',
  help: 'Total number of jobs started',
  labelNames: ['job_type'],
  registers: [register]
});

export const jobsCompleted = new Counter({
  name: 'blockchain_indexer_jobs_completed_total',
  help: 'Total number of jobs completed',
  labelNames: ['job_type', 'status'],
  registers: [register]
});

export const jobDuration = new Histogram({
  name: 'blockchain_indexer_job_duration_seconds',
  help: 'Duration of jobs in seconds',
  labelNames: ['job_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

export const activeJobs = new Gauge({
  name: 'blockchain_indexer_active_jobs',
  help: 'Number of currently active jobs',
  labelNames: ['job_type'],
  registers: [register]
});

export const jobRetries = new Counter({
  name: 'blockchain_indexer_job_retries_total',
  help: 'Total number of job retries',
  labelNames: ['job_type'],
  registers: [register]
});

export const jobQueueSize = new Gauge({
  name: 'blockchain_indexer_job_queue_size',
  help: 'Number of jobs waiting in queue',
  labelNames: ['job_type'],
  registers: [register]
});

export const jobDeadLetterQueue = new Counter({
  name: 'blockchain_indexer_job_dlq_total',
  help: 'Total number of jobs sent to dead letter queue',
  labelNames: ['job_type', 'error_type'],
  registers: [register]
});

export const jobProcessingLag = new Gauge({
  name: 'blockchain_indexer_job_processing_lag_seconds',
  help: 'Time between job creation and processing start',
  labelNames: ['job_type'],
  registers: [register]
});

/**
 * Helper functions for job metrics
 * AUDIT FIX: BG-6 - Convenience functions for job instrumentation
 */
export const JobMetrics = {
  /**
   * Record job start
   */
  recordJobStart(jobType: string): void {
    jobsStarted.inc({ job_type: jobType });
    activeJobs.inc({ job_type: jobType });
  },

  /**
   * Record job completion
   */
  recordJobComplete(jobType: string, success: boolean, durationMs: number): void {
    activeJobs.dec({ job_type: jobType });
    jobsCompleted.inc({ job_type: jobType, status: success ? 'success' : 'failure' });
    jobDuration.observe({ job_type: jobType }, durationMs / 1000);
  },

  /**
   * Record job retry
   */
  recordJobRetry(jobType: string): void {
    jobRetries.inc({ job_type: jobType });
  },

  /**
   * Record job sent to DLQ
   */
  recordJobDLQ(jobType: string, errorType: string): void {
    jobDeadLetterQueue.inc({ job_type: jobType, error_type: errorType });
  },

  /**
   * Update queue size
   */
  updateQueueSize(jobType: string, size: number): void {
    jobQueueSize.set({ job_type: jobType }, size);
  },

  /**
   * Record processing lag
   */
  recordProcessingLag(jobType: string, lagMs: number): void {
    jobProcessingLag.set({ job_type: jobType }, lagMs / 1000);
  },

  /**
   * Create a job timer that returns a function to call on completion
   */
  startJobTimer(jobType: string): () => void {
    const startTime = Date.now();
    jobsStarted.inc({ job_type: jobType });
    activeJobs.inc({ job_type: jobType });
    
    return (success: boolean = true) => {
      const duration = Date.now() - startTime;
      activeJobs.dec({ job_type: jobType });
      jobsCompleted.inc({ job_type: jobType, status: success ? 'success' : 'failure' });
      jobDuration.observe({ job_type: jobType }, duration / 1000);
    };
  }
};
