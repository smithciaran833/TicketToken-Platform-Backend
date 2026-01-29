/**
 * Tenant-Aware Job Utilities
 * 
 * MEDIUM FIX: Implements multi-tenancy support for background jobs:
 * - JOB-3: Set DB context for tenant
 * - JOB-6: Iterate tenants for recurring jobs
 * - JOB-8: Tenant-scoped queue names
 * - JOB-9: DLQ respects tenant isolation
 */

import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'TenantJobUtils' });

// UUID validation regex
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * SECURITY: Explicit field lists for job processing tables.
 */
const DEAD_LETTER_FIELDS = 'id, tenant_id, job_id, job_type, payload, error_message, retry_count, retried, moved_at, correlation_id, created_at';

// =============================================================================
// TYPES
// =============================================================================

export interface TenantJobContext {
  tenantId: string;
  correlationId: string;
  client: any;
  setContext: () => Promise<void>;
  clearContext: () => Promise<void>;
}

export interface RecurringJobConfig {
  jobType: string;
  batchSize?: number;
  parallelTenants?: number;
  timeoutMs?: number;
}

// =============================================================================
// JOB-3: DATABASE CONTEXT FOR TENANT
// =============================================================================

/**
 * JOB-3: Create a tenant-aware database context for job execution
 * Sets RLS context at session level
 */
export async function createTenantJobContext(
  tenantId: string,
  correlationId?: string
): Promise<TenantJobContext> {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }

  const db = DatabaseService.getPool();
  const client = await db.connect();
  const jobCorrelationId = correlationId || uuidv4();

  const context: TenantJobContext = {
    tenantId,
    correlationId: jobCorrelationId,
    client,
    setContext: async () => {
      // Set RLS context for this session
      await client.query(
        `SELECT set_config('app.current_tenant_id', $1, false)`,
        [tenantId]
      );
      log.debug({
        tenantId,
        correlationId: jobCorrelationId,
      }, 'Tenant context set for job');
    },
    clearContext: async () => {
      // Clear RLS context
      await client.query(
        `SELECT set_config('app.current_tenant_id', '', false)`
      );
      client.release();
    },
  };

  // Automatically set context on creation
  await context.setContext();

  return context;
}

/**
 * Execute a job with tenant context, ensuring cleanup
 */
export async function withTenantJobContext<T>(
  tenantId: string,
  fn: (ctx: TenantJobContext) => Promise<T>,
  correlationId?: string
): Promise<T> {
  const ctx = await createTenantJobContext(tenantId, correlationId);
  
  try {
    return await fn(ctx);
  } finally {
    await ctx.clearContext();
  }
}

// =============================================================================
// JOB-6: ITERATE TENANTS FOR RECURRING JOBS
// =============================================================================

/**
 * JOB-6: Get all active tenants for recurring job iteration
 */
export async function getActiveTenants(): Promise<string[]> {
  const db = DatabaseService.getPool();
  
  const result = await db.query(`
    SELECT DISTINCT tenant_id 
    FROM tenants 
    WHERE status = 'active'
    ORDER BY tenant_id
  `);
  
  return result.rows.map((row: any) => row.tenant_id);
}

/**
 * JOB-6: Execute a recurring job for all tenants
 * Processes tenants in sequence or parallel batches
 */
