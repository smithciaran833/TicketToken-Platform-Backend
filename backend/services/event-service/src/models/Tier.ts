import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface ITier {
  id?: string;
  event_id: string;
  name: string;
  description?: string;
  price: number;
  total_quantity: number;
  available_quantity: number;
  metadata?: any;
  created_at?: Date;
}

export class TierModel {
  private db: Knex;
  private tableName = 'ticket_types';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ITier): Promise<ITier> {
    const [tier] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return tier;
  }

  async findById(id: string): Promise<ITier | null> {
    const tier = await this.db(this.tableName)
      .where({ id })
      .first();
    return tier || null;
  }

  async findByEventId(eventId: string): Promise<ITier[]> {
    return this.db(this.tableName)
      .where({ event_id: eventId })
      .orderBy('price', 'asc');
  }

  async update(id: string, data: Partial<ITier>): Promise<ITier | null> {
    const [tier] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return tier || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }

  async decrementAvailability(id: string, quantity: number): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .where('available_quantity', '>=', quantity)
      .decrement('available_quantity', quantity);
    return result > 0;
  }
}

export default TierModel;
