import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IPerformer {
  id?: string;
  name: string;
  bio?: string;
  image_url?: string;
  genre?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class PerformerModel {
  private db: Knex;
  private tableName = 'performers';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IPerformer): Promise<IPerformer> {
    const [performer] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return performer;
  }

  async findById(id: string): Promise<IPerformer | null> {
    const performer = await this.db(this.tableName)
      .where({ id })
      .first();
    return performer || null;
  }

  async findAll(filters: Partial<IPerformer> = {}): Promise<IPerformer[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IPerformer>): Promise<IPerformer | null> {
    const [performer] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return performer || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default PerformerModel;