export async function executeForAllTenants<T>(
  config: RecurringJobConfig,
  jobFn: (ctx: TenantJobContext) => Promise<T>
): Promise<Map<string, { success: boolean; result?: T; error?: string }>> {
  const correlationId = uuidv4();
  const results = new Map<string, { success: boolean; result?: T; error?: string }>();
  
  log.info({
    jobType: config.jobType,
    correlationId,
  }, 'Starting multi-tenant recurring job');
  
  // Get all active tenants
  const tenants = await getActiveTenants();
  
  if (tenants.length === 0) {
    log.warn({ jobType: config.jobType }, 'No active tenants found');
    return results;
  }
  
  log.info({
    jobType: config.jobType,
    tenantCount: tenants.length,
    correlationId,
  }, 'Processing tenants');

  // Process tenants in parallel batches
  const parallelism = config.parallelTenants || 3;
  
  for (let i = 0; i < tenants.length; i += parallelism) {
    const batch = tenants.slice(i, i + parallelism);
    
    const batchPromises = batch.map(async (tenantId) => {
      const tenantCorrelationId = `${correlationId}-${tenantId.slice(0, 8)}`;
      
      try {
        const result = await withTenantJobContext(
          tenantId,
          jobFn,
          tenantCorrelationId
        );
        
        results.set(tenantId, { success: true, result });
        
        log.debug({
          jobType: config.jobType,
          tenantId,
          correlationId: tenantCorrelationId,
        }, 'Tenant job completed');
      } catch (error: any) {
        results.set(tenantId, { success: false, error: error.message });
        
        log.error({
          jobType: config.jobType,
          tenantId,
          correlationId: tenantCorrelationId,
          error: error.message,
        }, 'Tenant job failed');
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  // Log summary
  const succeeded = Array.from(results.values()).filter(r => r.success).length;
  const failed = results.size - succeeded;
  
  log.info({
    jobType: config.jobType,
    totalTenants: results.size,
    succeeded,
    failed,
    correlationId,
  }, 'Multi-tenant job completed');
  
  return results;
}

// =============================================================================
// JOB-8: TENANT-SCOPED QUEUE NAMES
// =============================================================================

/**
 * JOB-8: Get tenant-scoped queue name
 * Allows per-tenant queues for isolation
 */
export function getTenantQueueName(
  baseQueueName: string,
  tenantId: string,
  options: { useGlobalQueue?: boolean } = {}
): string {
  if (options.useGlobalQueue) {
    return baseQueueName;
  }
  
  // Use tenant prefix for queue isolation
  // Format: {baseQueue}:{tenantId-prefix}
  const tenantPrefix = tenantId.slice(0, 8);
  return `${baseQueueName}:${tenantPrefix}`;
}

/**
 * JOB-8: Get all queue names for a base queue (for cleanup/monitoring)
 */
export async function getTenantQueueNames(baseQueueName: string): Promise<string[]> {
  const tenants = await getActiveTenants();
  return tenants.map(tenantId => getTenantQueueName(baseQueueName, tenantId));
}

/**
 * JOB-8: Parse tenant ID from queue name
 */
export function parseTenantFromQueueName(queueName: string): string | null {
  const parts = queueName.split(':');
  if (parts.length >= 2) {
    // The tenant prefix is the second part
    // We need to look up the full tenant ID from the prefix
    return parts[1]; // Returns the prefix, caller should look up full ID
  }
  return null;
}

// =============================================================================
// JOB-9: DLQ WITH TENANT ISOLATION
// =============================================================================

/**
 * JOB-9: Move job to tenant-isolated dead letter queue
 */
export async function moveToTenantDLQ(
  jobId: string,
  jobType: string,
  payload: any,
  tenantId: string,
  error: string,
  correlationId?: string
): Promise<string> {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error('Invalid tenant ID for DLQ');
  }
  
  const db = DatabaseService.getPool();
  const dlqId = uuidv4();
  
  // Insert into DLQ with tenant isolation
  await db.query(`
    INSERT INTO dead_letter_queue (
      id, original_job_id, job_type, payload, tenant_id,
      correlation_id, error, moved_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, NOW()
    )
  `, [
    dlqId,
    jobId,
    jobType,
    JSON.stringify(payload),
    tenantId,
    correlationId,
    error,
  ]);
  
  log.warn({
    dlqId,
    jobId,
    jobType,
    tenantId,
    correlationId,
    error,
  }, 'Job moved to tenant-isolated DLQ');
  
  return dlqId;
}

/**
 * JOB-9: Get DLQ entries for a specific tenant
 */
export async function getTenantDLQEntries(
  tenantId: string,
  options: { 
    limit?: number; 
    jobType?: string;
    includeRetried?: boolean;
  } = {}
): Promise<any[]> {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error('Invalid tenant ID');
  }
  
  const db = DatabaseService.getPool();
  const limit = options.limit || 100;
  
  // SECURITY: Use explicit field list instead of SELECT *
  let query = `
    SELECT ${DEAD_LETTER_FIELDS} FROM dead_letter_queue
    WHERE tenant_id = $1
  `;
  const params: any[] = [tenantId];
  
  if (!options.includeRetried) {
    query += ` AND (retried = false OR retried IS NULL)`;
  }
  
  if (options.jobType) {
    params.push(options.jobType);
    query += ` AND job_type = $${params.length}`;
  }
  
  query += ` ORDER BY moved_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  
  const result = await db.query(query, params);
  return result.rows;
}

/**
 * JOB-9: Retry a job from the tenant DLQ
 * Verifies tenant ownership before retry
 */
export async function retryFromTenantDLQ(
  dlqId: string,
  requestingTenantId: string
): Promise<string> {
  const db = DatabaseService.getPool();
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the DLQ entry with tenant verification
    // SECURITY: Use explicit field list instead of SELECT *
    const result = await client.query(`
      SELECT ${DEAD_LETTER_FIELDS} FROM dead_letter_queue
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE
    `, [dlqId, requestingTenantId]);
    
    if (result.rows.length === 0) {
      throw new Error('DLQ entry not found or tenant mismatch');
    }
    
    const dlqEntry = result.rows[0];
    const newJobId = uuidv4();
    
    // Create new job from DLQ
    await client.query(`
      INSERT INTO background_jobs (
        id, type, payload, status, max_attempts, 
        tenant_id, correlation_id, created_at
      ) VALUES (
        $1, $2, $3, 'pending', 3, $4, $5, NOW()
      )
    `, [
      newJobId,
      dlqEntry.job_type,
      dlqEntry.payload,
      requestingTenantId,
      dlqEntry.correlation_id,
    ]);
    
    // Mark DLQ entry as retried
    await client.query(`
      UPDATE dead_letter_queue 
      SET retried = true, retried_at = NOW(), new_job_id = $2
      WHERE id = $1
    `, [dlqId, newJobId]);
    
    await client.query('COMMIT');
    
    log.info({
      dlqId,
      newJobId,
      tenantId: requestingTenantId,
      jobType: dlqEntry.job_type,
    }, 'Job retried from tenant DLQ');
    
    return newJobId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// RECURRING JOB HELPERS
// =============================================================================

/**
 * Helper: Create a scheduled recurring job runner
 */
export function createRecurringJob(
  config: RecurringJobConfig,
  jobFn: (ctx: TenantJobContext) => Promise<void>
): {
  start: () => void;
  stop: () => void;
} {
  let intervalHandle: NodeJS.Timeout | null = null;
  const intervalMs = config.timeoutMs || 60000; // Default 1 minute
  
  return {
    start: () => {
      if (intervalHandle) return;
      
      const run = async () => {
        try {
          await executeForAllTenants(config, jobFn);
        } catch (error) {
          log.error({
            jobType: config.jobType,
            error,
          }, 'Recurring job failed');
        }
      };
      
      intervalHandle = setInterval(run, intervalMs);
      log.info({
        jobType: config.jobType,
        intervalMs,
      }, 'Recurring job started');
    },
    stop: () => {
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
        log.info({ jobType: config.jobType }, 'Recurring job stopped');
      }
    },
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  UUID_PATTERN,
};
