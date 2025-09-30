import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ISchedule {
  id?: string;
  name: string;
  cron_expression: string;
  job_type: string;
  job_data?: any;
  active: boolean;
  last_run?: Date;
  next_run?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class ScheduleModel {
  private db: Knex;
  private tableName = 'schedules';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ISchedule): Promise<ISchedule> {
    const [schedule] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return schedule;
  }

  async findById(id: string): Promise<ISchedule | null> {
    const schedule = await this.db(this.tableName)
      .where({ id })
      .first();
    return schedule || null;
  }

  async findActive(): Promise<ISchedule[]> {
    return this.db(this.tableName)
      .where({ active: true })
      .orderBy('next_run', 'asc');
  }

  async update(id: string, data: Partial<ISchedule>): Promise<ISchedule | null> {
    const [schedule] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return schedule || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default ScheduleModel;
