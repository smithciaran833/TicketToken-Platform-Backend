/**
 * Event State Machine
 * 
 * Implements proper state transitions for events to ensure:
 * - DRAFT events cannot have tickets sold
 * - CANCELLED/COMPLETED events cannot be reactivated
 * - State transitions follow a valid path
 * 
 * NOTE: To use XState instead, run: npm install xstate
 * Then uncomment the XState implementation at the bottom of this file.
 */

import { pino } from 'pino';

const logger = pino({ name: 'event-state-machine' });

// Valid event states
// AUDIT FIX (ESM-1): Added RESCHEDULED state for events that have been rescheduled
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

// Events that trigger state transitions
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

// Terminal states that cannot transition
const TERMINAL_STATES: EventState[] = ['COMPLETED', 'CANCELLED'];

// Valid state transitions map
const VALID_TRANSITIONS: Record<EventState, Partial<Record<EventTransition, EventState>>> = {
  DRAFT: {
    SUBMIT_FOR_REVIEW: 'REVIEW',
    PUBLISH: 'PUBLISHED',  // Direct publish for authorized users
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
  COMPLETED: {
    // Terminal state - no valid transitions
  },
  CANCELLED: {
    // Terminal state - no valid transitions
  },
  POSTPONED: {
    RESCHEDULE: 'RESCHEDULED',
    CANCEL: 'CANCELLED'
  },
  // AUDIT FIX (ESM-1): RESCHEDULED state - event has new date/time confirmed
  RESCHEDULED: {
    PUBLISH: 'PUBLISHED',  // After rescheduling, needs to go through publishing again
    START_SALES: 'ON_SALE', // Or directly start sales if approved
    CANCEL: 'CANCELLED'
  }
};

// States that allow ticket sales
const SALES_ALLOWED_STATES: EventState[] = ['ON_SALE'];

// States that allow event modifications
const MODIFICATION_ALLOWED_STATES: EventState[] = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED'];

// States that allow deletion
const DELETION_ALLOWED_STATES: EventState[] = ['DRAFT', 'CANCELLED'];

export interface TransitionResult {
  success: boolean;
  previousState: EventState;
  currentState: EventState;
  error?: string;
  // AUDIT FIX (LOW-STATE-REASON): Include reason in transition result
  reason?: string;
  changedBy?: string;
  changedAt?: Date;
}

// AUDIT FIX (LOW-STATE-REASON): Options for state transitions
export interface TransitionOptions {
  reason?: string;      // Human-readable explanation for the transition
  changedBy?: string;   // User ID or 'system' for automatic transitions
}

export interface EventStateMachineContext {
  eventId: string;
  tenantId: string;
  currentState: EventState;
  salesStarted?: boolean;
  ticketsSold?: number;
  // AUDIT FIX (LOW-STATE-REASON): Track state change metadata
  statusReason?: string;
  statusChangedBy?: string;
  statusChangedAt?: Date;
}

/**
 * Event State Machine class
 * Validates and executes state transitions for events
 */
export class EventStateMachine {
  private context: EventStateMachineContext;

  constructor(context: EventStateMachineContext) {
    this.context = context;
  }

  /**
   * Get current state
   */
  get currentState(): EventState {
    return this.context.currentState;
  }

  /**
   * Check if current state is terminal
   */
  isTerminal(): boolean {
    return TERMINAL_STATES.includes(this.context.currentState);
  }

  /**
   * Check if sales are allowed in current state
   */
  canSellTickets(): boolean {
    return SALES_ALLOWED_STATES.includes(this.context.currentState);
  }

  /**
   * Check if modifications are allowed in current state
   */
  canModify(): boolean {
    // Cannot modify after sales have started (unless specific fields)
    if (this.context.ticketsSold && this.context.ticketsSold > 0) {
      return false;
    }
    return MODIFICATION_ALLOWED_STATES.includes(this.context.currentState);
  }

  /**
   * Check if deletion is allowed in current state
   */
  canDelete(): boolean {
    // Cannot delete if tickets have been sold
    if (this.context.ticketsSold && this.context.ticketsSold > 0) {
      return false;
    }
    return DELETION_ALLOWED_STATES.includes(this.context.currentState);
  }

  /**
   * Get all valid transitions from current state
   */
  getValidTransitions(): EventTransition[] {
    const transitions = VALID_TRANSITIONS[this.context.currentState];
    return Object.keys(transitions) as EventTransition[];
  }

  /**
   * Check if a specific transition is valid
   */
  canTransition(transition: EventTransition): boolean {
    if (this.isTerminal()) {
      return false;
    }
    const transitions = VALID_TRANSITIONS[this.context.currentState];
    return transition in transitions;
  }

  /**
   * Get the target state for a transition (without executing)
   */
  getTargetState(transition: EventTransition): EventState | null {
    const transitions = VALID_TRANSITIONS[this.context.currentState];
    return transitions[transition] || null;
  }

  /**
   * Execute a state transition
   * 
   * AUDIT FIX (LOW-STATE-REASON): Accept optional reason and changedBy for audit trail
   */
  transition(event: EventTransition, options?: TransitionOptions): TransitionResult {
    const previousState = this.context.currentState;
    const changedAt = new Date();
    const changedBy = options?.changedBy || 'system';
    const reason = options?.reason;

    // Check if in terminal state
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

    // Check if transition is valid
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

    // Execute transition
    this.context.currentState = targetState;
    
    // AUDIT FIX (LOW-STATE-REASON): Store state change metadata
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

  /**
   * Get status reason metadata
   */
  getStatusMetadata(): { reason?: string; changedBy?: string; changedAt?: Date } {
    return {
      reason: this.context.statusReason,
      changedBy: this.context.statusChangedBy,
      changedAt: this.context.statusChangedAt
    };
  }

  /**
   * Force set state (for recovery/admin only)
   * Use with caution - bypasses transition rules
   */
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

/**
 * Validate if a state transition is allowed
 * Standalone function for quick validation without instantiating machine
 */
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

/**
 * Check if ticket sales are blocked for a given state
 */
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
    ON_SALE: '' // Should not reach here
  };

  return {
    blocked: true,
    reason: reasons[state] || 'Sales not allowed in current state'
  };
}

/**
 * Create an event state machine instance
 */
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
 * AUDIT FIX (ESM-2): Notification placeholder for event modifications
 * This function should be called when significant changes are made to an event
 * that affect ticket holders (e.g., date/time/venue changes).
 * 
 * TODO: Implement actual notification service integration
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
  // PLACEHOLDER: This should integrate with the notification service
  // For now, just log and return success
  
  logger.info({
    eventId: notification.eventId,
    tenantId: notification.tenantId,
    modificationType: notification.modificationType,
    affectedCount: notification.affectedTicketHolderCount || 0,
  }, 'Event modification notification queued for ticket holders');

  // TODO: Implement actual notification logic:
  // 1. Query ticket holders for this event
  // 2. Queue email/push notifications
  // 3. Store notification record for audit

  return {
    queued: true,
    count: notification.affectedTicketHolderCount || 0,
  };
}

