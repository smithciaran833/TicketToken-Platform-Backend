/**
 * Tenant Database Context Helpers
 * 
 * Fixes audit findings:
 * - Queries in tenant transaction - Transactions, no SET LOCAL
 * - SET LOCAL app.current_tenant_id - Not implemented
 * - DB context set before job - No SET LOCAL
 * 
 * This module provides helpers to ensure all database operations
 * run within the correct tenant context with proper SET LOCAL.
 */

import { DatabaseService } from '../services/databaseService';
import { logger } from './logger';
import { Knex } from 'knex';

const log = logger.child({ component: 'TenantDB' });

// UUID v4 regex pattern for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4
 */
export function isValidTenantId(value: string): boolean {
  return Boolean(value && typeof value === 'string' && UUID_REGEX.test(value));
}

/**
 * Set tenant context for the current transaction using SET LOCAL
 * 
 * IMPORTANT: This MUST be called within a transaction (BEGIN/COMMIT)
 * for SET LOCAL to work properly. Outside a transaction, the setting
 * will persist until the connection is returned to the pool.
 * 
 * Fixes: "SET LOCAL app.current_tenant_id - Not implemented"
 */
export async function setTenantContext(tenantId: string): Promise<void> {
  // Validate tenant ID format
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId?.substring(0, 50)}`);
  }

  // set_config with third param 'true' makes it local to the transaction
  await DatabaseService.query(
    `SELECT set_config('app.current_tenant_id', $1, true)`,
    [tenantId]
  );

  log.debug('Tenant context set', { tenantId });
}

/**
 * Clear tenant context for the current transaction
 */
export async function clearTenantContext(): Promise<void> {
  await DatabaseService.query(
    `SELECT set_config('app.current_tenant_id', '', true)`,
    []
  );
}

/**
 * Get current tenant context from database session
 */
export async function getCurrentTenantContext(): Promise<string | null> {
  const result = await DatabaseService.query(
    `SELECT current_setting('app.current_tenant_id', true) as tenant_id`,
    []
  );
  
  const tenantId = result.rows?.[0]?.tenant_id;
  return tenantId && tenantId !== '' ? tenantId : null;
}

/**
 * Verify tenant context is properly set
 */
export async function verifyTenantContext(): Promise<boolean> {
  const tenantId = await getCurrentTenantContext();
  return isValidTenantId(tenantId || '');
}

/**
 * Execute a database operation within tenant context
 * 
 * This wraps the operation in a transaction and sets the tenant context
 * using SET LOCAL before executing the operation.
 * 
 * Fixes: "Queries in tenant transaction - Transactions, no SET LOCAL"
 * 
 * @param tenantId - The tenant ID to scope the operation to
 * @param operation - The async operation to execute
 * @returns The result of the operation
 */
export async function withTenantContext<T>(
  tenantId: string,
  operation: () => Promise<T>
): Promise<T> {
  // Validate tenant ID format
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId?.substring(0, 50)}`);
  }

  // Start transaction
  await DatabaseService.query('BEGIN', []);
  
  try {
    // Set tenant context within the transaction
    await DatabaseService.query(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      [tenantId]
    );

    log.debug('Transaction tenant context set', { tenantId });

    // Execute the operation
    const result = await operation();

    // Commit transaction
    await DatabaseService.query('COMMIT', []);

    // Context is automatically cleared when transaction commits
    return result;
  } catch (error) {
    // Rollback on error
    await DatabaseService.query('ROLLBACK', []).catch(() => {});
    throw error;
  }
}

/**
 * Execute a database operation within tenant context using a provided transaction
 * 
 * Use this when you already have a transaction and need to set tenant context.
 * 
 * @param tenantId - The tenant ID to scope the operation to
 * @param trx - The Knex transaction object
 * @param operation - The async operation to execute
 * @returns The result of the operation
 */
