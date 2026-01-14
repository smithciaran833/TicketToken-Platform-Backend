import Bull, { Queue, Job, JobOptions } from 'bull';
import { Counter, Gauge, Histogram } from 'prom-client';
import logger from '../utils/logger';

let mintQueue: Queue | null = null;
let retryQueue: Queue | null = null;
let dlq: Queue | null = null;

// Stale job detection interval handle
let staleJobCheckInterval: NodeJS.Timeout | null = null;

// =============================================================================
// METRICS FOR QUEUE MONITORING
// =============================================================================

// Queue depth gauge
const queueDepthGauge = new Gauge({
  name: 'minting_queue_depth',
  help: 'Current number of jobs in each queue state',
  labelNames: ['queue', 'state']
});

// Stalled jobs counter
const stalledJobsCounter = new Counter({
  name: 'minting_stalled_jobs_total',
  help: 'Total number of stalled jobs detected',
  labelNames: ['queue', 'action']
});

// Stale jobs counter
const staleJobsCounter = new Counter({
  name: 'minting_stale_jobs_total',
  help: 'Total number of stale jobs detected',
  labelNames: ['queue', 'state', 'action']
});

// Job duration histogram
const jobDurationHistogram = new Histogram({
  name: 'minting_job_duration_seconds',
  help: 'Job processing duration in seconds',
  labelNames: ['queue', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600]
});

// DLQ jobs gauge
const dlqJobsGauge = new Gauge({
  name: 'minting_dlq_jobs',
  help: 'Number of jobs in the Dead Letter Queue',
  labelNames: ['reason']
});

// =============================================================================
// STALE JOB DETECTION CONFIGURATION
// =============================================================================

// How often to check for stale jobs (default: 60 seconds)
const STALE_JOB_CHECK_INTERVAL_MS = parseInt(process.env.STALE_JOB_CHECK_INTERVAL_MS || '60000');

// How long a job can be in 'active' state before considered stale (default: 10 minutes)
const STALE_ACTIVE_JOB_THRESHOLD_MS = parseInt(process.env.STALE_ACTIVE_JOB_THRESHOLD_MS || '600000');

// How long a job can be in 'waiting' state before considered stale (default: 30 minutes)
const STALE_WAITING_JOB_THRESHOLD_MS = parseInt(process.env.STALE_WAITING_JOB_THRESHOLD_MS || '1800000');

interface TicketMintData {
  ticketId: string;
  tenantId: string;
  orderId?: string;
  eventId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

interface DLQJobData {
  originalJobId: string | number;
  data: TicketMintData;
  error: string;
  failedAt: string;
  attempts: number;
  reason: string;
}

// =============================================================================
// JOB CONFIGURATION
// =============================================================================

// Base delay for exponential backoff (2 seconds)
const BASE_BACKOFF_DELAY_MS = 2000;

// Maximum backoff delay (30 seconds)
const MAX_BACKOFF_DELAY_MS = 30000;

// Maximum jitter to add (1 second)
const MAX_JITTER_MS = 1000;

/**
 * Calculate backoff delay with jitter to prevent thundering herd
 * Uses exponential backoff with random jitter
 * 
 * @param attemptsMade - Number of attempts already made (1 = first retry)
 * @returns Delay in milliseconds
 */
export function calculateBackoffWithJitter(attemptsMade: number): number {
  // Exponential backoff: 2s, 4s, 8s, etc.
  const exponentialDelay = BASE_BACKOFF_DELAY_MS * Math.pow(2, attemptsMade - 1);
  
  // Add random jitter (0 to MAX_JITTER_MS)
  const jitter = Math.random() * MAX_JITTER_MS;
  
  // Cap at maximum delay
  const totalDelay = Math.min(exponentialDelay + jitter, MAX_BACKOFF_DELAY_MS);
  
  logger.debug(`Calculated backoff delay: ${totalDelay}ms`, {
    attemptsMade,
    exponentialDelay,
    jitter: Math.round(jitter),
    totalDelay: Math.round(totalDelay)
  });
  
  return Math.round(totalDelay);
}

// Default job options for minting operations
const DEFAULT_JOB_OPTIONS: JobOptions = {
  timeout: 300000,           // 5 minutes max execution time
  attempts: 3,               // Maximum retry attempts
  backoff: {
    type: 'exponential',
    delay: BASE_BACKOFF_DELAY_MS
  },
  removeOnComplete: 100,     // Keep last 100 completed jobs
  removeOnFail: 500          // Keep last 500 failed jobs for debugging
};

// Job options with custom backoff function (for use when needed)
export const JOB_OPTIONS_WITH_JITTER: JobOptions = {
  timeout: 300000,
  attempts: 3,
  backoff: {
    type: 'custom'
  },
  removeOnComplete: 100,
  removeOnFail: 500
};

// DLQ job options (permanent storage for analysis)
const DLQ_JOB_OPTIONS: JobOptions = {
  attempts: 1,               // No retries for DLQ
  removeOnComplete: false,   // Never remove from DLQ
  removeOnFail: false
};

// =============================================================================
// CONCURRENCY & QUEUE LIMITS
// =============================================================================

// Maximum concurrent mint jobs (prevents overwhelming Solana RPC)
const MINT_CONCURRENCY = parseInt(process.env.MINT_CONCURRENCY || '5', 10);

// Rate limiter for queue jobs (jobs per duration)
const QUEUE_RATE_LIMIT = {
  max: parseInt(process.env.QUEUE_RATE_MAX || '10', 10),    // Max 10 jobs
  duration: parseInt(process.env.QUEUE_RATE_DURATION || '1000', 10) // Per 1 second
};

// Maximum number of jobs allowed in queue (prevents memory exhaustion)
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || '10000', 10);

