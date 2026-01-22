import { Knex } from 'knex';
import { randomUUID } from 'crypto';

/**
 * Base model class providing common CRUD operations with soft delete support.
 * 
 * **SCHEMA REQUIREMENTS:**
 * All tables using this base model MUST have the following columns:
 * - id: string (UUID primary key)
 * - created_at: timestamp (auto-set on insert)
 * - updated_at: timestamp (auto-updated)
 * - deleted_at: timestamp (nullable, for soft deletes)
 * 
 * Child classes are responsible for ensuring their table schema
 * meets these requirements. No runtime validation is performed.
 * 
 * **SOFT DELETE PATTERN:**
 * All queries automatically filter out soft-deleted records using
 * `whereNull('deleted_at')`. Use the `delete()` or `softDelete()`
 * methods to mark records as deleted instead of removing them.
 */
export abstract class BaseModel {
  protected tableName: string;
  protected db: Knex | Knex.Transaction;

  constructor(tableName: string, db: Knex | Knex.Transaction) {
    this.tableName = tableName;
    this.db = db;
  }

  // Helper to create a new instance with transaction
  withTransaction(trx: Knex.Transaction): this {
    const ModelClass = this.constructor as any;
    return new ModelClass(trx);
  }

  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .select(columns)
      .first();
  }

  async findAll(conditions: any = {}, options: any = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', order = 'desc' } = options;

    let query = this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at');

    if (options.columns) {
      query = query.select(options.columns);
    }

    return query
      .orderBy(orderBy, order)
      .limit(limit)
      .offset(offset);
  }

  async create(data: any) {
    const [record] = await this.db(this.tableName)
      .insert(data)
      .returning('*');

    return record;
  }

  async update(id: string, data: any) {
    const [record] = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    return record;
  }

  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        deleted_at: new Date()
      });
  }

  async count(conditions: any = {}): Promise<number> {
    const result = await this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    return parseInt(String(result?.count || '0'), 10);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });

    return result > 0;
  }

  generateId(): string {
    return randomUUID();
  }
}
