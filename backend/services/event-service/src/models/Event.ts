import { Knex } from 'knex';
import { createDatabaseConnection } from '../config/database';

const knex = createDatabaseConnection();

export interface IEvent {
  id?: string;
  title: string;
  description?: string;
  category?: string;
  venue_id?: string;
  start_date: Date;
  end_date: Date;
  status?: string;
  image_url?: string;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class EventModel {
  private db: Knex;
  private tableName = 'events';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IEvent): Promise<IEvent> {
    const [event] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return event;
  }

  async findById(id: string): Promise<IEvent | null> {
    const event = await this.db(this.tableName)
      .where({ id })
      .first();
    return event || null;
  }

  async findAll(filters: Partial<IEvent> = {}): Promise<IEvent[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('start_date', 'asc');
  }

  async update(id: string, data: Partial<IEvent>): Promise<IEvent | null> {
    const [event] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return event || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }

  async findByVenue(venueId: string): Promise<IEvent[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .orderBy('start_date', 'asc');
  }
}

export default EventModel;
