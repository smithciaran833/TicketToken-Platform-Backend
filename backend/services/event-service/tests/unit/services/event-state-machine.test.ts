/**
 * Unit tests for EventStateMachine
 * Tests state transitions, validation, and helper functions
 */

import {
  EventStateMachine,
  EventState,
  EventTransition,
  validateTransition,
  areSalesBlocked,
  createEventStateMachine,
  requiresTicketHolderNotification,
  notifyTicketHoldersOfModification,
  STATES_REQUIRING_NOTIFICATION,
} from '../../../src/services/event-state-machine';

// Mock logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
  const pinoFn = jest.fn(() => mockLogger);
  pinoFn.default = pinoFn;
  return {
    __esModule: true,
    default: pinoFn,
    pino: pinoFn,
  };
});

describe('EventStateMachine', () => {
  describe('constructor', () => {
    it('should create machine with initial state', () => {
      const machine = new EventStateMachine({
        eventId: 'event-123',
        tenantId: 'tenant-1',
        currentState: 'DRAFT',
      });

      expect(machine.currentState).toBe('DRAFT');
    });

    it('should create machine with any valid state', () => {
      const states: EventState[] = [
        'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
        'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED',
        'CANCELLED', 'POSTPONED', 'RESCHEDULED'
      ];

      states.forEach(state => {
        const machine = new EventStateMachine({
          eventId: 'event-123',
          tenantId: 'tenant-1',
          currentState: state,
        });
        expect(machine.currentState).toBe(state);
      });
    });
  });

  describe('isTerminal', () => {
    it('should return true for COMPLETED state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'COMPLETED');
      expect(machine.isTerminal()).toBe(true);
    });

    it('should return true for CANCELLED state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'CANCELLED');
      expect(machine.isTerminal()).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      const nonTerminalStates: EventState[] = [
        'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
        'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS', 'POSTPONED', 'RESCHEDULED'
      ];

      nonTerminalStates.forEach(state => {
        const machine = createEventStateMachine('event-1', 'tenant-1', state);
        expect(machine.isTerminal()).toBe(false);
      });
    });
  });

  describe('canSellTickets', () => {
    it('should return true for ON_SALE state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');
      expect(machine.canSellTickets()).toBe(true);
    });

    it('should return false for all other states', () => {
      const nonSaleStates: EventState[] = [
        'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED',
        'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED',
        'CANCELLED', 'POSTPONED', 'RESCHEDULED'
      ];

      nonSaleStates.forEach(state => {
        const machine = createEventStateMachine('event-1', 'tenant-1', state);
        expect(machine.canSellTickets()).toBe(false);
      });
    });
  });

  describe('canModify', () => {
    it('should return true for DRAFT state without sold tickets', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'DRAFT',
        ticketsSold: 0,
      });
      expect(machine.canModify()).toBe(true);
    });

    it('should return true for REVIEW state without sold tickets', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'REVIEW',
        ticketsSold: 0,
      });
      expect(machine.canModify()).toBe(true);
    });

    it('should return true for APPROVED state without sold tickets', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'APPROVED',
        ticketsSold: 0,
      });
      expect(machine.canModify()).toBe(true);
    });

    it('should return true for PUBLISHED state without sold tickets', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'PUBLISHED',
        ticketsSold: 0,
      });
      expect(machine.canModify()).toBe(true);
    });

    it('should return false when tickets have been sold', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'DRAFT',
        ticketsSold: 5,
      });
      expect(machine.canModify()).toBe(false);
    });

    it('should return false for non-modifiable states', () => {
      const nonModifiableStates: EventState[] = [
        'ON_SALE', 'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS',
        'COMPLETED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED'
      ];

      nonModifiableStates.forEach(state => {
        const machine = new EventStateMachine({
          eventId: 'event-1',
          tenantId: 'tenant-1',
          currentState: state,
          ticketsSold: 0,
        });
        expect(machine.canModify()).toBe(false);
      });
    });
  });

  describe('canDelete', () => {
    it('should return true for DRAFT state without sold tickets', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'DRAFT',
        ticketsSold: 0,
      });
      expect(machine.canDelete()).toBe(true);
    });

    it('should return true for CANCELLED state without sold tickets', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'CANCELLED',
        ticketsSold: 0,
      });
      expect(machine.canDelete()).toBe(true);
    });

    it('should return false when tickets have been sold', () => {
      const machine = new EventStateMachine({
        eventId: 'event-1',
        tenantId: 'tenant-1',
        currentState: 'DRAFT',
        ticketsSold: 1,
      });
      expect(machine.canDelete()).toBe(false);
    });

    it('should return false for non-deletable states', () => {
      const nonDeletableStates: EventState[] = [
        'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
        'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS',
        'COMPLETED', 'POSTPONED', 'RESCHEDULED'
      ];

      nonDeletableStates.forEach(state => {
        const machine = new EventStateMachine({
          eventId: 'event-1',
          tenantId: 'tenant-1',
          currentState: state,
          ticketsSold: 0,
        });
        expect(machine.canDelete()).toBe(false);
      });
    });
  });

  describe('getValidTransitions', () => {
    it('should return valid transitions from DRAFT', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      const transitions = machine.getValidTransitions();

      expect(transitions).toContain('SUBMIT_FOR_REVIEW');
      expect(transitions).toContain('PUBLISH');
      expect(transitions).toContain('CANCEL');
    });

    it('should return valid transitions from REVIEW', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'REVIEW');
      const transitions = machine.getValidTransitions();

      expect(transitions).toContain('APPROVE');
      expect(transitions).toContain('REJECT');
      expect(transitions).toContain('CANCEL');
    });

    it('should return valid transitions from ON_SALE', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');
      const transitions = machine.getValidTransitions();

      expect(transitions).toContain('PAUSE_SALES');
      expect(transitions).toContain('SOLD_OUT');
      expect(transitions).toContain('START_EVENT');
      expect(transitions).toContain('CANCEL');
      expect(transitions).toContain('POSTPONE');
    });

    it('should return empty array for COMPLETED state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'COMPLETED');
      const transitions = machine.getValidTransitions();

      expect(transitions).toEqual([]);
    });

    it('should return empty array for CANCELLED state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'CANCELLED');
      const transitions = machine.getValidTransitions();

      expect(transitions).toEqual([]);
    });
  });

  describe('canTransition', () => {
    it('should return true for valid DRAFT -> REVIEW transition', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      expect(machine.canTransition('SUBMIT_FOR_REVIEW')).toBe(true);
    });

    it('should return true for valid DRAFT -> PUBLISHED transition', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      expect(machine.canTransition('PUBLISH')).toBe(true);
    });

    it('should return false for invalid transition', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      expect(machine.canTransition('START_EVENT')).toBe(false);
    });

    it('should return false for any transition from terminal state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'COMPLETED');
      
      const allTransitions: EventTransition[] = [
        'SUBMIT_FOR_REVIEW', 'APPROVE', 'REJECT', 'PUBLISH',
        'START_SALES', 'PAUSE_SALES', 'RESUME_SALES', 'SOLD_OUT',
        'START_EVENT', 'END_EVENT', 'CANCEL', 'POSTPONE', 'RESCHEDULE'
      ];

      allTransitions.forEach(transition => {
        expect(machine.canTransition(transition)).toBe(false);
      });
    });
  });

  describe('getTargetState', () => {
    it('should return REVIEW for SUBMIT_FOR_REVIEW from DRAFT', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      expect(machine.getTargetState('SUBMIT_FOR_REVIEW')).toBe('REVIEW');
    });

    it('should return PUBLISHED for PUBLISH from DRAFT', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      expect(machine.getTargetState('PUBLISH')).toBe('PUBLISHED');
    });

    it('should return CANCELLED for CANCEL from any state', () => {
      const cancellableStates: EventState[] = [
        'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
        'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS', 'POSTPONED', 'RESCHEDULED'
      ];

      cancellableStates.forEach(state => {
        const machine = createEventStateMachine('event-1', 'tenant-1', state);
        expect(machine.getTargetState('CANCEL')).toBe('CANCELLED');
      });
    });

    it('should return null for invalid transition', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      expect(machine.getTargetState('END_EVENT')).toBeNull();
    });
  });

  describe('transition', () => {
    it('should successfully transition from DRAFT to REVIEW', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      const result = machine.transition('SUBMIT_FOR_REVIEW');

      expect(result.success).toBe(true);
      expect(result.previousState).toBe('DRAFT');
      expect(result.currentState).toBe('REVIEW');
      expect(machine.currentState).toBe('REVIEW');
    });

    it('should successfully transition from ON_SALE to SOLD_OUT', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');
      const result = machine.transition('SOLD_OUT');

      expect(result.success).toBe(true);
      expect(result.previousState).toBe('ON_SALE');
      expect(result.currentState).toBe('SOLD_OUT');
    });

    it('should include reason in transition result', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');
      const result = machine.transition('CANCEL', { reason: 'Weather emergency' });

      expect(result.success).toBe(true);
      expect(result.reason).toBe('Weather emergency');
    });

    it('should include changedBy in transition result', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');
      const result = machine.transition('PAUSE_SALES', { changedBy: 'user-123' });

      expect(result.success).toBe(true);
      expect(result.changedBy).toBe('user-123');
    });

    it('should include changedAt timestamp in transition result', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      const result = machine.transition('PUBLISH');

      expect(result.success).toBe(true);
      expect(result.changedAt).toBeInstanceOf(Date);
    });

    it('should fail transition from terminal state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'COMPLETED');
      const result = machine.transition('PUBLISH');

      expect(result.success).toBe(false);
      expect(result.error).toContain('terminal state');
      expect(machine.currentState).toBe('COMPLETED');
    });

    it('should fail invalid transition', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      const result = machine.transition('END_EVENT');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(machine.currentState).toBe('DRAFT');
    });

    it('should track status metadata after transition', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');
      machine.transition('CANCEL', { reason: 'Test reason', changedBy: 'admin-1' });

      const metadata = machine.getStatusMetadata();
      expect(metadata.reason).toBe('Test reason');
      expect(metadata.changedBy).toBe('admin-1');
      expect(metadata.changedAt).toBeInstanceOf(Date);
    });
  });

  describe('forceState', () => {
    it('should force state change regardless of validity', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'COMPLETED');
      
      // Normally cannot transition from COMPLETED
      expect(machine.isTerminal()).toBe(true);
      
      machine.forceState('DRAFT');
      
      expect(machine.currentState).toBe('DRAFT');
      expect(machine.isTerminal()).toBe(false);
    });

    it('should force any state', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');
      machine.forceState('IN_PROGRESS');

      expect(machine.currentState).toBe('IN_PROGRESS');
    });
  });

  describe('full lifecycle transitions', () => {
    it('should complete standard event lifecycle', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');

      // DRAFT -> REVIEW
      expect(machine.transition('SUBMIT_FOR_REVIEW').success).toBe(true);
      expect(machine.currentState).toBe('REVIEW');

      // REVIEW -> APPROVED
      expect(machine.transition('APPROVE').success).toBe(true);
      expect(machine.currentState).toBe('APPROVED');

      // APPROVED -> PUBLISHED
      expect(machine.transition('PUBLISH').success).toBe(true);
      expect(machine.currentState).toBe('PUBLISHED');

      // PUBLISHED -> ON_SALE
      expect(machine.transition('START_SALES').success).toBe(true);
      expect(machine.currentState).toBe('ON_SALE');

      // ON_SALE -> SOLD_OUT
      expect(machine.transition('SOLD_OUT').success).toBe(true);
      expect(machine.currentState).toBe('SOLD_OUT');

      // SOLD_OUT -> IN_PROGRESS
      expect(machine.transition('START_EVENT').success).toBe(true);
      expect(machine.currentState).toBe('IN_PROGRESS');

      // IN_PROGRESS -> COMPLETED
      expect(machine.transition('END_EVENT').success).toBe(true);
      expect(machine.currentState).toBe('COMPLETED');

      // Cannot transition from COMPLETED
      expect(machine.isTerminal()).toBe(true);
    });

    it('should handle direct publish workflow', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');

      // DRAFT -> PUBLISHED (direct)
      expect(machine.transition('PUBLISH').success).toBe(true);
      expect(machine.currentState).toBe('PUBLISHED');

      // PUBLISHED -> ON_SALE
      expect(machine.transition('START_SALES').success).toBe(true);
      expect(machine.currentState).toBe('ON_SALE');
    });

    it('should handle cancellation at any stage', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');

      expect(machine.transition('CANCEL').success).toBe(true);
      expect(machine.currentState).toBe('CANCELLED');
      expect(machine.isTerminal()).toBe(true);
    });

    it('should handle postpone and reschedule flow', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');

      // ON_SALE -> POSTPONED
      expect(machine.transition('POSTPONE').success).toBe(true);
      expect(machine.currentState).toBe('POSTPONED');

      // POSTPONED -> RESCHEDULED
      expect(machine.transition('RESCHEDULE').success).toBe(true);
      expect(machine.currentState).toBe('RESCHEDULED');

      // RESCHEDULED -> PUBLISHED
      expect(machine.transition('PUBLISH').success).toBe(true);
      expect(machine.currentState).toBe('PUBLISHED');
    });

    it('should handle sales pause and resume', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');

      // ON_SALE -> SALES_PAUSED
      expect(machine.transition('PAUSE_SALES').success).toBe(true);
      expect(machine.currentState).toBe('SALES_PAUSED');

      // SALES_PAUSED -> ON_SALE
      expect(machine.transition('RESUME_SALES').success).toBe(true);
      expect(machine.currentState).toBe('ON_SALE');
    });

    it('should handle review rejection flow', () => {
      const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');

      // DRAFT -> REVIEW
      expect(machine.transition('SUBMIT_FOR_REVIEW').success).toBe(true);
      expect(machine.currentState).toBe('REVIEW');

      // REVIEW -> DRAFT (rejected)
      expect(machine.transition('REJECT').success).toBe(true);
      expect(machine.currentState).toBe('DRAFT');

      // Can resubmit
      expect(machine.transition('SUBMIT_FOR_REVIEW').success).toBe(true);
      expect(machine.currentState).toBe('REVIEW');
    });
  });
});

