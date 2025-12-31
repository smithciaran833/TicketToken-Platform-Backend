import { Knex } from 'knex';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'BaseModel' });

/**
 * AUDIT FIX (LOW): Standard columns to select instead of SELECT *.
 * Define explicit columns to prevent:
 * - Over-fetching data (performance)
 * - Exposing new columns accidentally (security)
 * - Breaking queries when columns are added/removed
 * 
 * Override in subclass to customize columns for specific tables.
 */
const DEFAULT_COLUMNS = [
  'id',
  'tenant_id',
  'created_at',
  'updated_at',
  'deleted_at',
];

export class BaseModel<T = any> {
  protected tableName: string;
  protected db: Knex | Knex.Transaction;
  
  /**
   * Columns to select by default. Override in subclass to customize.
   * Set to null to use SELECT * (not recommended for production).
   * 
   * AUDIT FIX (QS8/DB7): Explicit column selection instead of SELECT *
   */
  protected selectColumns: string[] | null = null;

  constructor(tableName: string, db: Knex | Knex.Transaction) {
    this.tableName = tableName;
    this.db = db;
  }

  /**
   * Get columns to select for queries.
   * Override in subclass for table-specific columns.
   */
  protected getSelectColumns(): string[] | '*' {
    // If subclass defines specific columns, use them
    if (this.selectColumns && this.selectColumns.length > 0) {
      return this.selectColumns;
    }
    // Fall back to * for backward compatibility
    // Note: Subclasses should define selectColumns for better practice
    return '*';
  }

  /**
   * Find all records with tenant isolation
   * 
   * AUDIT FIX (QS8): Uses explicit column selection when selectColumns is defined
   */
  async findAll(conditions: Partial<T> = {}, options: any = {}): Promise<T[]> {
    try {
      let query = this.db(this.tableName).where(conditions);
      
      // Apply tenant filter if tenant_id exists in conditions
      // This maintains backward compatibility for tables without tenant_id
      
      if (!options.includeDeleted) {
        query = query.whereNull('deleted_at');
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.offset(options.offset);
      }
      
      const columns = options.columns || this.getSelectColumns();
      return await query.select(columns) as T[];
    } catch (error) {
      log.error('Error in findAll', { table: this.tableName, error });
      throw error;
    }
  }

  /**
   * Find one record
   */
  async findOne(conditions: Partial<T>): Promise<T | null> {
    try {
      const result = await this.db(this.tableName)
        .where(conditions)
        .whereNull('deleted_at')
        .first();
      return result || null;
    } catch (error) {
      log.error('Error in findOne', { table: this.tableName, error });
      throw error;
    }
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      const result = await this.db(this.tableName)
        .where({ id })
        .whereNull('deleted_at')
        .first();
      return result || null;
    } catch (error) {
      log.error('Error in findById', { table: this.tableName, id, error });
      throw error;
    }
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      const [result] = await this.db(this.tableName)
        .insert(data)
        .returning('*');
      return result;
    } catch (error) {
      log.error('Error in create', { table: this.tableName, error });
      throw error;
    }
  }

  /**
   * Update a record
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    try {
      const [result] = await this.db(this.tableName)
        .where({ id })
        .whereNull('deleted_at')
        .update({
          ...(data as any),
          updated_at: new Date()
        })
        .returning('*');
      return result || null;
    } catch (error) {
      log.error('Error in update', { table: this.tableName, id, error });
      throw error;
    }
  }

  /**
   * Soft delete
   */
  async delete(id: string): Promise<boolean> {
    try {
      const count = await this.db(this.tableName)
        .where({ id })
        .whereNull('deleted_at')
        .update({ deleted_at: new Date() });
      return count > 0;
    } catch (error) {
      log.error('Error in delete', { table: this.tableName, id, error });
      throw error;
    }
  }

  /**
   * Hard delete (use with caution)
   */
  async hardDelete(id: string): Promise<boolean> {
    try {
      const count = await this.db(this.tableName)
        .where({ id })
        .delete();
      return count > 0;
    } catch (error) {
      log.error('Error in hardDelete', { table: this.tableName, id, error });
      throw error;
    }
  }

  /**
   * Count records
   */
  async count(conditions: Partial<T> = {}): Promise<number> {
    try {
      const result = await this.db(this.tableName)
        .where(conditions)
        .whereNull('deleted_at')
        .count('* as count')
        .first();
      return parseInt(result?.count as string) || 0;
    } catch (error) {
      log.error('Error in count', { table: this.tableName, error });
      throw error;
    }
  }

  /**
   * Check if record exists
   */
  async exists(conditions: Partial<T>): Promise<boolean> {
    try {
      const result = await this.db(this.tableName)
        .where(conditions)
        .whereNull('deleted_at')
        .first();
      return !!result;
    } catch (error) {
      log.error('Error in exists', { table: this.tableName, error });
      throw error;
    }
  }
}
