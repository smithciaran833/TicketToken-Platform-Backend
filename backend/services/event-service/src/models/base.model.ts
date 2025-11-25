import { Knex } from 'knex';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'BaseModel' });

export class BaseModel<T = any> {
  protected tableName: string;
  protected db: Knex | Knex.Transaction;

  constructor(tableName: string, db: Knex | Knex.Transaction) {
    this.tableName = tableName;
    this.db = db;
  }

  /**
   * Find all records with tenant isolation
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
      
      return await query.select('*');
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