describe('validateTransition (standalone function)', () => {
  it('should validate DRAFT -> REVIEW', () => {
    const result = validateTransition('DRAFT', 'SUBMIT_FOR_REVIEW');

    expect(result.valid).toBe(true);
    expect(result.targetState).toBe('REVIEW');
    expect(result.error).toBeUndefined();
  });

  it('should validate ON_SALE -> SOLD_OUT', () => {
    const result = validateTransition('ON_SALE', 'SOLD_OUT');

    expect(result.valid).toBe(true);
    expect(result.targetState).toBe('SOLD_OUT');
  });

  it('should reject invalid transition', () => {
    const result = validateTransition('DRAFT', 'END_EVENT');

    expect(result.valid).toBe(false);
    expect(result.targetState).toBeUndefined();
    expect(result.error).toContain('Invalid transition');
  });

  it('should reject transition from terminal state', () => {
    const result = validateTransition('COMPLETED', 'PUBLISH');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('terminal state');
  });

  it('should validate all defined transitions', () => {
    const validTransitions: Array<[EventState, EventTransition, EventState]> = [
      ['DRAFT', 'SUBMIT_FOR_REVIEW', 'REVIEW'],
      ['DRAFT', 'PUBLISH', 'PUBLISHED'],
      ['REVIEW', 'APPROVE', 'APPROVED'],
      ['REVIEW', 'REJECT', 'DRAFT'],
      ['APPROVED', 'PUBLISH', 'PUBLISHED'],
      ['PUBLISHED', 'START_SALES', 'ON_SALE'],
      ['ON_SALE', 'PAUSE_SALES', 'SALES_PAUSED'],
      ['ON_SALE', 'SOLD_OUT', 'SOLD_OUT'],
      ['ON_SALE', 'START_EVENT', 'IN_PROGRESS'],
      ['SALES_PAUSED', 'RESUME_SALES', 'ON_SALE'],
      ['SOLD_OUT', 'START_EVENT', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'END_EVENT', 'COMPLETED'],
      ['POSTPONED', 'RESCHEDULE', 'RESCHEDULED'],
    ];

    validTransitions.forEach(([from, transition, to]) => {
      const result = validateTransition(from, transition);
      expect(result.valid).toBe(true);
      expect(result.targetState).toBe(to);
    });
  });
});