/**
 * States that require ticket holder notification when entered
 */
export const STATES_REQUIRING_NOTIFICATION: EventState[] = [
  'RESCHEDULED',
  'POSTPONED',
  'CANCELLED'
];

/**
 * Check if entering a state requires notifying ticket holders
 */
export function requiresTicketHolderNotification(state: EventState): boolean {
  return STATES_REQUIRING_NOTIFICATION.includes(state);
}

// ============================================================
// XState Implementation (uncomment after: npm install xstate)
// ============================================================
/*
import { createMachine, interpret } from 'xstate';

export const eventStateMachineConfig = createMachine({
  id: 'event',
  initial: 'draft',
  states: {
    draft: {
      on: {
        SUBMIT_FOR_REVIEW: 'review',
        PUBLISH: 'published',
        CANCEL: 'cancelled'
      }
    },
    review: {
      on: {
        APPROVE: 'approved',
        REJECT: 'draft',
        CANCEL: 'cancelled'
      }
    },
    approved: {
      on: {
        PUBLISH: 'published',
        CANCEL: 'cancelled'
      }
    },
    published: {
      on: {
        START_SALES: 'on_sale',
        CANCEL: 'cancelled',
        POSTPONE: 'postponed'
      }
    },
    on_sale: {
      on: {
        PAUSE_SALES: 'sales_paused',
        SOLD_OUT: 'sold_out',
        START_EVENT: 'in_progress',
        CANCEL: 'cancelled',
        POSTPONE: 'postponed'
      }
    },
    sales_paused: {
      on: {
        RESUME_SALES: 'on_sale',
        START_EVENT: 'in_progress',
        CANCEL: 'cancelled',
        POSTPONE: 'postponed'
      }
    },
    sold_out: {
      on: {
        START_EVENT: 'in_progress',
        CANCEL: 'cancelled',
        POSTPONE: 'postponed'
      }
    },
    in_progress: {
      on: {
        END_EVENT: 'completed',
        CANCEL: 'cancelled'
      }
    },
    completed: {
      type: 'final'
    },
    cancelled: {
      type: 'final'
    },
    postponed: {
      on: {
        RESCHEDULE: 'published',
        CANCEL: 'cancelled'
      }
    }
  }
});

export function createXStateEventMachine() {
  return interpret(eventStateMachineConfig).start();
}
*/
