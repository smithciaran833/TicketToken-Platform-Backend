/**
 * Event State Machine
 *
 * Implements proper state transitions for events to ensure:
 * - DRAFT events cannot have tickets sold
 * - CANCELLED/COMPLETED events cannot be reactivated
 * - State transitions follow a valid path
 *
 * CRITICAL FIX: Added notes on database persistence of state metadata
 * CRITICAL FIX: Improved notification placeholder with implementation guide
 */

import { pino } from 'pino';

const logger = pino({ name: 'event-state-machine' });

export type EventState =
  | 'DRAFT'
  | 'REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ON_SALE'
  | 'SALES_PAUSED'
  | 'SOLD_OUT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'POSTPONED'
  | 'RESCHEDULED';

export type EventTransition =
  | 'SUBMIT_FOR_REVIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'PUBLISH'
  | 'START_SALES'
  | 'PAUSE_SALES'
  | 'RESUME_SALES'
  | 'SOLD_OUT'
  | 'START_EVENT'
  | 'END_EVENT'
  | 'CANCEL'
  | 'POSTPONE'
  | 'RESCHEDULE';

const TERMINAL_STATES: EventState[] = ['COMPLETED', 'CANCELLED'];

const VALID_TRANSITIONS: Record<EventState, Partial<Record<EventTransition, EventState>>> = {
  DRAFT: {
    SUBMIT_FOR_REVIEW: 'REVIEW',
    PUBLISH: 'PUBLISHED',
    CANCEL: 'CANCELLED'
  },
  REVIEW: {
    APPROVE: 'APPROVED',
    REJECT: 'DRAFT',
    CANCEL: 'CANCELLED'
  },
  APPROVED: {
    PUBLISH: 'PUBLISHED',
    CANCEL: 'CANCELLED'
  },
  PUBLISHED: {
    START_SALES: 'ON_SALE',
    CANCEL: 'CANCELLED',
    POSTPONE: 'POSTPONED'
  },
  ON_SALE: {
    PAUSE_SALES: 'SALES_PAUSED',
    SOLD_OUT: 'SOLD_OUT',
    START_EVENT: 'IN_PROGRESS',
    CANCEL: 'CANCELLED',
    POSTPONE: 'POSTPONED'
  },
  SALES_PAUSED: {
    RESUME_SALES: 'ON_SALE',
    START_EVENT: 'IN_PROGRESS',
    CANCEL: 'CANCELLED',
    POSTPONE: 'POSTPONED'
  },
  SOLD_OUT: {
    START_EVENT: 'IN_PROGRESS',
    CANCEL: 'CANCELLED',
    POSTPONE: 'POSTPONED'
  },
  IN_PROGRESS: {
    END_EVENT: 'COMPLETED',
    CANCEL: 'CANCELLED'
  },
  COMPLETED: {},
  CANCELLED: {},
  POSTPONED: {
    RESCHEDULE: 'RESCHEDULED',
    CANCEL: 'CANCELLED'
  },
  RESCHEDULED: {
    PUBLISH: 'PUBLISHED',
    START_SALES: 'ON_SALE',
    CANCEL: 'CANCELLED'
  }
};

const SALES_ALLOWED_STATES: EventState[] = ['ON_SALE'];

const MODIFICATION_ALLOWED_STATES: EventState[] = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED'];

const DELETION_ALLOWED_STATES: EventState[] = ['DRAFT', 'CANCELLED'];

export interface TransitionResult {
  success: boolean;
  previousState: EventState;
  currentState: EventState;
  error?: string;
  reason?: string;
  changedBy?: string;
  changedAt?: Date;
}

export interface TransitionOptions {
  reason?: string;
  changedBy?: string;
}

export interface EventStateMachineContext {
  eventId: string;
  tenantId: string;
  currentState: EventState;
  salesStarted?: boolean;
  ticketsSold?: number;
  statusReason?: string;
  statusChangedBy?: string;
  statusChangedAt?: Date;
}

export class EventStateMachine {
  private context: EventStateMachineContext;

  constructor(context: EventStateMachineContext) {
    this.context = context;
  }

  get currentState(): EventState {
    return this.context.currentState;
  }

  isTerminal(): boolean {
    return TERMINAL_STATES.includes(this.context.currentState);
  }

  canSellTickets(): boolean {
    return SALES_ALLOWED_STATES.includes(this.context.currentState);
  }

  canModify(): boolean {
    if (this.context.ticketsSold && this.context.ticketsSold > 0) {
      return false;
    }
    return MODIFICATION_ALLOWED_STATES.includes(this.context.currentState);
  }

