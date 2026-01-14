/**
 * Background Job Processor with Tenant Context
 * 
 * HIGH FIX: Ensures all background jobs:
 * - Include tenant ID in payload
 * - Validate tenant context before processing
 * - Set database RLS context
 */

import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'BackgroundJobProcessor' });

// UUID validation regex
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// TYPES
// =============================================================================

export interface JobPayload {
  tenantId: string;
  [key: string]: any;
}

export interface Job {
  id: string;
  type: string;
  payload: JobPayload;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processAfter?: Date;
  error?: string;
  correlationId?: string; // MEDIUM FIX: BJ-9 - correlation ID tracking
  startedAt?: Date;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const JOB_CONFIG = {
  // BJ-4: Exponential backoff configuration
  baseRetryDelayMs: parseInt(process.env.JOB_BASE_RETRY_DELAY_MS || '60000', 10), // 1 minute base
  maxRetryDelayMs: parseInt(process.env.JOB_MAX_RETRY_DELAY_MS || '3600000', 10), // 1 hour max
  backoffMultiplier: parseFloat(process.env.JOB_BACKOFF_MULTIPLIER || '2'),
  jitterFactor: 0.1, // 10% jitter to prevent thundering herd
  
  // BJ-6: Stalled job detection
  stalledTimeoutMs: parseInt(process.env.JOB_STALLED_TIMEOUT_MS || '300000', 10), // 5 minutes
  stalledCheckIntervalMs: parseInt(process.env.JOB_STALLED_CHECK_INTERVAL_MS || '60000', 10), // 1 minute
  
  // BJ-5: Dead letter configuration  
  deadLetterEnabled: process.env.JOB_DEAD_LETTER_ENABLED !== 'false',
};

export type JobHandler = (job: Job, tenantContext: TenantContext) => Promise<void>;

export interface TenantContext {
  tenantId: string;
  setContext: () => Promise<void>;
  clearContext: () => Promise<void>;
}

// =============================================================================
// TENANT CONTEXT MANAGEMENT
// =============================================================================

/**
 * Validate tenant ID format
 */
function isValidTenantId(tenantId: unknown): tenantId is string {
  return typeof tenantId === 'string' && UUID_PATTERN.test(tenantId);
}

/**
 * Create a tenant context for a database connection
 */
async function createTenantContext(
  client: any,
  tenantId: string
): Promise<TenantContext> {
  return {
    tenantId,
    setContext: async () => {
      await client.query(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        [tenantId]
      );
    },
    clearContext: async () => {
      await client.query(
        `SELECT set_config('app.current_tenant_id', '', true)`
      );
    },
  };
}

// =============================================================================
// JOB PROCESSOR
// =============================================================================

export class BackgroundJobProcessor {
  private handlers: Map<string, JobHandler> = new Map();
  private isRunning: boolean = false;
  private pollIntervalMs: number = 5000;
  private pollTimeout?: NodeJS.Timeout;
  private stalledCheckTimeout?: NodeJS.Timeout; // BJ-6: Stalled job checker

  /**
   * Register a job handler
   */
  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    log.info({ jobType }, 'Job handler registered');
  }

  /**
   * Start the job processor
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.poll();
    // BJ-6: Start stalled job detection
    this.startStalledJobChecker();
    log.info('Background job processor started');
  }

  /**
   * Stop the job processor
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    if (this.stalledCheckTimeout) {
      clearTimeout(this.stalledCheckTimeout);
    }
    log.info('Background job processor stopped');
  }

  /**
   * BJ-6: Start periodic check for stalled jobs
   */
  private startStalledJobChecker(): void {
    const check = async () => {
      if (!this.isRunning) return;
      
      try {
        await this.recoverStalledJobs();
      } catch (error) {
        log.error({ error }, 'Error checking for stalled jobs');
      }
      
      this.stalledCheckTimeout = setTimeout(check, JOB_CONFIG.stalledCheckIntervalMs);
    };
    
    // Start after a delay
    this.stalledCheckTimeout = setTimeout(check, JOB_CONFIG.stalledCheckIntervalMs);
  }