// Maximum number of waiting jobs before rejecting new jobs (load shedding)
const QUEUE_HIGH_WATER_MARK = parseInt(process.env.QUEUE_HIGH_WATER_MARK || '5000', 10);

// Queue size exceeded counter
const queueLimitExceeded = new Counter({
  name: 'minting_queue_limit_exceeded_total',
  help: 'Total number of jobs rejected due to queue limits',
  labelNames: ['queue', 'reason']
});

// Redis configuration
function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined
  };
}

export async function initializeQueues(): Promise<{
  mintQueue: Queue;
  retryQueue: Queue;
  dlq: Queue;
}> {
  const redisConfig = getRedisConfig();

  // Main minting queue
  mintQueue = new Bull('ticket-minting', { redis: redisConfig });

  // Retry queue for failed mints
  retryQueue = new Bull('ticket-minting-retry', { redis: redisConfig });

  // Dead Letter Queue for permanently failed jobs
  dlq = new Bull('minting-dlq', { redis: redisConfig });

  // Queue event listeners for main mint queue
  mintQueue.on('completed', (job: Job) => {
    logger.info(`✅ Mint completed: ${job.id}`, {
      jobId: job.id,
      ticketId: job.data.ticketId,
      tenantId: job.data.tenantId,
      duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0
    });
  });

  mintQueue.on('failed', async (job: Job, err: Error) => {
    const maxAttempts = job.opts.attempts || DEFAULT_JOB_OPTIONS.attempts || 3;
    
    logger.error(`❌ Mint failed: ${job.id}`, {
      jobId: job.id,
      ticketId: job.data.ticketId,
      tenantId: job.data.tenantId,
      error: err.message,
      attemptsMade: job.attemptsMade,
      maxAttempts
    });

    // Move to DLQ if all retries exhausted
    if (job.attemptsMade >= maxAttempts) {
      await moveJobToDLQ(job, err);
    }
  });

  mintQueue.on('stalled', async (job: Job) => {
    stalledJobsCounter.inc({ queue: 'mint', action: 'detected' });
    
    logger.warn(`⚠️ Mint job stalled: ${job.id}`, {
      jobId: job.id,
      ticketId: job.data.ticketId,
      tenantId: job.data.tenantId,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : undefined
    });

    // Handle stalled job - Bull will automatically retry it
    // We just log and track metrics here
    try {
      const state = await job.getState();
      
      // If it's been stalled and is now active again, Bull handled it
      if (state === 'active') {
        stalledJobsCounter.inc({ queue: 'mint', action: 'recovered' });
        logger.info(`Stalled job recovered: ${job.id}`, {
          jobId: job.id,
          ticketId: job.data.ticketId
        });
      }
    } catch (error) {
      logger.error('Error checking stalled job state', {
        jobId: job.id,
        error: (error as Error).message
      });
    }
  });

  mintQueue.on('active', (job: Job) => {
    logger.debug(`🔄 Mint job started: ${job.id}`, {
      jobId: job.id,
      ticketId: job.data.ticketId,
      attemptsMade: job.attemptsMade
    });
  });

  // DLQ event listeners
  dlq.on('completed', (job: Job) => {
    logger.info(`📋 DLQ job processed: ${job.id}`, {
      originalJobId: job.data.originalJobId,
      ticketId: job.data.data?.ticketId
    });
  });

  logger.info('✅ Queues initialized (main, retry, DLQ)');

  return { mintQueue, retryQueue, dlq };
}