  canDelete(): boolean {
    if (this.context.ticketsSold && this.context.ticketsSold > 0) {
      return false;
    }
    return DELETION_ALLOWED_STATES.includes(this.context.currentState);
  }

  getValidTransitions(): EventTransition[] {
    const transitions = VALID_TRANSITIONS[this.context.currentState];
    return Object.keys(transitions) as EventTransition[];
  }

  canTransition(transition: EventTransition): boolean {
    if (this.isTerminal()) {
      return false;
    }
    const transitions = VALID_TRANSITIONS[this.context.currentState];
    return transition in transitions;
  }

  getTargetState(transition: EventTransition): EventState | null {
    const transitions = VALID_TRANSITIONS[this.context.currentState];
    return transitions[transition] || null;
  }

  /**
   * Execute a state transition
   * 
   * IMPORTANT: State metadata (reason, changedBy, changedAt) is stored in memory
   * and should be persisted to database after calling this method.
   * 
   * Example usage:
   * ```typescript
   * const machine = createEventStateMachine(eventId, tenantId, currentState);
   * const result = machine.transition('PUBLISH', { 
   *   reason: 'Event approved and ready for public',
   *   changedBy: userId 
   * });
   * 
   * if (result.success) {
   *   // Persist to database
   *   await db('events').where({ id: eventId }).update({
   *     status: result.currentState,
   *     status_reason: result.reason,
   *     status_changed_by: result.changedBy,
   *     status_changed_at: result.changedAt
   *   });
   * }
   * ```
   */
  transition(event: EventTransition, options?: TransitionOptions): TransitionResult {
    const previousState = this.context.currentState;
    const changedAt = new Date();
    const changedBy = options?.changedBy || 'system';
    const reason = options?.reason;

    if (this.isTerminal()) {
      logger.warn({
        eventId: this.context.eventId,
        state: previousState,
        attemptedTransition: event,
        reason,
        changedBy
      }, 'Attempted transition from terminal state');

      return {
        success: false,
        previousState,
        currentState: previousState,
        error: `Cannot transition from terminal state: ${previousState}`
      };
    }

    const targetState = this.getTargetState(event);
    if (!targetState) {
      logger.warn({
        eventId: this.context.eventId,
        state: previousState,
        attemptedTransition: event,
        reason,
        changedBy
      }, 'Invalid state transition attempted');

      return {
        success: false,
        previousState,
        currentState: previousState,
        error: `Invalid transition '${event}' from state '${previousState}'`
      };
    }

    this.context.currentState = targetState;
    this.context.statusReason = reason;
    this.context.statusChangedBy = changedBy;
    this.context.statusChangedAt = changedAt;

    logger.info({
      eventId: this.context.eventId,
      previousState,
      newState: targetState,
      transition: event,
      reason,
      changedBy,
      changedAt: changedAt.toISOString()
    }, 'Event state transition completed');

    return {
      success: true,
      previousState,
      currentState: targetState,
      reason,
      changedBy,
      changedAt
    };
  }

  getStatusMetadata(): { reason?: string; changedBy?: string; changedAt?: Date } {
    return {
      reason: this.context.statusReason,
      changedBy: this.context.statusChangedBy,
      changedAt: this.context.statusChangedAt
    };
  }

  forceState(state: EventState): void {
    const previousState = this.context.currentState;
    this.context.currentState = state;

    logger.warn({
      eventId: this.context.eventId,
      previousState,
      forcedState: state
    }, 'Event state forcefully changed');
  }
}

export function validateTransition(
  currentState: EventState,
  transition: EventTransition
): { valid: boolean; targetState?: EventState; error?: string } {
  if (TERMINAL_STATES.includes(currentState)) {
    return {
      valid: false,
      error: `Cannot transition from terminal state: ${currentState}`
    };
  }

  const transitions = VALID_TRANSITIONS[currentState];
  const targetState = transitions[transition];

  if (!targetState) {
    return {
      valid: false,
      error: `Invalid transition '${transition}' from state '${currentState}'`
    };
  }

  return {
    valid: true,
    targetState
  };
}

