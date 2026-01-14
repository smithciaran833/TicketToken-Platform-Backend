import { Job } from 'bull';
import { Counter, Histogram } from 'prom-client';
import { getMintQueue, getConcurrencyLimit } from '../queues/mintQueue';
import { MintingOrchestrator } from '../services/MintingOrchestrator';
import logger from '../utils/logger';

interface MintJobData {
  ticketId: string;
  orderId: string;
  eventId: string;
  tenantId: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// WORKER METRICS
// =============================================================================

const workerJobsProcessed = new Counter({
  name: 'minting_worker_jobs_processed_total',
  help: 'Total number of jobs processed by worker',
  labelNames: ['status']
});

const workerJobDuration = new Histogram({
  name: 'minting_worker_job_duration_seconds',
  help: 'Duration of job processing in seconds',
  labelNames: ['status'],
  buckets: [1, 5, 10, 30, 60, 120, 300]
});

const workerErrorsCounter = new Counter({
  name: 'minting_worker_errors_total',
  help: 'Total number of worker-level errors',
  labelNames: ['type']
});

// =============================================================================
// ERROR CATEGORIZATION
// =============================================================================

interface CategorizedError {
  category: string;
  isRetryable: boolean;
  message: string;
  originalError: Error;
}

/**
 * Categorize errors for better monitoring and retry decisions
 */
function categorizeError(error: Error): CategorizedError {
  const message = error.message.toLowerCase();

  // Transient/retryable errors
  if (message.includes('timeout') || message.includes('econnreset') || message.includes('etimedout')) {
    return { category: 'network_timeout', isRetryable: true, message: error.message, originalError: error };
  }
  if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
    return { category: 'rate_limited', isRetryable: true, message: error.message, originalError: error };
  }
  if (message.includes('blockhash') || message.includes('block height exceeded')) {
    return { category: 'blockhash_expired', isRetryable: true, message: error.message, originalError: error };
  }
  if (message.includes('node is behind') || message.includes('slot')) {
    return { category: 'rpc_lag', isRetryable: true, message: error.message, originalError: error };
  }

  // Non-retryable errors
  if (message.includes('insufficient') || message.includes('not enough')) {
    return { category: 'insufficient_funds', isRetryable: false, message: error.message, originalError: error };
  }
  if (message.includes('invalid') || message.includes('validation')) {
    return { category: 'validation_error', isRetryable: false, message: error.message, originalError: error };
  }
  if (message.includes('already minted') || message.includes('duplicate')) {
    return { category: 'already_exists', isRetryable: false, message: error.message, originalError: error };
  }

  // Unknown errors - allow retry
  return { category: 'unknown', isRetryable: true, message: error.message, originalError: error };
}

// =============================================================================
// GLOBAL ERROR HANDLER
// =============================================================================

/**
 * Global error handler for worker
 * Logs all worker-level errors and tracks metrics
 */
function handleWorkerError(error: Error, context?: Record<string, any>): void {
  const categorized = categorizeError(error);
  
  workerErrorsCounter.inc({ type: categorized.category });
  
  logger.error('Worker error occurred', {
    errorCategory: categorized.category,
    isRetryable: categorized.isRetryable,
    message: categorized.message,
    stack: error.stack,
    ...context
  });
}

// =============================================================================
// JOB PROCESSOR
// =============================================================================

/**
 * Process a single mint job
 * Wraps the orchestrator call with error handling and metrics
 */
async function processMintJob(
  job: Job<MintJobData>,
  orchestrator: MintingOrchestrator
): Promise<any> {
  const { ticketId, orderId, eventId, tenantId, metadata } = job.data;
  const endTimer = workerJobDuration.startTimer();

  logger.info(`Processing mint job ${job.id}`, {
    jobId: job.id,
    ticketId,
    tenantId,
    eventId,
    attemptsMade: job.attemptsMade
  });

  try {
    const result = await orchestrator.mintCompressedNFT({
      ticketId,
      orderId,
      eventId,
      tenantId,
      metadata
    });

    workerJobsProcessed.inc({ status: 'success' });
    endTimer({ status: 'success' });

    logger.info(`Successfully minted ticket ${ticketId}`, {
      jobId: job.id,
      ticketId,
      tenantId,
      assetId: result.assetId,
      signature: result.signature
    });

    return result;

  } catch (error) {
    const categorized = categorizeError(error as Error);
    
    workerJobsProcessed.inc({ status: 'error' });
    workerErrorsCounter.inc({ type: categorized.category });
    endTimer({ status: 'error' });

    logger.error(`Failed to mint ticket ${ticketId}`, {
      jobId: job.id,
      ticketId,
      tenantId,
      eventId,
      attemptsMade: job.attemptsMade,
      errorCategory: categorized.category,
      isRetryable: categorized.isRetryable,
      error: categorized.message,
      stack: (error as Error).stack
    });

    // Re-throw to let Bull handle retries
    throw error;
  }
}

// =============================================================================
// WORKER STARTUP
// =============================================================================

/**
 * Start the minting worker
 * Sets up job processing with concurrency limits and error handling
 */
export async function startMintingWorker(): Promise<void> {
  const mintQueue = getMintQueue();
  const orchestrator = new MintingOrchestrator();
  const concurrency = getConcurrencyLimit();

  logger.info('Starting minting worker', {
    concurrency,
    queueName: 'ticket-minting'
  });

  // Set up global error handler for the queue
  mintQueue.on('error', (error: Error) => {
    handleWorkerError(error, { source: 'queue_error' });
  });

  // Handle Redis connection errors
  mintQueue.on('waiting', (jobId: string) => {
    logger.debug('Job waiting', { jobId });
  });

  // Process mint jobs with configured concurrency
  mintQueue.process('mint-ticket', concurrency, async (job: Job<MintJobData>) => {
    return processMintJob(job, orchestrator);
  });

  logger.info('Minting worker started', {
    concurrency,
    processor: 'mint-ticket'
  });
}

/**
 * Get worker status for health checks
 */
export function getWorkerStatus(): {
  running: boolean;
  concurrency: number;
} {
  return {
    running: true,
    concurrency: getConcurrencyLimit()
  };
}
