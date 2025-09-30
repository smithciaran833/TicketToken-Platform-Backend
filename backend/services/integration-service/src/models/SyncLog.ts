import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ISyncLog {
  id?: string;
  integration_id: string;
  status: 'success' | 'failed' | 'partial';
  records_synced?: number;
  errors?: any;
  started_at: Date;
  completed_at?: Date;
  created_at?: Date;
}

export class SyncLogModel {
  private db: Knex;
  private tableName = 'sync_logs';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ISyncLog): Promise<ISyncLog> {
    const [log] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return log;
  }

  async findById(id: string): Promise<ISyncLog | null> {
    const log = await this.db(this.tableName)
      .where({ id })
      .first();
    return log || null;
  }

  async findByIntegrationId(integrationId: string, limit = 10): Promise<ISyncLog[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async update(id: string, data: Partial<ISyncLog>): Promise<ISyncLog | null> {
    const [log] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return log || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default SyncLogModel;