export function areSalesBlocked(state: EventState): { blocked: boolean; reason?: string } {
  if (SALES_ALLOWED_STATES.includes(state)) {
    return { blocked: false };
  }

  const reasons: Record<EventState, string> = {
    DRAFT: 'Event is still in draft status',
    REVIEW: 'Event is pending review',
    APPROVED: 'Event is approved but not yet on sale',
    PUBLISHED: 'Sales have not started yet',
    SALES_PAUSED: 'Sales are temporarily paused',
    SOLD_OUT: 'Event is sold out',
    IN_PROGRESS: 'Event is currently in progress',
    COMPLETED: 'Event has already ended',
    CANCELLED: 'Event has been cancelled',
    POSTPONED: 'Event has been postponed',
    RESCHEDULED: 'Event has been rescheduled - pending republication',
    ON_SALE: ''
  };

  return {
    blocked: true,
    reason: reasons[state] || 'Sales not allowed in current state'
  };
}

export function createEventStateMachine(
  eventId: string,
  tenantId: string,
  initialState: EventState = 'DRAFT'
): EventStateMachine {
  return new EventStateMachine({
    eventId,
    tenantId,
    currentState: initialState,
    ticketsSold: 0
  });
}

/**
 * CRITICAL FIX: Notification implementation guide
 * 
 * This function should integrate with the notification service when significant
 * changes are made to events that affect ticket holders.
 * 
 * IMPLEMENTATION STEPS:
 * 
 * 1. Query ticket holders:
 *    - Call ticket-service API to get all ticket holders for the event
 *    - Example: GET /api/v1/tickets?eventId={eventId}&status=SOLD,USED
 * 
 * 2. Build notification payload:
 *    - Email template based on modification type
 *    - Push notification for mobile app users
 *    - SMS for users with SMS enabled
 * 
 * 3. Queue notifications:
 *    - Use message queue (RabbitMQ/SQS) for async processing
 *    - Batch notifications to avoid overwhelming notification service
 *    - Include retry logic for failed notifications
 * 
 * 4. Store notification records:
 *    - Insert into notification_log table for audit trail
 *    - Track delivery status (pending/sent/failed)
 * 
 * 5. Handle opt-outs:
 *    - Check user notification preferences
 *    - Respect unsubscribe requests
 * 
 * EXAMPLE IMPLEMENTATION:
 * ```typescript
 * async function notifyTicketHoldersOfModification(notification: EventModificationNotification) {
 *   // 1. Get ticket holders from ticket-service
 *   const tickets = await ticketServiceClient.getEventTickets(notification.eventId);
 *   const userIds = [...new Set(tickets.map(t => t.userId))];
 * 
 *   // 2. Build notification
 *   const notificationPayload = {
 *     type: notification.modificationType,
 *     eventId: notification.eventId,
 *     userIds,
 *     email: {
 *       template: 'event-modification',
 *       subject: getSubjectForModificationType(notification.modificationType),
 *       data: { ...notification }
 *     },
 *     push: {
 *       title: 'Event Update',
 *       body: getBodyForModificationType(notification.modificationType)
 *     }
 *   };
 * 
 *   // 3. Queue for processing
 *   await messageQueue.publish('notifications.events', notificationPayload);
 * 
 *   // 4. Log notification request
 *   await db('notification_log').insert({
 *     event_id: notification.eventId,
 *     type: notification.modificationType,
 *     recipient_count: userIds.length,
 *     status: 'queued',
 *     created_at: new Date()
 *   });
 * 
 *   return { queued: true, count: userIds.length };
 * }
 * ```
 */
export interface EventModificationNotification {
  eventId: string;
  tenantId: string;
  modificationType: 'RESCHEDULED' | 'VENUE_CHANGED' | 'CANCELLED' | 'TIME_CHANGED';
  previousValue?: string;
  newValue?: string;
  affectedTicketHolderCount?: number;
}

export async function notifyTicketHoldersOfModification(
  notification: EventModificationNotification
): Promise<{ queued: boolean; count: number }> {
  // TODO: Implement actual notification service integration
  // See implementation guide in JSDoc above
  
  logger.info({
    eventId: notification.eventId,
    tenantId: notification.tenantId,
    modificationType: notification.modificationType,
    affectedCount: notification.affectedTicketHolderCount || 0,
  }, 'Event modification notification should be sent (not implemented)');

  // Placeholder return
  return {
    queued: false, // Set to true when implemented
    count: notification.affectedTicketHolderCount || 0,
  };
}

export const STATES_REQUIRING_NOTIFICATION: EventState[] = [
  'RESCHEDULED',
  'POSTPONED',
  'CANCELLED'
];

export function requiresTicketHolderNotification(state: EventState): boolean {
  return STATES_REQUIRING_NOTIFICATION.includes(state);
}
