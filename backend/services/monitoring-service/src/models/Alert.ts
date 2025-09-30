import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IAlert {
  id?: string;
  name: string;
  type: 'error' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  source: string;
  metadata?: any;
  resolved?: boolean;
  resolved_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class AlertModel {
  private db: Knex;
  private tableName = 'alerts';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IAlert): Promise<IAlert> {
    const [alert] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return alert;
  }

  async findById(id: string): Promise<IAlert | null> {
    const alert = await this.db(this.tableName)
      .where({ id })
      .first();
    return alert || null;
  }

  async findUnresolved(): Promise<IAlert[]> {
    return this.db(this.tableName)
      .where({ resolved: false })
      .orderBy('severity', 'desc')
      .orderBy('created_at', 'desc');
  }

  async update(id: string, data: Partial<IAlert>): Promise<IAlert | null> {
    const [alert] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return alert || null;
  }

  async resolve(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .update({ resolved: true, resolved_at: new Date() });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default AlertModel;
