import Knex = require('knex');
import { db as knex } from '../config/database';

export interface IQueue {
  id?: string;
  name: string;
  type: string;
  config?: any;
  active: boolean;
  pending_count?: number;
  processing_count?: number;
  completed_count?: number;
  failed_count?: number;
  created_at?: Date;
  updated_at?: Date;
}

export class QueueModel {
  private db: Knex;
  private tableName = 'queues';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IQueue): Promise<IQueue> {
    const [queue] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return queue;
  }

  async findById(id: string): Promise<IQueue | null> {
    const queue = await this.db(this.tableName)
      .where({ id })
      .first();
    return queue || null;
  }

  async findByName(name: string): Promise<IQueue | null> {
    return this.db(this.tableName)
      .where({ name })
      .first();
  }

  async findAll(filters: Partial<IQueue> = {}): Promise<IQueue[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IQueue>): Promise<IQueue | null> {
    const [queue] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return queue || null;
  }

  async incrementCounter(id: string, counter: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .increment(`${counter}_count`, 1);
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default QueueModel;