export async function withTenantContextTrx<T>(
  tenantId: string,
  trx: Knex.Transaction,
  operation: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  // Validate tenant ID format
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId?.substring(0, 50)}`);
  }

  // Set tenant context within the provided transaction
  await trx.raw(
    `SELECT set_config('app.current_tenant_id', ?, true)`,
    [tenantId]
  );

  log.debug('Transaction tenant context set (external trx)', { tenantId });

  // Execute the operation with the transaction
  return operation(trx);
}

/**
 * Execute a job operation within tenant context
 * 
 * This is specifically for background jobs that need tenant isolation.
 * It creates a new transaction with tenant context set before executing.
 * 
 * Fixes: "DB context set before job - No SET LOCAL"
 * 
 * @param tenantId - The tenant ID to scope the job to
 * @param jobName - Name of the job for logging
 * @param operation - The async operation to execute
 * @returns The result of the operation
 */
export async function withJobTenantContext<T>(
  tenantId: string,
  jobName: string,
  operation: () => Promise<T>
): Promise<T> {
  // Validate tenant ID format
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID for job ${jobName}: ${tenantId?.substring(0, 50)}`);
  }

  log.info('Starting job with tenant context', { 
    jobName, 
    tenantId 
  });

  const startTime = Date.now();

  try {
    const result = await withTenantContext(tenantId, operation);

    log.info('Job completed successfully', {
      jobName,
      tenantId,
      durationMs: Date.now() - startTime
    });

    return result;
  } catch (error) {
    log.error('Job failed', {
      jobName,
      tenantId,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Batch operation helper that processes items in chunks with tenant context
 * 
 * @param tenantId - The tenant ID to scope the operation to
 * @param items - The items to process
 * @param batchSize - Number of items per batch
 * @param processor - The function to process each batch
 */
export async function withTenantBatch<T, R>(
  tenantId: string,
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId?.substring(0, 50)}`);
  }

  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const batchResults = await withTenantContext(tenantId, async () => {
      return processor(batch);
    });

    results.push(...batchResults);

    log.debug('Batch processed', {
      tenantId,
      batchNumber: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(items.length / batchSize),
      batchSize: batch.length
    });
  }

  return results;
}

/**
 * Execute a tenant-scoped SELECT query
 * 
 * This executes a query with automatic tenant_id filtering.
 * 
 * @param tableName - The table to query
 * @param tenantId - The tenant ID to filter by
 * @param columns - Columns to select (default '*')
 * @param additionalWhere - Additional WHERE conditions as key-value pairs
 */
export async function tenantQuery(
  tableName: string, 
  tenantId: string,
  columns: string = '*',
  additionalWhere: Record<string, any> = {}
): Promise<any[]> {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId?.substring(0, 50)}`);
  }

  // Build WHERE clause
  const conditions = ['tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(additionalWhere)) {
    conditions.push(`${key} = $${paramIndex}`);
    params.push(value);
    paramIndex++;
  }

  const sql = `SELECT ${columns} FROM ${tableName} WHERE ${conditions.join(' AND ')}`;
  const result = await DatabaseService.query(sql, params);
  return result.rows || [];
}

/**
 * Verify RLS is properly configured for current connection
 * 
 * This checks that:
 * 1. The current role is not a superuser
 * 2. The current role does not have BYPASSRLS
 * 3. RLS is enabled on critical tables
 */
