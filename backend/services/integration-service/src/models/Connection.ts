import Knex = require('knex');
import { db as knex } from '../config/database';

export interface IConnection {
  id?: string;
  integration_id: string;
  external_id: string;
  status: 'connected' | 'disconnected' | 'error';
  metadata?: any;
  last_activity?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class ConnectionModel {
  private db: Knex;
  private tableName = 'connections';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IConnection): Promise<IConnection> {
    const [connection] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return connection;
  }

  async findById(id: string): Promise<IConnection | null> {
    const connection = await this.db(this.tableName)
      .where({ id })
      .first();
    return connection || null;
  }

  async findByIntegrationId(integrationId: string): Promise<IConnection[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId });
  }

  async update(id: string, data: Partial<IConnection>): Promise<IConnection | null> {
    const [connection] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return connection || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default ConnectionModel;