/**
 * Move a permanently failed job to the Dead Letter Queue
 */
async function moveJobToDLQ(job: Job, error: Error): Promise<void> {
  if (!dlq) {
    logger.error('DLQ not initialized, cannot move failed job', {
      jobId: job.id,
      ticketId: job.data.ticketId
    });
    return;
  }

  try {
    const dlqData: DLQJobData = {
      originalJobId: job.id,
      data: job.data as TicketMintData,
      error: error.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
      reason: categorizeError(error.message)
    };

    await dlq.add('failed-mint', dlqData, {
      ...DLQ_JOB_OPTIONS,
      jobId: `dlq-${job.id}-${Date.now()}`  // Unique ID for DLQ job
    });

    logger.error('💀 Job moved to Dead Letter Queue', {
      originalJobId: job.id,
      ticketId: job.data.ticketId,
      tenantId: job.data.tenantId,
      error: error.message,
      attempts: job.attemptsMade,
      reason: dlqData.reason
    });
  } catch (dlqError) {
    logger.error('Failed to move job to DLQ', {
      originalJobId: job.id,
      ticketId: job.data.ticketId,
      error: (dlqError as Error).message
    });
  }
}

/**
 * Categorize error for DLQ analysis
 */
function categorizeError(errorMessage: string): string {
  if (errorMessage.includes('Insufficient wallet balance')) return 'insufficient_balance';
  if (errorMessage.includes('IPFS')) return 'ipfs_failure';
  if (errorMessage.includes('Transaction failed')) return 'transaction_failure';
  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) return 'timeout';
  if (errorMessage.includes('Bubblegum')) return 'bubblegum_error';
  if (errorMessage.includes('connection')) return 'connection_error';
  if (errorMessage.includes('rate limit')) return 'rate_limited';
  return 'unknown';
}

/**
 * Generate deterministic job ID from ticket and tenant
 * This prevents duplicate jobs for the same ticket
 */
function generateJobId(tenantId: string, ticketId: string): string {
  return `mint-${tenantId}-${ticketId}`;
}

/**
 * Check if queue can accept new jobs based on size limits
 * Returns true if queue is accepting jobs, false if limits exceeded
 */
