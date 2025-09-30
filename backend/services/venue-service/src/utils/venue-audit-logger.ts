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
      const auditEntry = {
        id: uuidv4(),
        entity_type: 'venue',  // THIS WAS LIKELY MISSING
        entity_id: venueId,    // THIS WAS LIKELY MISSING
        action: action || 'venue_created',
        user_id: userId,
        changes: data?.changes || null,
        metadata: data || null,
        ip_address: data?.ipAddress || null,
        user_agent: data?.userAgent || null,
        created_at: new Date(),
        resource_type: 'venue',
        resource_id: venueId,
        status: 'success'
      };

      await this.db('audit_logs').insert(auditEntry);
      
      logger.info({ action, venueId, userId, tenantId: data?.tenantId }, 'Venue audit log created');
    } catch (error) {
      logger.error({ error, userId, venueId, action }, 'Failed to write audit log to database');
      // Don't throw - audit logging shouldn't break main operations
    }
  }
}
