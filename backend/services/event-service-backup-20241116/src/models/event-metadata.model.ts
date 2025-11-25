import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventMetadata {
  id?: string;
  event_id: string;
  performers?: any[];
  headliner?: string;
  supporting_acts?: string[];
  production_company?: string;
  technical_requirements?: Record<string, any>;
  stage_setup_time_hours?: number;
  sponsors?: any[];
  primary_sponsor?: string;
  performance_rights_org?: string;
  licensing_requirements?: string[];
  insurance_requirements?: Record<string, any>;
  press_release?: string;
  marketing_copy?: Record<string, any>;
  social_media_copy?: Record<string, any>;
  sound_requirements?: Record<string, any>;
  lighting_requirements?: Record<string, any>;
  video_requirements?: Record<string, any>;
  catering_requirements?: Record<string, any>;
  rider_requirements?: Record<string, any>;
  production_budget?: number;
  marketing_budget?: number;
  projected_revenue?: number;
  break_even_capacity?: number;
  previous_events?: any[];
  custom_fields?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

export class EventMetadataModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('event_metadata', db);
  }

  async findByEventId(eventId: string): Promise<IEventMetadata | null> {
    return this.db(this.tableName)
      .where({ event_id: eventId })
      .first();
  }

  async upsert(eventId: string, metadata: Partial<IEventMetadata>): Promise<IEventMetadata> {
    const existing = await this.findByEventId(eventId);

    if (existing) {
      const [updated] = await this.db(this.tableName)
        .where({ event_id: eventId })
        .update({
          ...metadata,
          updated_at: new Date()
        })
        .returning('*');
      return updated;
    } else {
      const [created] = await this.db(this.tableName)
        .insert({
          event_id: eventId,
          ...metadata
        })
        .returning('*');
      return created;
    }
  }
}