  /**
   * BJ-6: Recover stalled jobs (processing for too long)
   */
  private async recoverStalledJobs(): Promise<void> {
    const db = DatabaseService.getPool();
    
    const result = await db.query(`
      UPDATE background_jobs
      SET status = 'pending',
          process_after = NOW() + INTERVAL '1 minute',
          last_error = 'Job stalled - recovered for retry'
      WHERE status = 'processing'
        AND started_at < NOW() - INTERVAL '${JOB_CONFIG.stalledTimeoutMs} milliseconds'
      RETURNING id, type, tenant_id
    `);
    
    if (result.rows.length > 0) {
      log.warn({
        recoveredCount: result.rows.length,
        jobs: result.rows.map((r: any) => ({ id: r.id, type: r.type })),
      }, 'Recovered stalled jobs');
    }
  }

  /**
   * Poll for jobs to process
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processNextJob();
    } catch (error) {
      log.error({ error }, 'Error polling for jobs');
    }

    // Schedule next poll
    this.pollTimeout = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  /**
   * Process the next available job
   */
  private async processNextJob(): Promise<void> {
    const db = DatabaseService.getPool();
    const client = await db.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Fetch and lock the next pending job
      // Use SKIP LOCKED to avoid contention
      const result = await client.query(`
        SELECT * FROM background_jobs
        WHERE status = 'pending'
          AND (process_after IS NULL OR process_after <= NOW())
          AND attempts < max_attempts
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);

      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }

      const job: Job = {
        id: result.rows[0].id,
        type: result.rows[0].type,
        payload: result.rows[0].payload,
        status: result.rows[0].status,
        attempts: result.rows[0].attempts,
        maxAttempts: result.rows[0].max_attempts,
        createdAt: result.rows[0].created_at,
        processAfter: result.rows[0].process_after,
        correlationId: result.rows[0].correlation_id, // BJ-9: correlation ID
      };

      // BJ-9: Include correlation ID in logging
      log.info({
        jobId: job.id,
        type: job.type,
        correlationId: job.correlationId,
        tenantId: job.payload?.tenantId,
      }, 'Processing job');

      // CRITICAL: Validate tenant ID from payload
      const tenantId = job.payload?.tenantId;
      
      if (!tenantId) {
        log.error({ jobId: job.id }, 'Job missing tenant ID');
        await this.markJobFailed(client, job.id, 'Missing tenant ID in payload');
        await client.query('COMMIT');
        return;
      }

      if (!isValidTenantId(tenantId)) {
        log.error({ jobId: job.id, tenantId }, 'Job has invalid tenant ID');
        await this.markJobFailed(client, job.id, 'Invalid tenant ID format');
        await client.query('COMMIT');
        return;
      }

      // Mark as processing
      await client.query(
        `UPDATE background_jobs 
         SET status = 'processing', 
             attempts = attempts + 1,
             started_at = NOW()
         WHERE id = $1`,
        [job.id]
      );

      // Create tenant context
      const tenantContext = await createTenantContext(client, tenantId);

      // Get handler
      const handler = this.handlers.get(job.type);
      
      if (!handler) {
        log.error({ jobId: job.id, type: job.type }, 'No handler for job type');
        await this.markJobFailed(client, job.id, `No handler for job type: ${job.type}`);
        await client.query('COMMIT');
        return;
      }

      try {
        // Set tenant context for RLS
        await tenantContext.setContext();

        // Execute handler
        await handler(job, tenantContext);

        // Mark as completed
        await client.query(
          `UPDATE background_jobs 
           SET status = 'completed', 
               completed_at = NOW()
           WHERE id = $1`,
          [job.id]
        );

        log.info({ jobId: job.id }, 'Job completed successfully');
      } catch (error) {
        // Handle job failure
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (job.attempts + 1 >= job.maxAttempts) {
          // BJ-5: Move to dead letter queue instead of just marking failed
          if (JOB_CONFIG.deadLetterEnabled) {
            await this.moveToDeadLetterQueue(client, job, errorMessage);
          } else {
            await this.markJobFailed(client, job.id, errorMessage);
          }
          log.error({
            jobId: job.id,
            correlationId: job.correlationId,
            error: errorMessage,
          }, 'Job failed permanently - moved to dead letter queue');
        } else {
          // BJ-4: MEDIUM FIX - Exponential backoff with jitter
          const retryDelayMs = this.calculateRetryDelay(job.attempts);
          const retryDelaySeconds = Math.ceil(retryDelayMs / 1000);
          
          await client.query(
            `UPDATE background_jobs 
             SET status = 'pending', 
                 process_after = NOW() + INTERVAL '${retryDelaySeconds} seconds',
                 last_error = $2
             WHERE id = $1`,
            [job.id, errorMessage]
          );
          log.warn({
            jobId: job.id,
            correlationId: job.correlationId,
            retryDelayMs,
            attempt: job.attempts + 1,
            maxAttempts: job.maxAttempts,
            error: errorMessage,
          }, 'Job failed, scheduling retry with exponential backoff');
        }
      } finally {
        // Clear tenant context
        await tenantContext.clearContext();
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * BJ-4: Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempts: number): number {
    // Calculate base delay with exponential backoff
    const baseDelay = JOB_CONFIG.baseRetryDelayMs * Math.pow(JOB_CONFIG.backoffMultiplier, attempts);
    
    // Cap at max delay
    const cappedDelay = Math.min(baseDelay, JOB_CONFIG.maxRetryDelayMs);
    
    // Add jitter (±10%) to prevent thundering herd
    const jitter = cappedDelay * JOB_CONFIG.jitterFactor * (Math.random() * 2 - 1);
    
    return Math.round(cappedDelay + jitter);
  }

  /**
   * Mark a job as permanently failed
   */
  private async markJobFailed(client: any, jobId: string, error: string): Promise<void> {
    await client.query(
      `UPDATE background_jobs 
       SET status = 'failed', 
           failed_at = NOW(),
           last_error = $2
       WHERE id = $1`,
      [jobId, error]
    );
  }

  /**
   * BJ-5: Move job to dead letter queue for manual intervention
   */
  private async moveToDeadLetterQueue(
    client: any,
    job: Job,
    error: string
  ): Promise<void> {
    const tenantId = job.payload?.tenantId;
    
    // Insert into dead letter queue
    await client.query(`
      INSERT INTO dead_letter_queue (
        id, original_job_id, job_type, payload, tenant_id, correlation_id,
        error, attempts, original_created_at, moved_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      )
    `, [
      uuidv4(),
      job.id,
      job.type,
      JSON.stringify(job.payload),
      tenantId,
      job.correlationId,
      error,
      job.attempts,
      job.createdAt,
    ]);

    // Update original job status
    await client.query(`
      UPDATE background_jobs 
      SET status = 'dead_letter', 
          failed_at = NOW(),
          last_error = $2
      WHERE id = $1
    `, [job.id, error]);

    log.warn({
      jobId: job.id,
      type: job.type,
      tenantId,
      correlationId: job.correlationId,
      attempts: job.attempts,
      error,
    }, 'Job moved to dead letter queue');
  }

  /**
   * BJ-5: Retry a job from the dead letter queue
   */
  async retryFromDeadLetter(deadLetterId: string): Promise<string> {
    const db = DatabaseService.getPool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(`
        SELECT * FROM dead_letter_queue WHERE id = $1 FOR UPDATE
      `, [deadLetterId]);

      if (result.rows.length === 0) {
        throw new Error('Dead letter job not found');
      }

      const dlJob = result.rows[0];
      const newJobId = uuidv4();

      // Create a new job from the dead letter
      await client.query(`
        INSERT INTO background_jobs (
          id, type, payload, status, max_attempts, tenant_id, correlation_id, created_at
        ) VALUES (
          $1, $2, $3, 'pending', 3, $4, $5, NOW()
        )
      `, [
        newJobId,
        dlJob.job_type,
        dlJob.payload,
        dlJob.tenant_id,
        dlJob.correlation_id,
      ]);

      // Mark dead letter as retried
      await client.query(`
        UPDATE dead_letter_queue SET retried = true, retried_at = NOW(), new_job_id = $2 WHERE id = $1
      `, [deadLetterId, newJobId]);

      await client.query('COMMIT');

      log.info({
        deadLetterId,
        newJobId,
        type: dlJob.job_type,
      }, 'Job retried from dead letter queue');

      return newJobId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Enqueue a new job with tenant context
   * BJ-9: Now includes correlation ID for tracing
   */
  async enqueue(
    type: string,
    payload: Record<string, any>,
    tenantId: string,
    options: {
      processAfter?: Date;
      maxAttempts?: number;
      correlationId?: string; // BJ-9: correlation ID for tracing
    } = {}
  ): Promise<string> {
    if (!isValidTenantId(tenantId)) {
      throw new Error('Invalid tenant ID');
    }

    const db = DatabaseService.getPool();
    const jobId = uuidv4();
    const correlationId = options.correlationId || uuidv4(); // BJ-9: Generate if not provided

    // CRITICAL: Always include tenant ID in payload
    const fullPayload: JobPayload = {
      ...payload,
      tenantId,
      correlationId, // BJ-9: Include in payload for downstream tracking
    };

    await db.query(
      `INSERT INTO background_jobs (id, type, payload, status, max_attempts, process_after, tenant_id, correlation_id, created_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, NOW())`,
      [
        jobId,
        type,
        JSON.stringify(fullPayload),
        options.maxAttempts || 3,
        options.processAfter || null,
        tenantId,
        correlationId, // BJ-9: Store correlation ID for tracing
      ]
    );

    log.info({
      jobId,
      type,
      tenantId,
      correlationId,
    }, 'Job enqueued');
    
    return jobId;
  }

  /**
   * BJ-5: Get dead letter queue statistics
   */
  async getDeadLetterStats(tenantId?: string): Promise<{
    total: number;
    byType: Record<string, number>;
    oldest?: Date;
  }> {
    const db = DatabaseService.getPool();
    
    let query = `
      SELECT 
        COUNT(*) as total,
        job_type,
        MIN(moved_at) as oldest
      FROM dead_letter_queue
      WHERE retried = false
    `;
    const params: any[] = [];
    
    if (tenantId) {
      query += ` AND tenant_id = $1`;
      params.push(tenantId);
    }
    
    query += ` GROUP BY job_type`;
    
    const result = await db.query(query, params);
    
    const byType: Record<string, number> = {};
    let total = 0;
    let oldest: Date | undefined;
    
    for (const row of result.rows) {
      byType[row.job_type] = parseInt(row.count, 10);
      total += parseInt(row.count, 10);
      if (!oldest || row.oldest < oldest) {
        oldest = row.oldest;
      }
    }
    
    return { total, byType, oldest };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const jobProcessor = new BackgroundJobProcessor();

// =============================================================================
// OUTBOX PROCESSOR
// =============================================================================

/**
 * Process outbox events with tenant context
 */
export async function processOutboxEvents(): Promise<void> {
  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Fetch pending outbox events with FOR UPDATE SKIP LOCKED
    const result = await client.query(`
      SELECT * FROM outbox
      WHERE processed = false
        AND (retry_after IS NULL OR retry_after <= NOW())
        AND attempts < 5
      ORDER BY created_at ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `);

    for (const row of result.rows) {
      const payload = row.payload;
      const tenantId = payload?.tenantId || row.tenant_id;

      // CRITICAL: Validate tenant ID
      if (!tenantId || !isValidTenantId(tenantId)) {
        log.error({ outboxId: row.id }, 'Outbox event missing or invalid tenant ID');
        
        // Mark as failed
        await client.query(
          `UPDATE outbox SET processed = true, error = $2, processed_at = NOW() WHERE id = $1`,
          [row.id, 'Missing or invalid tenant ID']
        );
        continue;
      }

      try {
        // Set tenant context
        await client.query(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          [tenantId]
        );

        // Process the event (publish to message queue, etc.)
        await publishOutboxEvent(row);

        // Mark as processed
        await client.query(
          `UPDATE outbox SET processed = true, processed_at = NOW() WHERE id = $1`,
          [row.id]
        );

        log.info({ outboxId: row.id, eventType: row.event_type }, 'Outbox event processed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Schedule retry with exponential backoff
        const retryDelay = Math.pow(2, row.attempts) * 60;
        await client.query(
          `UPDATE outbox 
           SET attempts = attempts + 1, 
               retry_after = NOW() + INTERVAL '${retryDelay} seconds',
               error = $2
           WHERE id = $1`,
          [row.id, errorMessage]
        );

        log.warn({ outboxId: row.id, error: errorMessage }, 'Outbox event processing failed, scheduled retry');
      } finally {
        // Clear tenant context
        await client.query(`SELECT set_config('app.current_tenant_id', '', true)`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ error }, 'Error processing outbox events');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Publish an outbox event (placeholder - implement actual publishing)
 */
async function publishOutboxEvent(event: any): Promise<void> {
  // TODO: Implement actual event publishing (e.g., to RabbitMQ, Kafka, etc.)
  log.debug({ eventType: event.event_type, aggregateId: event.aggregate_id }, 'Publishing outbox event');
}
