import { Knex } from 'knex';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * SECURITY FIX (AL4): Enhanced audit logger with correlation ID support
 */
export interface AuditLogData {
  ipAddress?: string;
  userAgent?: string;
  tenantId?: string;
  correlationId?: string;  // SECURITY FIX (AL4): Add correlation ID
  requestId?: string;
  details?: Record<string, any>;
  [key: string]: any;
}

export class VenueAuditLogger {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  /**
   * Log an audit event with correlation ID for request tracing
   * SECURITY FIX (AL4): Added correlation_id field for distributed tracing
   */
  async log(action: string, userId: string, venueId: string, data?: AuditLogData): Promise<void> {
    try {
      const auditEntry = {
        id: uuidv4(),
        service: 'venue-service',
        action: action || 'venue_created',
        action_type: this.getActionType(action),
        user_id: userId,
        resource_type: 'venue',
        resource_id: venueId,
        // SECURITY FIX (AL4): Include correlation_id for request tracing
        correlation_id: data?.correlationId || data?.requestId || null,
        tenant_id: data?.tenantId || null,
        ip_address: data?.ipAddress || null,
        user_agent: data?.userAgent || null,
        metadata: JSON.stringify(data?.details || data || {}),
        created_at: new Date()
      };

      await this.db('audit_logs').insert(auditEntry);
      
      logger.info({ 
        action, 
        venueId, 
        userId, 
        tenantId: data?.tenantId,
        correlationId: data?.correlationId  // SECURITY FIX (AL4): Log correlation ID
      }, 'Venue audit log created');
    } catch (error) {
      logger.error({ 
        error, 
        userId, 
        venueId, 
        action,
        correlationId: data?.correlationId 
      }, 'Failed to write audit log to database');
      // Don't throw - audit logging shouldn't break main operations
    }
  }

  /**
   * Derive action type from action name for categorization
   */
  private getActionType(action: string): string {
    if (action.includes('create') || action.includes('add')) return 'CREATE';
    if (action.includes('update') || action.includes('edit') || action.includes('modify')) return 'UPDATE';
    if (action.includes('delete') || action.includes('remove')) return 'DELETE';
    if (action.includes('view') || action.includes('get') || action.includes('list')) return 'READ';
    return 'OTHER';
  }

  /**
   * Batch log multiple audit events (for bulk operations)
   */
  async logBatch(entries: Array<{
    action: string;
    userId: string;
    venueId: string;
    data?: AuditLogData;
  }>): Promise<void> {
    const batchCorrelationId = uuidv4();
    
    await Promise.allSettled(
      entries.map(entry => 
        this.log(entry.action, entry.userId, entry.venueId, {
          ...entry.data,
          correlationId: entry.data?.correlationId || batchCorrelationId,
          batchId: batchCorrelationId
        })
      )
    );
  }
}