export async function checkQueueLimits(): Promise<{
  canAccept: boolean;
  reason?: string;
  currentSize: number;
  maxSize: number;
  highWaterMark: number;
}> {
  if (!mintQueue) {
    return {
      canAccept: false,
      reason: 'Queue not initialized',
      currentSize: 0,
      maxSize: MAX_QUEUE_SIZE,
      highWaterMark: QUEUE_HIGH_WATER_MARK
    };
  }

  const [waiting, active, delayed] = await Promise.all([
    mintQueue.getWaitingCount(),
    mintQueue.getActiveCount(),
    mintQueue.getDelayedCount()
  ]);

  const currentSize = waiting + active + delayed;

  if (currentSize >= MAX_QUEUE_SIZE) {
    queueLimitExceeded.inc({ queue: 'mint', reason: 'max_size' });
    return {
      canAccept: false,
      reason: `Queue at maximum capacity (${currentSize}/${MAX_QUEUE_SIZE})`,
      currentSize,
      maxSize: MAX_QUEUE_SIZE,
      highWaterMark: QUEUE_HIGH_WATER_MARK
    };
  }

  if (waiting >= QUEUE_HIGH_WATER_MARK) {
    queueLimitExceeded.inc({ queue: 'mint', reason: 'high_water_mark' });
    return {
      canAccept: false,
      reason: `Queue waiting count exceeds high water mark (${waiting}/${QUEUE_HIGH_WATER_MARK})`,
      currentSize,
      maxSize: MAX_QUEUE_SIZE,
      highWaterMark: QUEUE_HIGH_WATER_MARK
    };
  }

  return {
    canAccept: true,
    currentSize,
    maxSize: MAX_QUEUE_SIZE,
    highWaterMark: QUEUE_HIGH_WATER_MARK
  };
}

/**
 * Get queue limits configuration
 */
export function getQueueLimits(): {
  maxQueueSize: number;
  highWaterMark: number;
} {
  return {
    maxQueueSize: MAX_QUEUE_SIZE,
    highWaterMark: QUEUE_HIGH_WATER_MARK
  };
}

/**
 * Add a mint job to the queue with idempotency protection
 * Uses deterministic job ID to prevent duplicate jobs
 * Enforces queue size limits for load shedding
 */
export async function addMintJob(ticketData: TicketMintData): Promise<Job> {
  if (!mintQueue) {
    throw new Error('Mint queue not initialized');
  }

  // Validate required fields
  if (!ticketData.ticketId) {
    throw new Error('ticketId is required');
  }
  if (!ticketData.tenantId) {
    throw new Error('tenantId is required');
  }

  // Check queue size limits before adding
  const limits = await checkQueueLimits();
  if (!limits.canAccept) {
    logger.warn('Queue rejecting new job due to size limits', {
      ticketId: ticketData.ticketId,
      tenantId: ticketData.tenantId,
      reason: limits.reason,
      currentSize: limits.currentSize,
      maxSize: limits.maxSize
    });
    throw new Error(`Queue capacity exceeded: ${limits.reason}`);
  }

  // IDEMPOTENCY: Generate deterministic job ID
  // This prevents the same ticket from being queued multiple times
  const jobId = generateJobId(ticketData.tenantId, ticketData.ticketId);

  // Check if job already exists
  const existingJob = await mintQueue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    
    // If job is completed, failed, or stuck, allow re-queue
    if (state === 'waiting' || state === 'active' || state === 'delayed') {
      logger.warn(`Mint job already in queue: ${jobId}`, {
        jobId,
        state,
        ticketId: ticketData.ticketId,
        tenantId: ticketData.tenantId
      });
      return existingJob;
    }
    
    // For completed/failed jobs, we allow a new job with timestamp suffix
    logger.info(`Previous job ${jobId} in state: ${state}, creating new job`, {
      previousJobId: jobId,
      state,
      ticketId: ticketData.ticketId
    });
  }

  const job = await mintQueue.add('mint-ticket', ticketData, {
    ...DEFAULT_JOB_OPTIONS,
    jobId  // IDEMPOTENCY: Use deterministic job ID
  });

  logger.info(`📝 Added mint job: ${job.id} for ticket ${ticketData.ticketId}`, {
    jobId: job.id,
    ticketId: ticketData.ticketId,
    tenantId: ticketData.tenantId,
    eventId: ticketData.eventId
  });

  return job;
}

/**
 * Add multiple mint jobs in batch
 * Each job gets a deterministic ID based on tenant+ticket
 */
