import { Knex } from 'knex';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

export class VenueAuditLogger {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async log(action: string, userId: string, venueId: string, data?: any): Promise<void> {
    try {
      await this.db('audit_logs').insert({
        id: uuidv4(),
        entity_type: 'venue',  // Required NOT NULL field
        entity_id: venueId,    // Required NOT NULL field
        action: action,        // Required NOT NULL field (e.g., 'venue_created')
        user_id: userId,
        changes: data?.changes || null,
        metadata: data?.metadata || { venueData: data },
        ip_address: data?.ipAddress || null,
        user_agent: data?.userAgent || null,
        created_at: new Date(),
        resource_type: 'venue',
        resource_id: venueId,
        status: 'success'
      });
      
      logger.debug({ action, venueId, userId }, 'Audit log created');
    } catch (error) {
      logger.error({ error, action, venueId, userId }, 'Failed to write audit log to database');
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  }
}
