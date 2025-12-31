import { Knex } from 'knex';
import { logger } from './logger';

const log = logger.child({ component: 'DatabaseHelpers' });

// Error codes for serialization failures (RC3)
const SERIALIZATION_ERROR_CODES = ['40001', '40P01'];
const MAX_SERIALIZATION_RETRIES = 3;

/**
 * SECURITY FIX (LK5): Database helpers for safe concurrent operations
 * 
 * Provides utilities for:
 * - Row-level locking (FOR UPDATE)
 * - Optimistic locking
 * - Safe read-modify-write patterns
 */

/**
 * Lock mode options for SELECT ... FOR UPDATE
 */
export enum LockMode {
  /** Exclusive lock - blocks all other locks */
  FOR_UPDATE = 'FOR UPDATE',
  /** Shared lock - allows other reads */
  FOR_SHARE = 'FOR SHARE',
  /** Skip locked rows instead of waiting */
  FOR_UPDATE_SKIP_LOCKED = 'FOR UPDATE SKIP LOCKED',
  /** Don't wait for lock, fail immediately */
  FOR_UPDATE_NOWAIT = 'FOR UPDATE NOWAIT',
}

/**
 * SECURITY FIX (LK5): Execute a query with row-level locking
 * Use for critical read-modify-write operations
 * 
 * @example
 * const venue = await withLock(
 *   trx('venues').where('id', venueId).first(),
 *   trx,
 *   LockMode.FOR_UPDATE
 * );
 */
export async function withLock<T>(
  query: Knex.QueryBuilder,
  trx: Knex.Transaction,
  lockMode: LockMode = LockMode.FOR_UPDATE
): Promise<T | undefined> {
  // Build the query with locking
  const sql = query.toSQL();
  const lockedQuery = `${sql.sql} ${lockMode}`;
  
  log.debug({ query: sql.sql, lockMode }, 'Executing locked query');
  
  const result = await trx.raw(lockedQuery, sql.bindings);
  return result.rows?.[0];
}

/**
 * SECURITY FIX (LK5): Lock and fetch a single row by ID
 */
export async function lockRowById<T>(
  trx: Knex.Transaction,
  table: string,
  id: string,
  lockMode: LockMode = LockMode.FOR_UPDATE
): Promise<T | undefined> {
  const result = await trx.raw(
    `SELECT * FROM "${table}" WHERE id = ? ${lockMode}`,
    [id]
  );
  return result.rows?.[0];
}

/**
 * SECURITY FIX (LK5): Lock multiple rows by IDs
 */
export async function lockRowsByIds<T>(
  trx: Knex.Transaction,
  table: string,
  ids: string[],
  lockMode: LockMode = LockMode.FOR_UPDATE
): Promise<T[]> {
  if (ids.length === 0) return [];
  
  const placeholders = ids.map(() => '?').join(', ');
  const result = await trx.raw(
    `SELECT * FROM "${table}" WHERE id IN (${placeholders}) ${lockMode}`,
    ids
  );
  return result.rows || [];
}

/**
 * SECURITY FIX (RC5): Optimistic locking helper
 * Updates a row only if the version matches
 * 
 * @returns true if update succeeded, false if version mismatch
 */
export async function optimisticUpdate(
  db: Knex,
  table: string,
  id: string,
  currentVersion: number,
  updates: Record<string, any>
): Promise<boolean> {
  const result = await db(table)
    .where('id', id)
    .where('version', currentVersion)
    .update({
      ...updates,
      version: currentVersion + 1,
      updated_at: new Date(),
    });
  
  if (result === 0) {
    log.warn({ table, id, currentVersion }, 'Optimistic lock conflict');
    return false;
  }
  
  return true;
}

/**
 * Safe read-modify-write pattern with retries
 * Handles serialization failures automatically
 */
