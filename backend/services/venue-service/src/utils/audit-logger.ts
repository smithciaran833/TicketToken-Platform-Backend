import { Knex } from 'knex';
import { logger } from './logger';

export class VenueAuditLogger {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async log(action: string, userId: string, venueId: string, data?: any): Promise<void> {
    try {
      const auditEntry: any = {
        entity_type: 'venue',
        entity_id: venueId,
        action: action,
        user_id: userId,
        changes: data?.changes || null,
        metadata: data?.metadata || { venueData: data },
        user_agent: data?.userAgent || null,
        resource_type: 'venue',
        resource_id: venueId,
        status: 'success'
      };

      // Only add ip_address if it's a valid IP
      if (data?.ipAddress && data.ipAddress !== '00000000') {
        auditEntry.ip_address = data.ipAddress;
      }

      await this.db('audit_logs').insert(auditEntry);
      
      logger.debug({ action, venueId, userId }, 'Audit log created');
    } catch (error) {
      logger.error({ error, action, venueId, userId }, 'Failed to write audit log to database');
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  }
}
export const createAuditLogger = (db: any) => { return { log: () => {} }; };
