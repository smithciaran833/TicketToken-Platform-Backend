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
        service: 'venue-service',
        action: action || 'venue_created',
        action_type: 'CREATE',
        user_id: userId,
        resource_type: 'venue',
        resource_id: venueId,
        ip_address: data?.ipAddress || null,
        user_agent: data?.userAgent || null,
        metadata: data || {},
        created_at: new Date()
      };

      await this.db('audit_logs').insert(auditEntry);
      logger.info({ action, venueId, userId, tenantId: data?.tenantId }, 'Venue audit log created');
    } catch (error) {
      logger.error({ error, userId, venueId, action }, 'Failed to write audit log to database');
      // Don't throw - audit logging shouldn't break main operations
    }
  }
}
