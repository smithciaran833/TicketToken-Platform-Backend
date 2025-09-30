import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IMetric {
  id?: string;
  name: string;
  value: number;
  unit?: string;
  service: string;
  tags?: any;
  timestamp: Date;
  created_at?: Date;
}

export class MetricModel {
  private db: Knex;
  private tableName = 'metrics';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IMetric): Promise<IMetric> {
    const [metric] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return metric;
  }

  async findById(id: string): Promise<IMetric | null> {
    const metric = await this.db(this.tableName)
      .where({ id })
      .first();
    return metric || null;
  }

  async findByService(service: string, startTime?: Date, endTime?: Date): Promise<IMetric[]> {
    let query = this.db(this.tableName).where({ service });
    
    if (startTime) {
      query = query.where('timestamp', '>=', startTime);
    }
    if (endTime) {
      query = query.where('timestamp', '<=', endTime);
    }
    
    return query.orderBy('timestamp', 'desc');
  }

  async findByName(name: string, limit = 100): Promise<IMetric[]> {
    return this.db(this.tableName)
      .where({ name })
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    return this.db(this.tableName)
      .where('timestamp', '<', date)
      .del();
  }
}

export default MetricModel;
