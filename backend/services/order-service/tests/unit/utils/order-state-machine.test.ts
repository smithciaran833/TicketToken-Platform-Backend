/**
 * Unit Tests: Order State Machine
 *
 * Tests order status transitions, validation, and terminal states
 * CRITICAL: These tests ensure orders follow valid lifecycle paths
 */

import { OrderStateMachine } from '../../../src/utils/order-state-machine';
import { OrderStatus } from '../../../src/types/order.types';

describe('OrderStateMachine', () => {
  // ============================================
  // canTransition - Valid Transitions
  // ============================================
  describe('canTransition - Valid Transitions', () => {
    describe('from PENDING', () => {
      it('should allow PENDING → RESERVED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.RESERVED)).toBe(true);
      });

      it('should allow PENDING → CANCELLED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED)).toBe(true);
      });

      it('should allow PENDING → EXPIRED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.EXPIRED)).toBe(true);
      });
    });

    describe('from RESERVED', () => {
      it('should allow RESERVED → CONFIRMED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.CONFIRMED)).toBe(true);
      });

      it('should allow RESERVED → CANCELLED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.CANCELLED)).toBe(true);
      });

      it('should allow RESERVED → EXPIRED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.EXPIRED)).toBe(true);
      });
    });

    describe('from CONFIRMED', () => {
      it('should allow CONFIRMED → COMPLETED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.COMPLETED)).toBe(true);
      });

      it('should allow CONFIRMED → CANCELLED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
      });

      it('should allow CONFIRMED → REFUNDED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.REFUNDED)).toBe(true);
      });
    });
  });

  // ============================================
  // canTransition - Invalid Transitions
  // ============================================
  describe('canTransition - Invalid Transitions', () => {
    describe('from PENDING', () => {
      it('should NOT allow PENDING → CONFIRMED (must go through RESERVED)', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED)).toBe(false);
      });

      it('should NOT allow PENDING → COMPLETED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.COMPLETED)).toBe(false);
      });

      it('should NOT allow PENDING → REFUNDED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.REFUNDED)).toBe(false);
      });

      it('should NOT allow PENDING → PENDING (same state)', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.PENDING)).toBe(false);
      });
    });

    describe('from RESERVED', () => {
      it('should NOT allow RESERVED → PENDING (no backwards)', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.PENDING)).toBe(false);
      });

      it('should NOT allow RESERVED → COMPLETED (must go through CONFIRMED)', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.COMPLETED)).toBe(false);
      });

      it('should NOT allow RESERVED → REFUNDED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.REFUNDED)).toBe(false);
      });

      it('should NOT allow RESERVED → RESERVED (same state)', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.RESERVED)).toBe(false);
      });
    });

    describe('from CONFIRMED', () => {
      it('should NOT allow CONFIRMED → PENDING', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.PENDING)).toBe(false);
      });

      it('should NOT allow CONFIRMED → RESERVED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.RESERVED)).toBe(false);
      });

      it('should NOT allow CONFIRMED → EXPIRED', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.EXPIRED)).toBe(false);
      });

      it('should NOT allow CONFIRMED → CONFIRMED (same state)', () => {
        expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.CONFIRMED)).toBe(false);
      });
    });

    describe('from terminal states', () => {
      it('should NOT allow COMPLETED → any state', () => {
        Object.values(OrderStatus).forEach((status) => {
          expect(OrderStateMachine.canTransition(OrderStatus.COMPLETED, status)).toBe(false);
        });
      });

      it('should NOT allow CANCELLED → any state', () => {
        Object.values(OrderStatus).forEach((status) => {
          expect(OrderStateMachine.canTransition(OrderStatus.CANCELLED, status)).toBe(false);
        });
      });

      it('should NOT allow EXPIRED → any state', () => {
        Object.values(OrderStatus).forEach((status) => {
          expect(OrderStateMachine.canTransition(OrderStatus.EXPIRED, status)).toBe(false);
        });
      });

      it('should NOT allow REFUNDED → any state', () => {
        Object.values(OrderStatus).forEach((status) => {
          expect(OrderStateMachine.canTransition(OrderStatus.REFUNDED, status)).toBe(false);
        });
      });
    });
  });

  // ============================================
  // validateTransition
  // ============================================
  describe('validateTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.PENDING, OrderStatus.RESERVED);
      }).not.toThrow();

      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.RESERVED, OrderStatus.CONFIRMED);
      }).not.toThrow();

      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.CONFIRMED, OrderStatus.COMPLETED);
      }).not.toThrow();
    });

    it('should throw Error for invalid transitions', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.PENDING, OrderStatus.COMPLETED);
      }).toThrow(Error);
    });

    it('should throw with descriptive message including current and target status', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.PENDING, OrderStatus.REFUNDED);
      }).toThrow(/PENDING.*REFUNDED/);
    });

    it('should throw with valid transitions listed in error message', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.PENDING, OrderStatus.COMPLETED);
      }).toThrow(/RESERVED|CANCELLED|EXPIRED/);
    });

    it('should throw with "terminal state" message for terminal states', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.COMPLETED, OrderStatus.REFUNDED);
      }).toThrow(/terminal state/);
    });
  });

  // ============================================
  // getAllowedTransitions
  // ============================================
  describe('getAllowedTransitions', () => {
    it('should return correct transitions for PENDING', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.PENDING);
      expect(transitions).toContain(OrderStatus.RESERVED);
      expect(transitions).toContain(OrderStatus.CANCELLED);
      expect(transitions).toContain(OrderStatus.EXPIRED);
      expect(transitions).toHaveLength(3);
    });

    it('should return correct transitions for RESERVED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.RESERVED);
      expect(transitions).toContain(OrderStatus.CONFIRMED);
      expect(transitions).toContain(OrderStatus.CANCELLED);
      expect(transitions).toContain(OrderStatus.EXPIRED);
      expect(transitions).toHaveLength(3);
    });

    it('should return correct transitions for CONFIRMED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.CONFIRMED);
      expect(transitions).toContain(OrderStatus.COMPLETED);
      expect(transitions).toContain(OrderStatus.CANCELLED);
      expect(transitions).toContain(OrderStatus.REFUNDED);
      expect(transitions).toHaveLength(3);
    });

    it('should return empty array for COMPLETED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.COMPLETED);
      expect(transitions).toEqual([]);
    });

    it('should return empty array for CANCELLED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.CANCELLED);
      expect(transitions).toEqual([]);
    });

    it('should return empty array for EXPIRED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.EXPIRED);
      expect(transitions).toEqual([]);
    });

    it('should return empty array for REFUNDED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.REFUNDED);
      expect(transitions).toEqual([]);
    });
  });

  // ============================================
  // isTerminalState
  // ============================================
  describe('isTerminalState', () => {
    it('should return true for COMPLETED', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.COMPLETED)).toBe(true);
    });

    it('should return true for CANCELLED', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.CANCELLED)).toBe(true);
    });

    it('should return true for EXPIRED', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.EXPIRED)).toBe(true);
    });

    it('should return true for REFUNDED', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.REFUNDED)).toBe(true);
    });

    it('should return false for PENDING', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.PENDING)).toBe(false);
    });

    it('should return false for RESERVED', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.RESERVED)).toBe(false);
    });

    it('should return false for CONFIRMED', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.CONFIRMED)).toBe(false);
    });
  });

  // ============================================
  // getTransitionDescription
  // ============================================
  describe('getTransitionDescription', () => {
    it('should return description with valid transitions for non-terminal states', () => {
      const description = OrderStateMachine.getTransitionDescription(OrderStatus.PENDING);
      expect(description).toContain('PENDING');
      expect(description).toContain('RESERVED');
      expect(description).toContain('CANCELLED');
      expect(description).toContain('EXPIRED');
    });

    it('should return terminal state message for terminal states', () => {
      const description = OrderStateMachine.getTransitionDescription(OrderStatus.COMPLETED);
      expect(description).toContain('COMPLETED');
      expect(description).toContain('terminal state');
    });

    it('should return human-readable format', () => {
      const description = OrderStateMachine.getTransitionDescription(OrderStatus.RESERVED);
      expect(description).toMatch(/From RESERVED, can transition to:/);
    });
  });

  // ============================================
  // validateTransitionPath
  // ============================================
  describe('validateTransitionPath', () => {
    describe('valid paths', () => {
      it('should validate happy path: PENDING → RESERVED → CONFIRMED → COMPLETED', () => {
        const path = [
          OrderStatus.PENDING,
          OrderStatus.RESERVED,
          OrderStatus.CONFIRMED,
          OrderStatus.COMPLETED,
        ];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate cancellation path: PENDING → CANCELLED', () => {
        const path = [OrderStatus.PENDING, OrderStatus.CANCELLED];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(true);
      });

      it('should validate reservation cancellation: PENDING → RESERVED → CANCELLED', () => {
        const path = [OrderStatus.PENDING, OrderStatus.RESERVED, OrderStatus.CANCELLED];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(true);
      });

      it('should validate expiration path: PENDING → RESERVED → EXPIRED', () => {
        const path = [OrderStatus.PENDING, OrderStatus.RESERVED, OrderStatus.EXPIRED];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(true);
      });

      it('should validate refund path: PENDING → RESERVED → CONFIRMED → REFUNDED', () => {
        const path = [
          OrderStatus.PENDING,
          OrderStatus.RESERVED,
          OrderStatus.CONFIRMED,
          OrderStatus.REFUNDED,
        ];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(true);
      });

      it('should validate single status (no transitions)', () => {
        const path = [OrderStatus.PENDING];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(true);
      });

      it('should validate empty path', () => {
        const path: OrderStatus[] = [];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(true);
      });
    });

    describe('invalid paths', () => {
      it('should reject skipped state: PENDING → CONFIRMED', () => {
        const path = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('PENDING');
        expect(result.error).toContain('CONFIRMED');
      });

      it('should reject backwards transition: RESERVED → PENDING', () => {
        const path = [OrderStatus.PENDING, OrderStatus.RESERVED, OrderStatus.PENDING];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('RESERVED');
        expect(result.error).toContain('PENDING');
      });

      it('should reject transition from terminal state', () => {
        const path = [
          OrderStatus.PENDING,
          OrderStatus.RESERVED,
          OrderStatus.CONFIRMED,
          OrderStatus.COMPLETED,
          OrderStatus.REFUNDED, // Invalid - can't transition from COMPLETED
        ];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('COMPLETED');
      });

      it('should identify correct step number in error', () => {
        const path = [
          OrderStatus.PENDING,
          OrderStatus.RESERVED,
          OrderStatus.PENDING, // Invalid at step 2
        ];
        const result = OrderStateMachine.validateTransitionPath(path);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('step 2');
      });
    });
  });

  // ============================================
  // Edge Cases and Robustness
  // ============================================
  describe('Edge Cases', () => {
    it('should handle all OrderStatus enum values', () => {
      const allStatuses = Object.values(OrderStatus);
      allStatuses.forEach((status) => {
        // Should not throw
        expect(() => OrderStateMachine.getAllowedTransitions(status)).not.toThrow();
        expect(() => OrderStateMachine.isTerminalState(status)).not.toThrow();
        expect(() => OrderStateMachine.getTransitionDescription(status)).not.toThrow();
      });
    });

    it('should be consistent: getAllowedTransitions matches canTransition', () => {
      const allStatuses = Object.values(OrderStatus);
      allStatuses.forEach((from) => {
        const allowed = OrderStateMachine.getAllowedTransitions(from);
        allStatuses.forEach((to) => {
          const canTransition = OrderStateMachine.canTransition(from, to);
          if (allowed.includes(to)) {
            expect(canTransition).toBe(true);
          } else {
            expect(canTransition).toBe(false);
          }
        });
      });
    });

    it('should be consistent: isTerminalState matches empty getAllowedTransitions', () => {
      const allStatuses = Object.values(OrderStatus);
      allStatuses.forEach((status) => {
        const isTerminal = OrderStateMachine.isTerminalState(status);
        const transitions = OrderStateMachine.getAllowedTransitions(status);
        expect(isTerminal).toBe(transitions.length === 0);
      });
    });
  });

  // ============================================
  // Business Logic Scenarios
  // ============================================
  describe('Business Logic Scenarios', () => {
    it('should enforce payment before completion (must go through CONFIRMED)', () => {
      // Can't go directly from RESERVED to COMPLETED
      expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.COMPLETED)).toBe(false);
    });

    it('should only allow refunds after confirmation', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.REFUNDED)).toBe(false);
      expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.REFUNDED)).toBe(false);
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.REFUNDED)).toBe(true);
    });

    it('should prevent re-opening completed orders', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.COMPLETED, OrderStatus.CONFIRMED)).toBe(false);
      expect(OrderStateMachine.canTransition(OrderStatus.COMPLETED, OrderStatus.RESERVED)).toBe(false);
      expect(OrderStateMachine.canTransition(OrderStatus.COMPLETED, OrderStatus.PENDING)).toBe(false);
    });

    it('should prevent re-opening cancelled orders', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CANCELLED, OrderStatus.PENDING)).toBe(false);
      expect(OrderStateMachine.canTransition(OrderStatus.CANCELLED, OrderStatus.RESERVED)).toBe(false);
    });

    it('should allow cancellation from any active state', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED)).toBe(true);
      expect(OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.CANCELLED)).toBe(true);
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
    });
  });
});
