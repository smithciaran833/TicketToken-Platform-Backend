import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IVenue {
  id?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  capacity?: number;
  metadata?: any;
  created_at?: Date;
}

export class VenueModel {
  private db: Knex;
  private tableName = 'venues';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IVenue): Promise<IVenue> {
    const [venue] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return venue;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await this.db(this.tableName)
      .where({ id })
      .first();
    return venue || null;
  }

  async findAll(filters: Partial<IVenue> = {}): Promise<IVenue[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IVenue>): Promise<IVenue | null> {
    const [venue] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return venue || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default VenueModel;
