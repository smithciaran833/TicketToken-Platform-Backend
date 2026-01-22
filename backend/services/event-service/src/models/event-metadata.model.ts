import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventMetadata {
  id?: string;
  event_id: string;
  tenant_id?: string; // AUDIT FIX: Added for defense-in-depth
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

  /**
   * AUDIT FIX (HIGH): Fixed race condition by using INSERT ... ON CONFLICT
   * instead of SELECT + INSERT/UPDATE pattern.
   * 
   * This makes the upsert operation atomic and prevents duplicate records
   * from being created by concurrent requests.
   */
  async upsert(eventId: string, metadata: Partial<IEventMetadata>): Promise<IEventMetadata> {
    const dataToUpsert = {
      event_id: eventId,
      ...metadata,
      updated_at: new Date()
    };

    // Build column lists for the query
    const columns = Object.keys(dataToUpsert);
    const values = Object.values(dataToUpsert);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    // Build UPDATE clause (excluding event_id from updates)
    const updateColumns = columns.filter(col => col !== 'event_id');
    const updateClause = updateColumns
      .map(col => `${col} = EXCLUDED.${col}`)
      .join(', ');

    // Use INSERT ... ON CONFLICT for atomic upsert
    const [result] = await this.db.raw(`
      INSERT INTO event_metadata (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (event_id)
      DO UPDATE SET ${updateClause}
      RETURNING *
    `, values);

    return result.rows?.[0] || result;
  }
}
