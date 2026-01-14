import { Knex } from 'knex';
import { db as knex } from '../config/database';
import logger from '../utils/logger';

export interface IMint {
  id?: string;
  tenant_id?: string;
  ticket_id: string;
  nft_id?: string;
  status: 'pending' | 'minting' | 'completed' | 'failed';
  transaction_hash?: string;
  blockchain: string;
  error?: string;
  retry_count?: number;
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date;
  // Soft delete support (#6 - DB3)
  deleted_at?: Date | null;
  deleted_by?: string | null;
}

// Type for records that haven't been soft deleted
export type ActiveMint = IMint & { deleted_at: null };

// Fields that should NEVER be modified after creation
const IMMUTABLE_FIELDS = ['id', 'tenant_id', 'ticket_id', 'created_at'] as const;

/**
 * Strip immutable fields from update payloads
 * Prevents tenant_id and other protected fields from being modified
 */
function stripImmutableFields<T extends Record<string, any>>(data: T): Omit<T, typeof IMMUTABLE_FIELDS[number]> {
  const safeData = { ...data };
  
  for (const field of IMMUTABLE_FIELDS) {
    if (field in safeData) {
      logger.warn(`Attempted to modify immutable field: ${field}`, {
        field,
        value: safeData[field as keyof T]
      });
      delete safeData[field as keyof T];
    }
  }
  
  return safeData;
}

export class MintModel {
  private db: Knex;
  private tableName = 'nft_mints';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  // ==========================================================================
  // QUERY BUILDERS WITH SOFT DELETE SCOPE (#6 - DB3)
  // ==========================================================================

  /**
   * Base query that excludes soft-deleted records
   * Use this for all normal queries
   */
  private activeQuery(): Knex.QueryBuilder {
    return this.db(this.tableName).whereNull('deleted_at');
  }

  /**
   * Query including soft-deleted records
   * Use only when you need to see deleted data (admin, audit)
   */
  private allQuery(): Knex.QueryBuilder {
    return this.db(this.tableName);
  }

  /**
   * Query only soft-deleted records
   * Use for deleted record management
   */
  private deletedQuery(): Knex.QueryBuilder {
    return this.db(this.tableName).whereNotNull('deleted_at');
  }

  // ==========================================================================
  // CREATE - Always uses RETURNING (#7 - DB4)
  // ==========================================================================

  /**
   * Create a new mint record
   * @returns Created record with all fields (uses RETURNING *)
   */
  async create(data: IMint): Promise<IMint> {
    const [mint] = await this.db(this.tableName)
      .insert({
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      })
      .returning('*');  // #7 - Always use RETURNING clause
    
    logger.info('Mint record created', {
      id: mint.id,
      ticketId: mint.ticket_id,
      tenantId: mint.tenant_id
    });
    
    return mint;
  }

  // ==========================================================================
  // READ - Excludes soft-deleted by default
  // ==========================================================================

  /**
   * Find a mint by ID (excludes deleted)
   */
  async findById(id: string, tenantId?: string): Promise<IMint | null> {
    let query = this.activeQuery().where({ id });
    
    if (tenantId) {
      query = query.where('tenant_id', tenantId);
    }
    
    const mint = await query.first();
    return mint || null;
  }

  /**
   * Find a mint by ID including deleted (for admin/audit)
   */
  async findByIdIncludeDeleted(id: string, tenantId?: string): Promise<IMint | null> {
    let query = this.allQuery().where({ id });
    
    if (tenantId) {
      query = query.where('tenant_id', tenantId);
    }
    
    const mint = await query.first();
    return mint || null;
  }

  /**
   * Find a mint by ticket ID (excludes deleted)
   */
  async findByTicketId(ticketId: string, tenantId: string): Promise<IMint | null> {
    const mint = await this.activeQuery()
      .where({ ticket_id: ticketId, tenant_id: tenantId })
      .first();
    return mint || null;
  }

  /**
   * Find pending mints (excludes deleted)
   */
  async findPending(limit = 10, tenantId?: string): Promise<IMint[]> {
    let query = this.activeQuery()
      .where({ status: 'pending' })
      .where('retry_count', '<', 3)
      .orderBy('created_at', 'asc')
      .limit(limit);
    
    if (tenantId) {
      query = query.where('tenant_id', tenantId);
    }
    
    return query;
  }