export async function addBatchMintJobs(tickets: TicketMintData[]): Promise<Job[]> {
  if (!mintQueue) {
    throw new Error('Mint queue not initialized');
  }

  const jobs: Job[] = [];
  const skipped: string[] = [];

  for (const ticketData of tickets) {
    try {
      const job = await addMintJob(ticketData);
      jobs.push(job);
    } catch (error) {
      logger.error(`Failed to queue mint job for ticket ${ticketData.ticketId}`, {
        ticketId: ticketData.ticketId,
        tenantId: ticketData.tenantId,
        error: (error as Error).message
      });
      skipped.push(ticketData.ticketId);
    }
  }

  if (skipped.length > 0) {
    logger.warn(`Batch mint: ${skipped.length} tickets skipped`, { skipped });
  }

  logger.info(`📝 Batch added ${jobs.length}/${tickets.length} mint jobs`);
  return jobs;
}

export function getMintQueue(): Queue {
  if (!mintQueue) {
    throw new Error('Mint queue not initialized');
  }
  return mintQueue;
}

export function getRetryQueue(): Queue {
  if (!retryQueue) {
    throw new Error('Retry queue not initialized');
  }
  return retryQueue;
}

export function getDLQ(): Queue {
  if (!dlq) {
    throw new Error('Dead Letter Queue not initialized');
  }
  return dlq;
}

/**
 * Get DLQ statistics for monitoring
 */
export async function getDLQStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getDLQ();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Requeue a job from DLQ back to main queue for retry
 */
export async function requeueFromDLQ(dlqJobId: string): Promise<Job | null> {
  if (!dlq || !mintQueue) {
    throw new Error('Queues not initialized');
  }

  const dlqJob = await dlq.getJob(dlqJobId);
  if (!dlqJob) {
    logger.warn('DLQ job not found for requeue', { dlqJobId });
    return null;
  }

  const originalData = dlqJob.data.data as TicketMintData;
  
  // Add back to main queue with fresh options
  const newJob = await mintQueue.add('mint-ticket', originalData, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: `retry-${originalData.tenantId}-${originalData.ticketId}-${Date.now()}`
  });

  // Mark DLQ job as requeued
  await dlqJob.moveToCompleted('requeued', true);

  logger.info('Job requeued from DLQ', {
    dlqJobId,
    newJobId: newJob.id,
    ticketId: originalData.ticketId,
    tenantId: originalData.tenantId
  });

  return newJob;
}

// =============================================================================
// CONCURRENCY & RATE LIMIT EXPORTS
// =============================================================================

/**
 * Get the configured concurrency limit for job processing
 * Use this when setting up the queue processor/worker
 * 
 * Example usage in worker:
 * ```
 * const concurrency = getConcurrencyLimit();
 * mintQueue.process('mint-ticket', concurrency, async (job) => { ... });
 * ```
 */
export function getConcurrencyLimit(): number {
  return MINT_CONCURRENCY;
}

/**
 * Get the rate limit configuration for the queue
 * Use this when setting up BullMQ workers with limiter
 */
export function getQueueRateLimitConfig(): { max: number; duration: number } {
  return { ...QUEUE_RATE_LIMIT };
}

/**
 * Get all queue configuration settings for documentation/monitoring
 */
export function getQueueConfig(): {
  concurrency: number;
  rateLimit: { max: number; duration: number };
  jobOptions: JobOptions;
} {
  return {
    concurrency: MINT_CONCURRENCY,
    rateLimit: { ...QUEUE_RATE_LIMIT },
    jobOptions: { ...DEFAULT_JOB_OPTIONS }
  };
}

/**
 * Get mint queue statistics
 */
export async function getMintQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}> {
  const queue = getMintQueue();
  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused()
  ]);

  return { waiting, active, completed, failed, delayed, paused: isPaused };
}

/**
 * Pause the mint queue (stop processing new jobs)
 */
export async function pauseMintQueue(): Promise<void> {
  const queue = getMintQueue();
  await queue.pause();
  logger.info('Mint queue paused');
}

/**
 * Resume the mint queue (start processing jobs again)
 */
export async function resumeMintQueue(): Promise<void> {
  const queue = getMintQueue();
  await queue.resume();
  logger.info('Mint queue resumed');
}

// =============================================================================
// STALE JOB DETECTION
// =============================================================================

interface StaleJob {
  jobId: string | number;
  ticketId: string;
  tenantId: string;
  state: string;
  ageMs: number;
  processedOn?: string;
  timestamp?: string;
}

