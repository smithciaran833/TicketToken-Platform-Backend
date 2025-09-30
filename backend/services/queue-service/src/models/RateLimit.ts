import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IRateLimit {
  id?: string;
  key: string;
  limit: number;
  window_seconds: number;
  current_count: number;
  reset_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class RateLimitModel {
  private db: Knex;
  private tableName = 'rate_limits';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IRateLimit): Promise<IRateLimit> {
    const [rateLimit] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return rateLimit;
  }

  async findByKey(key: string): Promise<IRateLimit | null> {
    const rateLimit = await this.db(this.tableName)
      .where({ key })
      .first();
    return rateLimit || null;
  }

  async increment(key: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ key })
      .where('reset_at', '>', new Date())
      .increment('current_count', 1);
    return result > 0;
  }

  async reset(key: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ key })
      .update({ 
        current_count: 0, 
        reset_at: new Date(Date.now() + 1000 * 60 * 60) 
      });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default RateLimitModel;