  /**
   * Find mints by status (excludes deleted)
   */
  async findByStatus(
    status: IMint['status'],
    tenantId?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<IMint[]> {
    let query = this.activeQuery()
      .where({ status })
      .orderBy('created_at', 'desc');
    
    if (tenantId) {
      query = query.where('tenant_id', tenantId);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    return query;
  }

  /**
   * Find deleted mints (for admin recovery)
   */
  async findDeleted(tenantId?: string, limit = 100): Promise<IMint[]> {
    let query = this.deletedQuery()
      .orderBy('deleted_at', 'desc')
      .limit(limit);
    
    if (tenantId) {
      query = query.where('tenant_id', tenantId);
    }
    
    return query;
  }

  // ==========================================================================
  // UPDATE - Uses RETURNING, excludes soft-deleted
  // ==========================================================================

  /**
   * Update a mint record
   * SECURITY: tenant_id and other immutable fields are automatically stripped
   * @returns Updated record (uses RETURNING *)
   */
  async update(id: string, data: Partial<IMint>, tenantId?: string): Promise<IMint | null> {
    // SECURITY: Strip immutable fields to prevent tenant_id modification
    const safeData = stripImmutableFields(data);
    
    // Also strip soft delete fields - use dedicated methods for those
    delete (safeData as any).deleted_at;
    delete (safeData as any).deleted_by;
    
    // Add updated_at timestamp
    const updateData = {
      ...safeData,
      updated_at: new Date()
    };
    
    let query = this.activeQuery().where({ id });
    
    if (tenantId) {
      query = query.where('tenant_id', tenantId);
    }
    
    const [mint] = await query.update(updateData).returning('*');  // #7 - Always use RETURNING
    
    if (mint) {
      logger.info('Mint record updated', {
        id: mint.id,
        ticketId: mint.ticket_id,
        tenantId: mint.tenant_id
      });
    }
    
    return mint || null;
  }

  // ==========================================================================
  // SOFT DELETE (#6 - DB3)
  // ==========================================================================

  /**
   * Soft delete a mint record
   * Sets deleted_at timestamp instead of actually deleting
   * @returns Deleted record (uses RETURNING *)
   */
  async softDelete(
    id: string, 
    tenantId: string, 
    deletedBy?: string
  ): Promise<IMint | null> {
    let query = this.activeQuery()
      .where({ id, tenant_id: tenantId });
    
    const [mint] = await query
      .update({
        deleted_at: new Date(),
        deleted_by: deletedBy || null,
        updated_at: new Date()
      })
      .returning('*');  // #7 - Always use RETURNING
    
    if (mint) {
      logger.info('Mint record soft deleted', {
        id: mint.id,
        ticketId: mint.ticket_id,
        tenantId: mint.tenant_id,
        deletedBy
      });
    }
    
    return mint || null;
  }

  /**
   * Restore a soft-deleted mint record
   * @returns Restored record (uses RETURNING *)
   */
  async restore(id: string, tenantId: string): Promise<IMint | null> {
    let query = this.deletedQuery()
      .where({ id, tenant_id: tenantId });
    
    const [mint] = await query
      .update({
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date()
      })
      .returning('*');  // #7 - Always use RETURNING
    
    if (mint) {
      logger.info('Mint record restored', {
        id: mint.id,
        ticketId: mint.ticket_id,
        tenantId: mint.tenant_id
      });
    }
    
    return mint || null;
  }

  /**
   * Permanently delete a mint record (hard delete)
   * Use with caution - prefer softDelete for normal operations
   * Requires explicit confirmation flag
   */
  async hardDelete(
    id: string, 
    tenantId: string, 
    options: { confirm: boolean } = { confirm: false }
  ): Promise<boolean> {
    if (!options.confirm) {
      logger.warn('Hard delete attempted without confirmation', { id, tenantId });
      return false;
    }
    
    const deleted = await this.allQuery()
      .where({ id, tenant_id: tenantId })
      .del();
    
    if (deleted > 0) {
      logger.warn('Mint record permanently deleted', {
        id,
        tenantId,
        warning: 'This action cannot be undone'
      });
    }
    
    return deleted > 0;
  }

  /**
   * @deprecated Use softDelete instead for audit trail
   * Hard delete kept for backwards compatibility
   */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    logger.warn('Using deprecated delete method - prefer softDelete', { id, tenantId });
    
    if (!tenantId) {
      logger.error('Hard delete without tenantId is not allowed');
      return false;
    }
    
    // Redirect to soft delete for safety
    const result = await this.softDelete(id, tenantId);
    return result !== null;
  }

  // ==========================================================================
  // STATISTICS & COUNTS
  // ==========================================================================

  /**
   * Count mints by status (excludes deleted)
   */
  async countByStatus(tenantId?: string): Promise<Record<string, number>> {
    let query = this.activeQuery()
      .select('status')
      .count('* as count')
      .groupBy('status');
    
    if (tenantId) {
      query = query.where('tenant_id', tenantId);
    }
    
    const results = await query;
    const counts: Record<string, number> = {
      pending: 0,
      minting: 0,
      completed: 0,
      failed: 0
    };
    
    for (const row of results) {
      counts[row.status] = parseInt(row.count as string, 10);
    }
    
    return counts;
  }

  /**
   * Get total counts including deleted
   */
  async getCounts(tenantId?: string): Promise<{
    total: number;
    active: number;
    deleted: number;
  }> {
    let baseQuery = this.db(this.tableName);
    if (tenantId) {
      baseQuery = baseQuery.where('tenant_id', tenantId);
    }
    
    const [total, deleted] = await Promise.all([
      baseQuery.clone().count('* as count').first(),
      baseQuery.clone().whereNotNull('deleted_at').count('* as count').first()
    ]);
    
    const totalCount = parseInt((total as any)?.count || '0', 10);
    const deletedCount = parseInt((deleted as any)?.count || '0', 10);
    
    return {
      total: totalCount,
      active: totalCount - deletedCount,
      deleted: deletedCount
    };
  }
}

export default MintModel;
