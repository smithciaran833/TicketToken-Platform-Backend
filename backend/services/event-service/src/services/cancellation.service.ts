import { Knex } from 'knex';
import { logger } from '../utils/logger';

export interface CancellationData {
  event_id: string;
  cancelled_by: string;
  cancellation_reason: string;
  trigger_refunds?: boolean;
}

export class CancellationService {
  constructor(private db: Knex) {}

  async cancelEvent(data: CancellationData, tenantId: string): Promise<any> {
    const { event_id, cancelled_by, cancellation_reason, trigger_refunds = true } = data;

    return await this.db.transaction(async (trx) => {
      // Get event with cancellation deadline
      const event = await trx('events')
        .where({ id: event_id, tenant_id: tenantId })
        .whereNull('deleted_at')
        .first();

      if (!event) {
        throw new Error('Event not found');
      }

      if (event.status === 'CANCELLED') {
        throw new Error('Event is already cancelled');
      }

      // Check cancellation deadline
      const now = new Date();
      const deadlineHours = event.cancellation_deadline_hours || 24;
      
      // Get earliest event schedule
      const earliestSchedule = await trx('event_schedules')
        .where({ event_id: event_id })
        .whereNull('deleted_at')
        .orderBy('starts_at', 'asc')
        .first();

      if (earliestSchedule) {
        const scheduledTime = new Date(earliestSchedule.starts_at);
        const deadlineTime = new Date(scheduledTime.getTime() - (deadlineHours * 60 * 60 * 1000));
        
        if (now > deadlineTime && event.created_by !== cancelled_by) {
          throw new Error(`Cancellation deadline has passed. Must cancel at least ${deadlineHours} hours before event.`);
        }
      }

      // Update event status to CANCELLED
      await trx('events')
        .where({ id: event_id, tenant_id: tenantId })
        .update({
          status: 'CANCELLED',
          cancelled_at: now,
          cancelled_by: cancelled_by,
          cancellation_reason: cancellation_reason,
          updated_at: now
        });

      // Log cancellation in audit_logs
      await trx('audit_logs').insert({
        tenant_id: tenantId,
        entity_type: 'event',
        entity_id: event_id,
        action: 'CANCEL',
        actor_id: cancelled_by,
        changes: JSON.stringify({
          status: { from: event.status, to: 'CANCELLED' },
          cancellation_reason,
          cancelled_at: now
        }),
        ip_address: null,
        user_agent: null,
        created_at: now
      });

      logger.info({
        eventId: event_id,
        cancelledBy: cancelled_by,
        reason: cancellation_reason,
        tenantId
      }, 'Event cancelled');

      // Return cancellation details with trigger information
      return {
        event_id,
        status: 'CANCELLED',
        cancelled_at: now,
        cancelled_by,
        cancellation_reason,
        trigger_refunds,
        event_name: event.name
      };
    });
  }

  async validateCancellationPermission(
    eventId: string,
    userId: string,
    tenantId: string
  ): Promise<boolean> {
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return false;
    }

    // Allow event creator or venue admin to cancel
    return event.created_by === userId;
  }
}