/**
 * Check for stale jobs in active state
 * Active jobs that have been running longer than threshold
 */
async function checkStaleActiveJobs(): Promise<StaleJob[]> {
  if (!mintQueue) return [];

  const staleJobs: StaleJob[] = [];
  const now = Date.now();

  try {
    const activeJobs = await mintQueue.getActive();
    
    for (const job of activeJobs) {
      const processedOn = job.processedOn || job.timestamp;
      if (!processedOn) continue;

      const ageMs = now - processedOn;
      
      if (ageMs > STALE_ACTIVE_JOB_THRESHOLD_MS) {
        staleJobs.push({
          jobId: job.id,
          ticketId: job.data?.ticketId || 'unknown',
          tenantId: job.data?.tenantId || 'unknown',
          state: 'active',
          ageMs,
          processedOn: new Date(processedOn).toISOString()
        });

        staleJobsCounter.inc({ queue: 'mint', state: 'active', action: 'detected' });
        
        logger.warn('Stale active job detected', {
          jobId: job.id,
          ticketId: job.data?.ticketId,
          tenantId: job.data?.tenantId,
          ageMs,
          threshold: STALE_ACTIVE_JOB_THRESHOLD_MS,
          processedOn: new Date(processedOn).toISOString()
        });
      }
    }
  } catch (error) {
    logger.error('Error checking stale active jobs', {
      error: (error as Error).message
    });
  }

  return staleJobs;
}

/**
 * Check for stale jobs in waiting state
 * Waiting jobs that have been queued longer than threshold
 */
async function checkStaleWaitingJobs(): Promise<StaleJob[]> {
  if (!mintQueue) return [];

  const staleJobs: StaleJob[] = [];
  const now = Date.now();

  try {
    const waitingJobs = await mintQueue.getWaiting();
    
    for (const job of waitingJobs) {
      const timestamp = job.timestamp;
      if (!timestamp) continue;

      const ageMs = now - timestamp;
      
      if (ageMs > STALE_WAITING_JOB_THRESHOLD_MS) {
        staleJobs.push({
          jobId: job.id,
          ticketId: job.data?.ticketId || 'unknown',
          tenantId: job.data?.tenantId || 'unknown',
          state: 'waiting',
          ageMs,
          timestamp: new Date(timestamp).toISOString()
        });

        staleJobsCounter.inc({ queue: 'mint', state: 'waiting', action: 'detected' });
        
        logger.warn('Stale waiting job detected', {
          jobId: job.id,
          ticketId: job.data?.ticketId,
          tenantId: job.data?.tenantId,
          ageMs,
          threshold: STALE_WAITING_JOB_THRESHOLD_MS,
          timestamp: new Date(timestamp).toISOString()
        });
      }
    }
  } catch (error) {
    logger.error('Error checking stale waiting jobs', {
      error: (error as Error).message
    });
  }

  return staleJobs;
}

/**
 * Run stale job detection check
 * Call this periodically to detect stuck jobs
 */
export async function detectStaleJobs(): Promise<{
  staleActive: StaleJob[];
  staleWaiting: StaleJob[];
  totalStale: number;
}> {
  const staleActive = await checkStaleActiveJobs();
  const staleWaiting = await checkStaleWaitingJobs();
  const totalStale = staleActive.length + staleWaiting.length;

  if (totalStale > 0) {
    logger.warn('Stale jobs detected', {
      staleActiveCount: staleActive.length,
      staleWaitingCount: staleWaiting.length,
      totalStale
    });
  }

  return { staleActive, staleWaiting, totalStale };
}

/**
 * Start periodic stale job detection
 * Should be called after queue initialization
 */
