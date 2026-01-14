import Knex = require('knex');
import { db as knex } from '../config/database';

export interface IIntegration {
  id?: string;
  name: string;
  provider: string;
  status: 'active' | 'inactive' | 'error';
  config?: any;
  credentials?: any;
  last_sync?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class IntegrationModel {
  private db: Knex;
  private tableName = 'integrations';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IIntegration): Promise<IIntegration> {
    const [integration] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return integration;
  }

  async findById(id: string): Promise<IIntegration | null> {
    const integration = await this.db(this.tableName)
      .where({ id })
      .first();
    return integration || null;
  }

  async findAll(filters: Partial<IIntegration> = {}): Promise<IIntegration[]> {
    return this.db(this.tableName).where(filters);
  }

  async update(id: string, data: Partial<IIntegration>): Promise<IIntegration | null> {
    const [integration] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return integration || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default IntegrationModel;
