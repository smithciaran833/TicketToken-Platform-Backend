import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IJob {
  id?: string;
  queue: string;
  type: string;
  data?: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts?: number;
  max_attempts?: number;
  error?: string;
  scheduled_for?: Date;
  started_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class JobModel {
  private db: Knex;
  private tableName = 'jobs';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IJob): Promise<IJob> {
    const [job] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return job;
  }

  async findById(id: string): Promise<IJob | null> {
    const job = await this.db(this.tableName)
      .where({ id })
      .first();
    return job || null;
  }

  async findPending(queue: string, limit = 10): Promise<IJob[]> {
    return this.db(this.tableName)
      .where({ queue, status: 'pending' })
      .where('scheduled_for', '<=', new Date())
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  async update(id: string, data: Partial<IJob>): Promise<IJob | null> {
    const [job] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return job || null;
  }

  async markAsProcessing(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id, status: 'pending' })
      .update({ status: 'processing', started_at: new Date() });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default JobModel;