export function startStaleJobDetection(): void {
  if (staleJobCheckInterval) {
    logger.warn('Stale job detection already running');
    return;
  }

  logger.info('Starting stale job detection', {
    intervalMs: STALE_JOB_CHECK_INTERVAL_MS,
    activeThresholdMs: STALE_ACTIVE_JOB_THRESHOLD_MS,
    waitingThresholdMs: STALE_WAITING_JOB_THRESHOLD_MS
  });

  staleJobCheckInterval = setInterval(async () => {
    try {
      await detectStaleJobs();
      await updateQueueMetrics();
    } catch (error) {
      logger.error('Error in stale job detection interval', {
        error: (error as Error).message
      });
    }
  }, STALE_JOB_CHECK_INTERVAL_MS);
}

/**
 * Stop periodic stale job detection
 */
export function stopStaleJobDetection(): void {
  if (staleJobCheckInterval) {
    clearInterval(staleJobCheckInterval);
    staleJobCheckInterval = null;
    logger.info('Stale job detection stopped');
  }
}

/**
 * Update queue depth metrics
 */
export async function updateQueueMetrics(): Promise<void> {
  try {
    // Update mint queue metrics
    if (mintQueue) {
      const [waiting, active, delayed, failed] = await Promise.all([
        mintQueue.getWaitingCount(),
        mintQueue.getActiveCount(),
        mintQueue.getDelayedCount(),
        mintQueue.getFailedCount()
      ]);

      queueDepthGauge.set({ queue: 'mint', state: 'waiting' }, waiting);
      queueDepthGauge.set({ queue: 'mint', state: 'active' }, active);
      queueDepthGauge.set({ queue: 'mint', state: 'delayed' }, delayed);
      queueDepthGauge.set({ queue: 'mint', state: 'failed' }, failed);
    }

    // Update DLQ metrics
    if (dlq) {
      const dlqWaiting = await dlq.getWaitingCount();
      queueDepthGauge.set({ queue: 'dlq', state: 'waiting' }, dlqWaiting);

      // Also get DLQ jobs by reason for detailed monitoring
      const dlqJobs = await dlq.getWaiting(0, 100);
      const reasonCounts: Record<string, number> = {};
      
      for (const job of dlqJobs) {
        const reason = job.data?.reason || 'unknown';
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      }

      for (const [reason, count] of Object.entries(reasonCounts)) {
        dlqJobsGauge.set({ reason }, count);
      }
    }
  } catch (error) {
    logger.error('Error updating queue metrics', {
      error: (error as Error).message
    });
  }
}

/**
 * Manually retry a stale active job by moving it to failed and re-adding
 * Use with caution - only for jobs that are truly stuck
 */
export async function forceRetryStaleJob(jobId: string): Promise<Job | null> {
  if (!mintQueue) {
    throw new Error('Mint queue not initialized');
  }

  const job = await mintQueue.getJob(jobId);
  if (!job) {
    logger.warn('Job not found for force retry', { jobId });
    return null;
  }

  const state = await job.getState();
  const data = job.data as TicketMintData;

  logger.info('Force retrying stale job', {
    jobId,
    state,
    ticketId: data.ticketId,
    tenantId: data.tenantId
  });

  staleJobsCounter.inc({ queue: 'mint', state, action: 'force_retry' });

  // Move original job to failed
  try {
    await job.moveToFailed({ message: 'Force retry due to stale job detection' }, true);
  } catch (error) {
    logger.warn('Could not move stale job to failed', {
      jobId,
      error: (error as Error).message
    });
  }

  // Create new job with fresh ID
  const newJob = await mintQueue.add('mint-ticket', data, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: `retry-${data.tenantId}-${data.ticketId}-${Date.now()}`
  });

  logger.info('Created retry job for stale job', {
    originalJobId: jobId,
    newJobId: newJob.id,
    ticketId: data.ticketId
  });

  return newJob;
}

/**
 * Get stale job detection status
 */
export function getStaleJobDetectionStatus(): {
  running: boolean;
  intervalMs: number;
  activeThresholdMs: number;
  waitingThresholdMs: number;
} {
  return {
    running: staleJobCheckInterval !== null,
    intervalMs: STALE_JOB_CHECK_INTERVAL_MS,
    activeThresholdMs: STALE_ACTIVE_JOB_THRESHOLD_MS,
    waitingThresholdMs: STALE_WAITING_JOB_THRESHOLD_MS
  };
}
