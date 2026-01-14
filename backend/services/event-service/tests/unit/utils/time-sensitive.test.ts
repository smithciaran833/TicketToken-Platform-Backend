/**
 * Unit tests for src/utils/time-sensitive.ts
 * Tests time-sensitive operations for events including cutoffs, deadlines, and state transitions
 */

import {
  TimeSensitiveOperations,
  timeSensitiveOps,
  createTimeSensitiveOps,
  TimingConfig,
} from '../../../src/utils/time-sensitive';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('utils/time-sensitive', () => {
  // Helper to create dates relative to now
  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
  const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

  describe('TimeSensitiveOperations class', () => {
    describe('constructor', () => {
      it('should create instance with default config', () => {
        const ops = new TimeSensitiveOperations();
        expect(ops).toBeDefined();
      });

      it('should accept custom config', () => {
        const ops = new TimeSensitiveOperations({
          minEventAdvanceHours: 4,
          modificationCutoffHours: 48,
        });
        expect(ops).toBeDefined();
      });
    });

    describe('validateEventTiming()', () => {
      let ops: TimeSensitiveOperations;

      beforeEach(() => {
        ops = new TimeSensitiveOperations();
      });

      describe('Valid event dates', () => {
        it('should return valid for event 24 hours from now', () => {
          const result = ops.validateEventTiming(hoursFromNow(24));
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        });

        it('should return valid for event 30 days from now', () => {
          const result = ops.validateEventTiming(daysFromNow(30));
          expect(result.valid).toBe(true);
        });

        it('should return valid for event 364 days from now', () => {
          const result = ops.validateEventTiming(daysFromNow(364));
          expect(result.valid).toBe(true);
        });

        it('should return valid for minimum allowed advance time', () => {
          const result = ops.validateEventTiming(hoursFromNow(3)); // > 2 hours
          expect(result.valid).toBe(true);
        });
      });

      describe('Event too soon', () => {
        it('should reject event less than 2 hours from now', () => {
          const result = ops.validateEventTiming(hoursFromNow(1));
          expect(result.valid).toBe(false);
          expect(result.code).toBe('EVENT_TOO_SOON');
          expect(result.error).toContain('at least 2 hours');
        });

        it('should reject event 30 minutes from now', () => {
          const result = ops.validateEventTiming(minutesFromNow(30));
          expect(result.valid).toBe(false);
          expect(result.code).toBe('EVENT_TOO_SOON');
        });

        it('should reject event in the past', () => {
          const result = ops.validateEventTiming(hoursFromNow(-1));
          expect(result.valid).toBe(false);
          expect(result.code).toBe('EVENT_TOO_SOON');
        });
      });

      describe('Event too far', () => {
        it('should reject event more than 365 days from now', () => {
          const result = ops.validateEventTiming(daysFromNow(400));
          expect(result.valid).toBe(false);
          expect(result.code).toBe('EVENT_TOO_FAR');
          expect(result.error).toContain('365 days');
        });

        it('should reject event 500 days from now', () => {
          const result = ops.validateEventTiming(daysFromNow(500));
          expect(result.valid).toBe(false);
          expect(result.code).toBe('EVENT_TOO_FAR');
        });
      });

      describe('Custom config', () => {
        it('should use custom minEventAdvanceHours', () => {
          const customOps = new TimeSensitiveOperations({ minEventAdvanceHours: 6 });
          
          expect(customOps.validateEventTiming(hoursFromNow(4)).valid).toBe(false);
          expect(customOps.validateEventTiming(hoursFromNow(8)).valid).toBe(true);
        });

        it('should use custom maxEventAdvanceDays', () => {
          const customOps = new TimeSensitiveOperations({ maxEventAdvanceDays: 30 });
          
          expect(customOps.validateEventTiming(daysFromNow(45)).valid).toBe(false);
          expect(customOps.validateEventTiming(daysFromNow(20)).valid).toBe(true);
        });
      });
    });

    describe('canModifyEvent()', () => {
      let ops: TimeSensitiveOperations;

      beforeEach(() => {
        ops = new TimeSensitiveOperations();
      });

      describe('Allowed modifications', () => {
        it('should allow modifications 48 hours before event', () => {
          const result = ops.canModifyEvent(hoursFromNow(48));
          expect(result.allowed).toBe(true);
          expect(result.hoursUntilCutoff).toBeGreaterThan(0);
        });

        it('should allow modifications 30 days before event', () => {
          const result = ops.canModifyEvent(daysFromNow(30));
          expect(result.allowed).toBe(true);
        });

        it('should return hours until cutoff', () => {
          const result = ops.canModifyEvent(hoursFromNow(48));
          expect(result.hoursUntilCutoff).toBeCloseTo(24, 0); // 48h - 24h cutoff
        });
      });

      describe('Blocked modifications', () => {
        it('should block modifications 12 hours before event', () => {
          const result = ops.canModifyEvent(hoursFromNow(12));
          expect(result.allowed).toBe(false);
          expect(result.code).toBe('MODIFICATION_CUTOFF_PASSED');
        });

        it('should block modifications after event has started', () => {
          const result = ops.canModifyEvent(hoursFromNow(-1));
          expect(result.allowed).toBe(false);
          expect(result.code).toBe('EVENT_STARTED');
        });

        it('should return hoursUntilCutoff as 0 when blocked', () => {
          const result = ops.canModifyEvent(hoursFromNow(12));
          expect(result.hoursUntilCutoff).toBe(0);
        });
      });

      describe('Edge cases', () => {
        it('should block at exactly cutoff time', () => {
          const result = ops.canModifyEvent(hoursFromNow(24));
          expect(result.allowed).toBe(false); // Exactly at cutoff, not allowed
        });

        it('should allow just after cutoff period', () => {
          const result = ops.canModifyEvent(hoursFromNow(24.1));
          expect(result.allowed).toBe(true);
        });
      });
    });

    describe('canSellTickets()', () => {
      let ops: TimeSensitiveOperations;

      beforeEach(() => {
        ops = new TimeSensitiveOperations();
      });

      describe('Sales allowed', () => {
        it('should allow sales when event is in the future and within window', () => {
          const result = ops.canSellTickets(
            hoursFromNow(24), // Event in 24 hours
            hoursFromNow(-1), // Sales started 1 hour ago
            hoursFromNow(23)  // Sales end in 23 hours
          );
          expect(result.allowed).toBe(true);
        });

        it('should allow sales without explicit sales window', () => {
          const result = ops.canSellTickets(hoursFromNow(24));
          expect(result.allowed).toBe(true);
        });
      });

      describe('Sales not started', () => {
        it('should block sales before sales start time', () => {
          const result = ops.canSellTickets(
            hoursFromNow(48),
            hoursFromNow(24), // Sales start in 24 hours
            hoursFromNow(47)
          );
          expect(result.allowed).toBe(false);
          expect(result.code).toBe('SALES_NOT_STARTED');
        });
      });

      describe('Sales ended', () => {
        it('should block sales after sales end time', () => {
          const result = ops.canSellTickets(
            hoursFromNow(48),
            hoursFromNow(-48), // Sales started 48 hours ago
            hoursFromNow(-1)   // Sales ended 1 hour ago
          );
          expect(result.allowed).toBe(false);
          expect(result.code).toBe('SALES_ENDED');
        });
      });

      describe('Automatic cutoff', () => {
        it('should block sales within 30 minutes of event start', () => {
          const result = ops.canSellTickets(minutesFromNow(15));
          expect(result.allowed).toBe(false);
          expect(result.code).toBe('SALES_CUTOFF_PASSED');
        });

        it('should allow sales just outside cutoff window', () => {
          const result = ops.canSellTickets(minutesFromNow(45));
          expect(result.allowed).toBe(true);
        });
      });

      describe('Event started', () => {
        it('should block sales after event has started', () => {
          const result = ops.canSellTickets(hoursFromNow(-1));
          expect(result.allowed).toBe(false);
          expect(result.code).toBe('EVENT_STARTED');
        });
      });
    });

    describe('getRequiredStateTransition()', () => {
      let ops: TimeSensitiveOperations;

      beforeEach(() => {
        ops = new TimeSensitiveOperations({
          eventStartBufferMinutes: 15,
          eventEndBufferMinutes: 60,
          salesEndCutoffMinutes: 30,
        });
      });

      describe('Terminal states', () => {
        it('should return no transition for COMPLETED events', () => {
          const result = ops.getRequiredStateTransition(
            'COMPLETED',
            hoursFromNow(-5),
            hoursFromNow(-2)
          );
          expect(result.transition).toBeUndefined();
        });

        it('should return no transition for CANCELLED events', () => {
          const result = ops.getRequiredStateTransition(
            'CANCELLED',
            hoursFromNow(24),
            hoursFromNow(27)
          );
          expect(result.transition).toBeUndefined();
        });
      });

      describe('Event completion', () => {
        it('should transition IN_PROGRESS to COMPLETED after event end + buffer', () => {
          const result = ops.getRequiredStateTransition(
            'IN_PROGRESS',
            hoursFromNow(-5),
            hoursFromNow(-2) // Ended 2 hours ago, buffer is 1 hour
          );
          expect(result.transition).toBe('END_EVENT');
          expect(result.targetStatus).toBe('COMPLETED');
        });
      });

      describe('Event start', () => {
        it('should transition ON_SALE to IN_PROGRESS near event start', () => {
          const result = ops.getRequiredStateTransition(
            'ON_SALE',
            minutesFromNow(10), // Event starts in 10 minutes, buffer is 15
            hoursFromNow(3)
          );
          expect(result.transition).toBe('START_EVENT');
          expect(result.targetStatus).toBe('IN_PROGRESS');
        });

        it('should transition PUBLISHED to IN_PROGRESS near event start', () => {
          const result = ops.getRequiredStateTransition(
            'PUBLISHED',
            minutesFromNow(10),
            hoursFromNow(3)
          );
          expect(result.transition).toBe('START_EVENT');
          expect(result.targetStatus).toBe('IN_PROGRESS');
        });
      });

      describe('Sales start', () => {
        it('should transition PUBLISHED to ON_SALE when sales start time reached', () => {
          const result = ops.getRequiredStateTransition(
            'PUBLISHED',
            hoursFromNow(48),
            hoursFromNow(51),
            hoursFromNow(-1) // Sales started 1 hour ago
          );
          expect(result.transition).toBe('START_SALES');
          expect(result.targetStatus).toBe('ON_SALE');
        });
      });

      describe('Sales pause', () => {
        it('should pause sales before automatic cutoff', () => {
          const result = ops.getRequiredStateTransition(
            'ON_SALE',
            minutesFromNow(20), // Event in 20 minutes, cutoff is 30
            hoursFromNow(3),
            hoursFromNow(-24)
          );
          expect(result.transition).toBe('PAUSE_SALES');
        });
      });

      describe('No transition needed', () => {
        it('should return empty for stable state', () => {
          const result = ops.getRequiredStateTransition(
            'ON_SALE',
            hoursFromNow(24),
            hoursFromNow(27)
          );
          expect(result.transition).toBeUndefined();
        });
      });
    });

    describe('getTimingCheckSQL()', () => {
      it('should return SQL with default aliases', () => {
        const ops = new TimeSensitiveOperations();
        const sql = ops.getTimingCheckSQL();
        
        expect(sql).toContain('s.starts_at');
        expect(sql).toContain('INTERVAL');
        expect(sql).toContain('hours');
      });

      it('should use custom aliases', () => {
        const ops = new TimeSensitiveOperations();
        const sql = ops.getTimingCheckSQL('events', 'schedules');
        
        expect(sql).toContain('schedules.starts_at');
      });
    });

    describe('checkDeadline()', () => {
      let ops: TimeSensitiveOperations;

      beforeEach(() => {
        ops = new TimeSensitiveOperations();
      });

      describe('Purchase deadline', () => {
        it('should allow purchase before deadline', () => {
          const result = ops.checkDeadline('purchase', hoursFromNow(24));
          expect(result.allowed).toBe(true);
          expect(result.deadline).toBeDefined();
        });

        it('should block purchase after deadline', () => {
          const result = ops.checkDeadline('purchase', minutesFromNow(15));
          expect(result.allowed).toBe(false);
        });
      });

      describe('Cancel deadline', () => {
        it('should allow cancel before deadline', () => {
          const result = ops.checkDeadline('cancel', hoursFromNow(48));
          expect(result.allowed).toBe(true);
        });

        it('should block cancel after deadline', () => {
          const result = ops.checkDeadline('cancel', hoursFromNow(12));
          expect(result.allowed).toBe(false);
        });
      });

      describe('Transfer deadline', () => {
        it('should allow transfer before 1 hour cutoff', () => {
          const result = ops.checkDeadline('transfer', hoursFromNow(3));
          expect(result.allowed).toBe(true);
        });

        it('should block transfer within 1 hour of event', () => {
          const result = ops.checkDeadline('transfer', minutesFromNow(30));
          expect(result.allowed).toBe(false);
        });
      });

      describe('Refund deadline', () => {
        it('should allow refund well before event', () => {
          const result = ops.checkDeadline('refund', daysFromNow(7));
          expect(result.allowed).toBe(true);
        });

        it('should block refund close to event (2x modification cutoff)', () => {
          const result = ops.checkDeadline('refund', hoursFromNow(24));
          expect(result.allowed).toBe(false);
        });
      });

      describe('Custom deadline hours', () => {
        it('should use custom deadline hours when provided', () => {
          const result = ops.checkDeadline('purchase', hoursFromNow(12), 6);
          expect(result.allowed).toBe(true);
        });
      });
    });

    describe('logTimingCheck()', () => {
      let ops: TimeSensitiveOperations;
      const { logger } = require('../../../src/utils/logger');

      beforeEach(() => {
        jest.clearAllMocks();
        ops = new TimeSensitiveOperations();
      });

      it('should log debug for allowed operations', () => {
        ops.logTimingCheck('modify', 'event-123', { allowed: true });
        expect(logger.debug).toHaveBeenCalled();
      });

      it('should log warn for blocked operations', () => {
        ops.logTimingCheck('modify', 'event-123', { 
          allowed: false, 
          reason: 'Modification cutoff passed' 
        });
        expect(logger.warn).toHaveBeenCalled();
      });

      it('should include extra context in logs', () => {
        ops.logTimingCheck('purchase', 'event-456', { allowed: true }, { ticketCount: 5 });
        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ ticketCount: 5 }),
          expect.any(String)
        );
      });
    });
  });

  describe('Exports', () => {
    describe('timeSensitiveOps singleton', () => {
      it('should be a TimeSensitiveOperations instance', () => {
        expect(timeSensitiveOps).toBeInstanceOf(TimeSensitiveOperations);
      });

      it('should have default configuration', () => {
        // Test with default config values
        const result = timeSensitiveOps.validateEventTiming(hoursFromNow(3));
        expect(result.valid).toBe(true);
      });
    });

    describe('createTimeSensitiveOps factory', () => {
      it('should create new instance with custom config', () => {
        const customOps = createTimeSensitiveOps({ minEventAdvanceHours: 12 });
        
        expect(customOps).toBeInstanceOf(TimeSensitiveOperations);
        
        // Verify custom config is used
        const result = customOps.validateEventTiming(hoursFromNow(6));
        expect(result.valid).toBe(false);
        expect(result.code).toBe('EVENT_TOO_SOON');
      });

      it('should create independent instances', () => {
        const ops1 = createTimeSensitiveOps({ minEventAdvanceHours: 1 });
        const ops2 = createTimeSensitiveOps({ minEventAdvanceHours: 10 });
        
        expect(ops1.validateEventTiming(hoursFromNow(5)).valid).toBe(true);
        expect(ops2.validateEventTiming(hoursFromNow(5)).valid).toBe(false);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle full event lifecycle timing', () => {
      const ops = new TimeSensitiveOperations({
        minEventAdvanceHours: 2,
        modificationCutoffHours: 24,
        salesEndCutoffMinutes: 30,
      });

      // Event scheduled for 48 hours from now
      const eventStart = hoursFromNow(48);
      const eventEnd = hoursFromNow(51);
      const salesStart = hoursFromNow(-24);

      // Validate event timing
      expect(ops.validateEventTiming(eventStart).valid).toBe(true);

      // Should be able to modify
      expect(ops.canModifyEvent(eventStart).allowed).toBe(true);

      // Should be able to sell tickets
      expect(ops.canSellTickets(eventStart, salesStart).allowed).toBe(true);

      // Get required transitions
      const transition = ops.getRequiredStateTransition(
        'ON_SALE',
        eventStart,
        eventEnd,
        salesStart
      );
      expect(transition.transition).toBeUndefined(); // No transition needed yet
    });

    it('should properly handle event about to start', () => {
      const ops = new TimeSensitiveOperations();

      // Event starting in 10 minutes
      const eventStart = minutesFromNow(10);
      const eventEnd = hoursFromNow(3);

      // Should not be able to modify
      expect(ops.canModifyEvent(eventStart).allowed).toBe(false);

      // Should not be able to sell tickets
      expect(ops.canSellTickets(eventStart).allowed).toBe(false);

      // Should transition to IN_PROGRESS
      const transition = ops.getRequiredStateTransition(
        'ON_SALE',
        eventStart,
        eventEnd
      );
      expect(transition.targetStatus).toBe('IN_PROGRESS');
    });
  });
});