export async function verifyRLSConfiguration(): Promise<{
  isValid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  try {
    // Check current role is not superuser
    const superuserCheck = await DatabaseService.query(`
      SELECT rolsuper, rolbypassrls 
      FROM pg_roles 
      WHERE rolname = current_user
    `, []);

    const role = superuserCheck.rows?.[0];
    if (role?.rolsuper) {
      issues.push('CRITICAL: Current role is a superuser - RLS will not be enforced');
    }
    if (role?.rolbypassrls) {
      issues.push('CRITICAL: Current role can bypass RLS');
    }

    // Check RLS is enabled on tickets table
    const rlsCheck = await DatabaseService.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname = 'tickets' 
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
    `, []);

    if (rlsCheck.rows?.length === 0) {
      issues.push('WARNING: tickets table not found');
    } else if (!rlsCheck.rows[0]?.relrowsecurity) {
      issues.push('CRITICAL: RLS not enabled on tickets table');
    }

    return {
      isValid: issues.filter(i => i.startsWith('CRITICAL')).length === 0,
      issues
    };
  } catch (error) {
    log.error('Failed to verify RLS configuration', { error });
    return {
      isValid: false,
      issues: ['Failed to verify RLS configuration: ' + (error instanceof Error ? error.message : String(error))]
    };
  }
}

/**
 * MEDIUM Fix: Select tickets with SKIP LOCKED for concurrent access
 * 
 * This prevents concurrent reservations from blocking each other.
 * Uses FOR UPDATE SKIP LOCKED to skip already-locked rows.
 * 
 * Fixes: "No SKIP LOCKED - SELECT FOR UPDATE blocks"
 */
export async function selectTicketsForUpdate(
  tenantId: string,
  ticketTypeId: string,
  quantity: number,
  options: {
    skipLocked?: boolean;
    waitTimeout?: number;
  } = { skipLocked: true }
): Promise<any[]> {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId?.substring(0, 50)}`);
  }

  const lockMode = options.skipLocked 
    ? 'FOR UPDATE SKIP LOCKED'
    : 'FOR UPDATE';

  // If wait timeout specified, set lock timeout for this transaction
  if (options.waitTimeout) {
    await DatabaseService.query(
      `SET LOCAL lock_timeout = '${options.waitTimeout}ms'`,
      []
    );
  }

  const result = await DatabaseService.query(
    `SELECT id, status, price_cents, metadata
     FROM tickets 
     WHERE tenant_id = $1 
       AND ticket_type_id = $2 
       AND status = 'available'
     LIMIT $3
     ${lockMode}`,
    [tenantId, ticketTypeId, quantity]
  );

  log.debug('Selected tickets with SKIP LOCKED', {
    tenantId,
    ticketTypeId,
    requested: quantity,
    found: result.rows?.length || 0,
    skipLocked: options.skipLocked
  });

  return result.rows || [];
}

/**
 * MEDIUM Fix: Tenant-scoped RLS using app.current_tenant_id
 * 
 * RLS policies should use current_setting('app.current_tenant_id')
 * instead of user-based policies for proper multi-tenant isolation.
 * 
 * Fixes: "RLS user-based not tenant-based"
 * 
 * This helper verifies the RLS is tenant-based by checking policy definitions.
 */
export async function verifyTenantBasedRLS(): Promise<{
  isValid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  try {
    // Check RLS policies on tickets table use tenant_id
    const policyCheck = await DatabaseService.query(`
      SELECT polname, pg_get_expr(polqual, polrelid) as policy_expr
      FROM pg_policy
      WHERE polrelid = 'tickets'::regclass
    `, []);

    if (policyCheck.rows?.length === 0) {
      issues.push('CRITICAL: No RLS policies found on tickets table');
    } else {
      // Check each policy uses current_setting for tenant_id
      for (const policy of policyCheck.rows) {
        const expr = policy.policy_expr?.toLowerCase() || '';
        if (!expr.includes('current_setting') || !expr.includes('tenant_id')) {
          issues.push(`WARNING: Policy ${policy.polname} may not use tenant-based RLS`);
        }
      }
    }

    return {
      isValid: issues.filter(i => i.startsWith('CRITICAL')).length === 0,
      issues
    };
  } catch (error) {
    log.error('Failed to verify tenant-based RLS', { error });
    return {
      isValid: false,
      issues: ['Failed to verify RLS: ' + (error instanceof Error ? error.message : String(error))]
    };
  }
}

// Export all helpers
export const TenantDB = {
  setContext: setTenantContext,
  clearContext: clearTenantContext,
  getContext: getCurrentTenantContext,
  verifyContext: verifyTenantContext,
  withContext: withTenantContext,
  withContextTrx: withTenantContextTrx,
  withJobContext: withJobTenantContext,
  withBatch: withTenantBatch,
  query: tenantQuery,
  verifyRLS: verifyRLSConfiguration,
  verifyTenantRLS: verifyTenantBasedRLS,
  selectForUpdate: selectTicketsForUpdate,
  isValidTenantId
};
