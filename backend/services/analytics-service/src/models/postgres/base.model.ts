import { getDb } from '../../config/database';
import { logger } from '../../utils/logger';

export abstract class BaseModel {
  protected static tableName: string;
  protected static db = getDb;
  
  protected static async query(sql: string, params?: any[]): Promise<any> {
    try {
      const db = this.db();
      return await db.raw(sql, params);
    } catch (error) {
      logger.error(`Query error in ${this.tableName}:`, error);
      throw error;
    }
  }
  
  protected static async transaction<T>(
    callback: (trx: any) => Promise<T>
  ): Promise<T> {
    const db = this.db();
    return await db.transaction(callback);
  }
  
  static async findById(id: string): Promise<any> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .first();
    return result;
  }
  
  static async findAll(
    filters: Record<string, any> = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: 'asc' | 'desc';
    } = {}
  ): Promise<any[]> {
    const db = this.db();
    let query = db(this.tableName).where(filters);
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.order || 'asc');
    }
    
    return await query;
  }
  
  static async create(data: Record<string, any>): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .insert(data)
      .returning('*');
    return result;
  }
  
  static async update(
    id: string,
    data: Record<string, any>
  ): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');
    return result;
  }
  
  static async delete(id: string): Promise<boolean> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .delete();
    return result > 0;
  }
}