describe('areSalesBlocked', () => {
  it('should return blocked: false for ON_SALE state', () => {
    const result = areSalesBlocked('ON_SALE');

    expect(result.blocked).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it('should return blocked: true with reason for DRAFT', () => {
    const result = areSalesBlocked('DRAFT');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('draft');
  });

  it('should return blocked: true with reason for REVIEW', () => {
    const result = areSalesBlocked('REVIEW');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('review');
  });

  it('should return blocked: true with reason for SOLD_OUT', () => {
    const result = areSalesBlocked('SOLD_OUT');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('sold out');
  });

  it('should return blocked: true with reason for CANCELLED', () => {
    const result = areSalesBlocked('CANCELLED');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('cancelled');
  });

  it('should return blocked: true with reason for POSTPONED', () => {
    const result = areSalesBlocked('POSTPONED');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('postponed');
  });

  it('should return blocked: true with reason for COMPLETED', () => {
    const result = areSalesBlocked('COMPLETED');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('ended');
  });

  it('should return blocked: true with reason for IN_PROGRESS', () => {
    const result = areSalesBlocked('IN_PROGRESS');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('in progress');
  });

  it('should return blocked: true with reason for SALES_PAUSED', () => {
    const result = areSalesBlocked('SALES_PAUSED');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('paused');
  });

  it('should return blocked: true for RESCHEDULED', () => {
    const result = areSalesBlocked('RESCHEDULED');

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('rescheduled');
  });
});

describe('createEventStateMachine', () => {
  it('should create machine with default DRAFT state', () => {
    const machine = createEventStateMachine('event-1', 'tenant-1');

    expect(machine.currentState).toBe('DRAFT');
    expect(machine).toBeInstanceOf(EventStateMachine);
  });

  it('should create machine with specified initial state', () => {
    const machine = createEventStateMachine('event-1', 'tenant-1', 'ON_SALE');

    expect(machine.currentState).toBe('ON_SALE');
  });

  it('should initialize with zero tickets sold', () => {
    const machine = createEventStateMachine('event-1', 'tenant-1', 'DRAFT');

    // Should be able to modify and delete
    expect(machine.canModify()).toBe(true);
    expect(machine.canDelete()).toBe(true);
  });
});

describe('requiresTicketHolderNotification', () => {
  it('should return true for RESCHEDULED state', () => {
    expect(requiresTicketHolderNotification('RESCHEDULED')).toBe(true);
  });

  it('should return true for POSTPONED state', () => {
    expect(requiresTicketHolderNotification('POSTPONED')).toBe(true);
  });

  it('should return true for CANCELLED state', () => {
    expect(requiresTicketHolderNotification('CANCELLED')).toBe(true);
  });

  it('should return false for other states', () => {
    const nonNotifyStates: EventState[] = [
      'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
      'SALES_PAUSED', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED'
    ];

    nonNotifyStates.forEach(state => {
      expect(requiresTicketHolderNotification(state)).toBe(false);
    });
  });
});

describe('notifyTicketHoldersOfModification', () => {
  it('should queue notification for CANCELLED event', async () => {
    const result = await notifyTicketHoldersOfModification({
      eventId: 'event-123',
      tenantId: 'tenant-1',
      modificationType: 'CANCELLED',
      affectedTicketHolderCount: 100,
    });

    expect(result.queued).toBe(true);
    expect(result.count).toBe(100);
  });

  it('should queue notification for RESCHEDULED event', async () => {
    const result = await notifyTicketHoldersOfModification({
      eventId: 'event-123',
      tenantId: 'tenant-1',
      modificationType: 'RESCHEDULED',
      previousValue: '2026-03-01T20:00:00Z',
      newValue: '2026-03-15T20:00:00Z',
      affectedTicketHolderCount: 50,
    });

    expect(result.queued).toBe(true);
    expect(result.count).toBe(50);
  });

  it('should queue notification for VENUE_CHANGED', async () => {
    const result = await notifyTicketHoldersOfModification({
      eventId: 'event-123',
      tenantId: 'tenant-1',
      modificationType: 'VENUE_CHANGED',
      previousValue: 'venue-old',
      newValue: 'venue-new',
    });

    expect(result.queued).toBe(true);
  });

  it('should default affected count to 0', async () => {
    const result = await notifyTicketHoldersOfModification({
      eventId: 'event-123',
      tenantId: 'tenant-1',
      modificationType: 'TIME_CHANGED',
    });

    expect(result.queued).toBe(true);
    expect(result.count).toBe(0);
  });
});

describe('STATES_REQUIRING_NOTIFICATION', () => {
  it('should include RESCHEDULED', () => {
    expect(STATES_REQUIRING_NOTIFICATION).toContain('RESCHEDULED');
  });

  it('should include POSTPONED', () => {
    expect(STATES_REQUIRING_NOTIFICATION).toContain('POSTPONED');
  });

  it('should include CANCELLED', () => {
    expect(STATES_REQUIRING_NOTIFICATION).toContain('CANCELLED');
  });

  it('should have exactly 3 states', () => {
    expect(STATES_REQUIRING_NOTIFICATION).toHaveLength(3);
  });
});
