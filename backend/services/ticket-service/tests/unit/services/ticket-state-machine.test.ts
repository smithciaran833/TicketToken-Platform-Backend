/**
 * Unit Tests for src/services/ticket-state-machine.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: jest.fn(),
  },
}));

jest.mock('../../../src/services/queueService', () => ({
  QueueService: {
    publish: jest.fn(),
  },
}));

jest.mock('../../../src/services/solanaService', () => ({}));

import {
  TicketStatus,
  RevocationReason,
  UserRole,
  VALID_TRANSITIONS,
  normalizeStatus,
  isTerminalStatus,
  canCheckIn,
  TicketStateMachine,
} from '../../../src/services/ticket-state-machine';

describe('services/ticket-state-machine', () => {
  describe('TicketStatus enum', () => {
    it('has all expected statuses', () => {
      expect(TicketStatus.AVAILABLE).toBe('available');
      expect(TicketStatus.RESERVED).toBe('reserved');
      expect(TicketStatus.SOLD).toBe('sold');
      expect(TicketStatus.MINTED).toBe('minted');
      expect(TicketStatus.ACTIVE).toBe('active');
      expect(TicketStatus.TRANSFERRED).toBe('transferred');
      expect(TicketStatus.CHECKED_IN).toBe('checked_in');
      expect(TicketStatus.USED).toBe('used');
      expect(TicketStatus.REVOKED).toBe('revoked');
      expect(TicketStatus.REFUNDED).toBe('refunded');
      expect(TicketStatus.EXPIRED).toBe('expired');
      expect(TicketStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('RevocationReason enum', () => {
    it('has expected reasons', () => {
      expect(RevocationReason.FRAUD_DETECTED).toBe('fraud_detected');
      expect(RevocationReason.CHARGEBACK).toBe('chargeback');
      expect(RevocationReason.EVENT_CANCELLED).toBe('event_cancelled');
    });
  });

  describe('UserRole enum', () => {
    it('has expected roles', () => {
      expect(UserRole.USER).toBe('user');
      expect(UserRole.VENUE_ADMIN).toBe('venue_admin');
      expect(UserRole.SUPER_ADMIN).toBe('super_admin');
      expect(UserRole.SYSTEM).toBe('system');
    });
  });

  describe('VALID_TRANSITIONS', () => {
    it('allows available -> reserved', () => {
      expect(VALID_TRANSITIONS[TicketStatus.AVAILABLE]).toContain(TicketStatus.RESERVED);
    });

    it('allows available -> sold', () => {
      expect(VALID_TRANSITIONS[TicketStatus.AVAILABLE]).toContain(TicketStatus.SOLD);
    });

    it('allows active -> checked_in', () => {
      expect(VALID_TRANSITIONS[TicketStatus.ACTIVE]).toContain(TicketStatus.CHECKED_IN);
    });

    it('allows active -> transferred', () => {
      expect(VALID_TRANSITIONS[TicketStatus.ACTIVE]).toContain(TicketStatus.TRANSFERRED);
    });

    it('terminal states have no outgoing transitions', () => {
      expect(VALID_TRANSITIONS[TicketStatus.CHECKED_IN]).toEqual([]);
      expect(VALID_TRANSITIONS[TicketStatus.USED]).toEqual([]);
      expect(VALID_TRANSITIONS[TicketStatus.REVOKED]).toEqual([]);
      expect(VALID_TRANSITIONS[TicketStatus.REFUNDED]).toEqual([]);
      expect(VALID_TRANSITIONS[TicketStatus.EXPIRED]).toEqual([]);
      expect(VALID_TRANSITIONS[TicketStatus.CANCELLED]).toEqual([]);
    });
  });

  describe('normalizeStatus()', () => {
    it('converts uppercase to lowercase', () => {
      expect(normalizeStatus('ACTIVE')).toBe(TicketStatus.ACTIVE);
      expect(normalizeStatus('SOLD')).toBe(TicketStatus.SOLD);
    });

    it('handles already lowercase', () => {
      expect(normalizeStatus('active')).toBe(TicketStatus.ACTIVE);
    });

    it('throws for unknown status', () => {
      expect(() => normalizeStatus('INVALID_STATUS')).toThrow();
    });
  });

  describe('isTerminalStatus()', () => {
    it('returns true for terminal statuses', () => {
      expect(isTerminalStatus(TicketStatus.CHECKED_IN)).toBe(true);
      expect(isTerminalStatus(TicketStatus.USED)).toBe(true);
      expect(isTerminalStatus(TicketStatus.REVOKED)).toBe(true);
      expect(isTerminalStatus(TicketStatus.REFUNDED)).toBe(true);
    });

    it('returns false for non-terminal statuses', () => {
      expect(isTerminalStatus(TicketStatus.ACTIVE)).toBe(false);
      expect(isTerminalStatus(TicketStatus.SOLD)).toBe(false);
      expect(isTerminalStatus(TicketStatus.RESERVED)).toBe(false);
    });
  });

  describe('canCheckIn()', () => {
    it('returns true for active and transferred', () => {
      expect(canCheckIn(TicketStatus.ACTIVE)).toBe(true);
      expect(canCheckIn(TicketStatus.TRANSFERRED)).toBe(true);
    });

    it('returns false for other statuses', () => {
      expect(canCheckIn(TicketStatus.SOLD)).toBe(false);
      expect(canCheckIn(TicketStatus.RESERVED)).toBe(false);
      expect(canCheckIn(TicketStatus.REVOKED)).toBe(false);
    });
  });

  describe('TicketStateMachine.validateTransition()', () => {
    const baseContext = {
      ticketId: 'ticket-123',
      tenantId: 'tenant-456',
      userId: 'user-789',
      userRole: UserRole.USER,
    };

    it('allows valid transitions', () => {
      expect(() => {
        TicketStateMachine.validateTransition(
          TicketStatus.ACTIVE,
          TicketStatus.CHECKED_IN,
          baseContext
        );
      }).not.toThrow();
    });

    it('throws for invalid transitions', () => {
      expect(() => {
        TicketStateMachine.validateTransition(
          TicketStatus.SOLD,
          TicketStatus.CHECKED_IN,
          baseContext
        );
      }).toThrow('Invalid transition');
    });

    it('throws for terminal status transitions', () => {
      expect(() => {
        TicketStateMachine.validateTransition(
          TicketStatus.CHECKED_IN,
          TicketStatus.ACTIVE,
          baseContext
        );
      }).toThrow('terminal');
    });

    it('requires admin role for revocation', () => {
      expect(() => {
        TicketStateMachine.validateTransition(
          TicketStatus.ACTIVE,
          TicketStatus.REVOKED,
          { ...baseContext, userRole: UserRole.USER }
        );
      }).toThrow();
    });

    it('allows admin to revoke', () => {
      expect(() => {
        TicketStateMachine.validateTransition(
          TicketStatus.ACTIVE,
          TicketStatus.REVOKED,
          {
            ...baseContext,
            userRole: UserRole.SUPER_ADMIN,
            reason: RevocationReason.FRAUD_DETECTED,
          }
        );
      }).not.toThrow();
    });

    it('requires reason for revocation', () => {
      expect(() => {
        TicketStateMachine.validateTransition(
          TicketStatus.ACTIVE,
          TicketStatus.REVOKED,
          { ...baseContext, userRole: UserRole.SUPER_ADMIN }
        );
      }).toThrow('Reason required');
    });
  });
});
