import { Knex } from 'knex';
import { pino } from 'pino';

const logger = pino({ name: 'audit-logger' });

export class EventAuditLogger {
  constructor(private db: Knex) {}

  async logEventAction(
    action: string,
    eventId: string,
    tenantId: string,
    userId: string,
    metadata: any = {},
    actionType: string = 'UPDATE'
  ): Promise<void> {
    try {
      // Debug logging
      logger.info({ action, eventId, tenantId, userId, metadata }, 'Audit log entry details');

      const auditEntry = {
        service: 'event-service',
        tenant_id: tenantId, // ✅ FIXED: Added tenant_id
        user_id: userId,
        action: `event_${action}`,
        action_type: actionType,
        resource_type: 'event',
        resource_id: eventId,
        ip_address: metadata.ip || metadata.ipAddress || null,
        user_agent: metadata.userAgent || null,
        metadata: {
          eventData: metadata.eventData,
          updates: metadata.updates,
          previousData: metadata.previousData,
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        },
        success: true
      };

      // Debug the actual entry being inserted
      logger.info({ auditEntry }, 'Inserting audit entry');

      await this.db('audit_logs').insert(auditEntry);

      logger.info({
        action: `event_${action}`,
        tenantId,
        userId,
        eventId,
        metadata,
        timestamp: new Date()
      }, `Event ${action} audit log successfully written`);
    } catch (error) {
      logger.error({ error, tenantId, userId, eventId, action }, 'Failed to write audit log to database');
      // Don't throw - audit logging failure shouldn't break the operation
    }
  }

  async logEventCreation(
    tenantId: string,
    userId: string,
    eventId: string,
    eventData: any,
    requestInfo?: any
  ): Promise<void> {
    await this.logEventAction('created', eventId, tenantId, userId, {
      eventData,
      ...requestInfo
    }, 'CREATE');
  }

  async logEventUpdate(
    tenantId: string,
    userId: string,
    eventId: string,
    changes: any,
    requestInfo?: any
  ): Promise<void> {
    await this.logEventAction('updated', eventId, tenantId, userId, {
      updates: changes,
      ...requestInfo
    }, 'UPDATE');
  }

  async logEventDeletion(
    tenantId: string,
    userId: string,
    eventId: string,
    requestInfo?: any
  ): Promise<void> {
    await this.logEventAction('deleted', eventId, tenantId, userId, requestInfo, 'DELETE');
  }

  async logEventAccess(
    tenantId: string,
    userId: string,
    eventId: string,
    action: string,
    allowed: boolean,
    requestInfo?: any
  ): Promise<void> {
    try {
      await this.db('audit_logs').insert({
        service: 'event-service',
        tenant_id: tenantId, // ✅ FIXED: Added tenant_id
        user_id: userId,
        action: `event_access_${action}`,
        action_type: 'ACCESS',
        resource_type: 'event',
        resource_id: eventId,
        ip_address: requestInfo?.ip || null,
        user_agent: requestInfo?.userAgent || null,
        metadata: {
          allowed,
          requestId: requestInfo?.requestId
        },
        success: allowed
      });

      logger.info({
        action: `event_access_${action}`,
        tenantId,
        userId,
        eventId,
        allowed,
        requestInfo,
        timestamp: new Date()
      }, 'Event access audit log');
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to write audit log to database');
    }
  }
}
