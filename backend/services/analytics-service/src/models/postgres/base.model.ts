import { getDb } from '../../config/database';

export interface BaseEntity {
  id: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}

export abstract class BaseModel<T extends BaseEntity> {
  protected abstract tableName: string;

  async findById(id: string, tenantId: string): Promise<T | null> {
    const db = getDb();
    const record = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .first();
    return record || null;
  }

  async findAll(tenantId: string, options: { limit?: number; offset?: number } = {}): Promise<T[]> {
    const db = getDb();
    let query = db(this.tableName)
      .where({ tenant_id: tenantId })
      .orderBy('created_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }

    return query;
  }

  async create(data: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T> {
    const db = getDb();
    const [created] = await db(this.tableName).insert(data).returning('*');
    return created;
  }

  async update(id: string, tenantId: string, updates: Partial<T>): Promise<T | null> {
    const db = getDb();
    const [updated] = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .update(updates)
      .returning('*');
    return updated || null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const deleted = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .delete();
    return deleted > 0;
  }

  async count(tenantId: string, conditions: Partial<T> = {}): Promise<number> {
    const db = getDb();
    const result = await db(this.tableName)
      .where({ tenant_id: tenantId, ...conditions })
      .count('* as count')
      .first();
    return parseInt(result?.count as string) || 0;
  }
}
