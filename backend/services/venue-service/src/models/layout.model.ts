import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface ISection {
  id: string;
  name: string;
  rows: number;
  seatsPerRow: number;
  pricing?: {
    basePrice: number;
    dynamicPricing?: boolean;
  };
}

export interface ILayout {
  id?: string;
  venue_id: string;
  name: string;
  type: 'fixed' | 'general_admission' | 'mixed';
  sections?: ISection[];
  capacity: number;
  is_default: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class LayoutModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_layouts', db);
  }

  async findByVenue(venueId: string): Promise<ILayout[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc');
  }

  async getDefaultLayout(venueId: string): Promise<ILayout | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, is_default: true })
      .whereNull('deleted_at')
      .first();
  }

  async setAsDefault(layoutId: string, venueId: string): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await trx(this.tableName)
        .where({ venue_id: venueId })
        .update({ is_default: false });

      await trx(this.tableName)
        .where({ id: layoutId, venue_id: venueId })
        .update({ is_default: true });
    });
  }
}