export async function safeReadModifyWrite<T, R>(
  db: Knex,
  options: {
    /** Read the current state */
    read: (trx: Knex.Transaction) => Promise<T | undefined>;
    /** Modify and return the new state */
    modify: (current: T, trx: Knex.Transaction) => Promise<R>;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Lock mode for read */
    lockMode?: LockMode;
  }
): Promise<R> {
  const maxRetries = options.maxRetries ?? 3;
  const lockMode = options.lockMode ?? LockMode.FOR_UPDATE;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.transaction(async (trx) => {
        const current = await options.read(trx);
        
        if (!current) {
          throw new Error('Resource not found');
        }
        
        return options.modify(current, trx);
      });
    } catch (error: any) {
      // PostgreSQL serialization failure codes
      const isSerializationError = 
        error.code === '40001' || // serialization_failure
        error.code === '40P01';   // deadlock_detected
      
      if (isSerializationError && attempt < maxRetries) {
        log.warn({ attempt, maxRetries, error: error.code }, 'Serialization failure, retrying');
        // Exponential backoff
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

/**
 * Set tenant context in transaction for RLS enforcement
 */
export async function setTenantContext(
  trx: Knex.Transaction,
  tenantId: string
): Promise<void> {
  await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}

/**
 * Create a tenant-scoped transaction
 */
export async function withTenantTransaction<T>(
  db: Knex,
  tenantId: string,
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (trx) => {
    await setTenantContext(trx, tenantId);
    return callback(trx);
  });
}

/**
 * SECURITY FIX (KQ3): Tenant-aware query builder wrapper
 * Automatically adds tenant_id filter to all queries
 */
export class TenantAwareQueryBuilder {
  private db: Knex;
  private tenantId: string;

  constructor(db: Knex, tenantId: string) {
    if (!tenantId) {
      throw new Error('tenantId is required for tenant-aware queries');
    }
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * Create a query builder for a table with automatic tenant filtering
   */
  table<T = any>(tableName: string): Knex.QueryBuilder<T> {
    return this.db(tableName).where('tenant_id', this.tenantId) as Knex.QueryBuilder<T>;
  }

  /**
   * Insert with automatic tenant_id injection
   */
  async insert(tableName: string, data: Record<string, any> | Record<string, any>[]): Promise<any[]> {
    const records = Array.isArray(data) ? data : [data];
    const withTenant = records.map(r => ({ ...r, tenant_id: this.tenantId }));
    return this.db(tableName).insert(withTenant).returning('*');
  }

  /**
   * Update with automatic tenant_id filter
   */
  async update(tableName: string, id: string, data: Record<string, any>): Promise<number> {
    // Remove tenant_id from data to prevent accidental modification
    const { tenant_id, ...updateData } = data;
    return this.db(tableName)
      .where('id', id)
      .where('tenant_id', this.tenantId)
      .update(updateData);
  }

  /**
   * Delete with automatic tenant_id filter
   */
  async delete(tableName: string, id: string): Promise<number> {
    return this.db(tableName)
      .where('id', id)
      .where('tenant_id', this.tenantId)
      .delete();
  }

  /**
   * Get a single record by ID with tenant filter
   */
  async findById(tableName: string, id: string): Promise<any | undefined> {
    return this.db(tableName)
      .where('id', id)
      .where('tenant_id', this.tenantId)
      .first();
  }

  /**
   * Run raw query with tenant context set
   */
  async raw(sql: string, bindings: any[]): Promise<any> {
    return this.db.transaction(async (trx: Knex.Transaction) => {
      await setTenantContext(trx, this.tenantId);
      return trx.raw(sql, bindings);
    });
  }
}

/**
 * SECURITY FIX (KQ3): Create a tenant-aware query builder
 */
export function createTenantQuery(db: Knex, tenantId: string): TenantAwareQueryBuilder {
  return new TenantAwareQueryBuilder(db, tenantId);
}

/**
 * SECURITY FIX (QP7): Atomic increment helper
 * Uses database expression to avoid read-modify-write race conditions
 */
export async function atomicIncrement(
  db: Knex,
  table: string,
  id: string,
  column: string,
  amount: number = 1,
  tenantId?: string
): Promise<number> {
  const query = db(table)
    .where('id', id)
    .update({ [column]: db.raw(`${column} + ?`, [amount]) });
  
  if (tenantId) {
    query.where('tenant_id', tenantId);
  }
  
  return query;
}

/**
 * SECURITY FIX (QP7): Atomic decrement with floor at 0
 */
export async function atomicDecrement(
  db: Knex,
  table: string,
  id: string,
  column: string,
  amount: number = 1,
  tenantId?: string
): Promise<number> {
  const query = db(table)
    .where('id', id)
    .update({ [column]: db.raw(`GREATEST(0, ${column} - ?)`, [amount]) });
  
  if (tenantId) {
    query.where('tenant_id', tenantId);
  }
  
  return query;
}

/**
 * SECURITY FIX (QP7): Atomic update with expression
 */
export async function atomicUpdate(
  db: Knex,
  table: string,
  id: string,
  updates: Record<string, Knex.Raw | any>,
  tenantId?: string
): Promise<number> {
  const query = db(table).where('id', id).update(updates);
  
  if (tenantId) {
    query.where('tenant_id', tenantId);
  }
  
  return query;
}

/**
 * SECURITY FIX (BH1): Bulkhead/Semaphore for external call isolation
 * Limits concurrent calls to external services
 */
export class Bulkhead {
  private name: string;
  private maxConcurrent: number;
  private currentConcurrent: number = 0;
  private queue: Array<() => void> = [];

  constructor(name: string, maxConcurrent: number) {
    this.name = name;
    this.maxConcurrent = maxConcurrent;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for slot
    await this.acquire();
    
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.currentConcurrent < this.maxConcurrent) {
      this.currentConcurrent++;
      return;
    }

    // Wait in queue
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.currentConcurrent++;
        resolve();
      });
    });
  }

  private release(): void {
    this.currentConcurrent--;
    
    // Process next in queue
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  getStats(): { name: string; concurrent: number; maxConcurrent: number; queued: number } {
    return {
      name: this.name,
      concurrent: this.currentConcurrent,
      maxConcurrent: this.maxConcurrent,
      queued: this.queue.length,
    };
  }
}

// Pre-configured bulkheads for external services
export const bulkheads = {
  stripe: new Bulkhead('stripe', 10),
  database: new Bulkhead('database', 20),
  redis: new Bulkhead('redis', 50),
  externalApi: new Bulkhead('externalApi', 5),
};

// All functions exported with 'export' keyword at definition
