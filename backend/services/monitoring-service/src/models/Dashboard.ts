import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IDashboard {
  id?: string;
  name: string;
  description?: string;
  widgets?: any[];
  layout?: any;
  owner?: string;
  shared?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class DashboardModel {
  private db: Knex;
  private tableName = 'dashboards';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IDashboard): Promise<IDashboard> {
    const [dashboard] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return dashboard;
  }

  async findById(id: string): Promise<IDashboard | null> {
    const dashboard = await this.db(this.tableName)
      .where({ id })
      .first();
    return dashboard || null;
  }

  async findByOwner(owner: string): Promise<IDashboard[]> {
    return this.db(this.tableName)
      .where({ owner })
      .orWhere({ shared: true })
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IDashboard>): Promise<IDashboard | null> {
    const [dashboard] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return dashboard || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default DashboardModel;
