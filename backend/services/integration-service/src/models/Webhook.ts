import Knex = require('knex');
import { db as knex } from '../config/database';

export interface IWebhook {
  id?: string;
  integration_id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  last_triggered?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class WebhookModel {
  private db: Knex;
  private tableName = 'webhooks';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IWebhook): Promise<IWebhook> {
    const [webhook] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return webhook;
  }

  async findById(id: string): Promise<IWebhook | null> {
    const webhook = await this.db(this.tableName)
      .where({ id })
      .first();
    return webhook || null;
  }

  async findByIntegrationId(integrationId: string): Promise<IWebhook[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId, active: true });
  }

  async update(id: string, data: Partial<IWebhook>): Promise<IWebhook | null> {
    const [webhook] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return webhook || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default WebhookModel;
