import { OrderStateMachine } from '../../../src/utils/order-state-machine';
import { OrderStatus } from '../../../src/types/order.types';

describe('OrderStateMachine', () => {
  describe('canTransition', () => {
    it('should allow PENDING → RESERVED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.RESERVED)
      ).toBe(true);
    });

    it('should allow PENDING → CANCELLED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED)
      ).toBe(true);
    });

    it('should allow PENDING → EXPIRED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.PENDING, OrderStatus.EXPIRED)
      ).toBe(true);
    });

    it('should allow RESERVED → CONFIRMED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.CONFIRMED)
      ).toBe(true);
    });

    it('should allow RESERVED → CANCELLED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.RESERVED, OrderStatus.CANCELLED)
      ).toBe(true);
    });

    it('should allow CONFIRMED → REFUNDED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.REFUNDED)
      ).toBe(true);
    });

    it('should NOT allow CONFIRMED → PENDING transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.PENDING)
      ).toBe(false);
    });

    it('should NOT allow CANCELLED → CONFIRMED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.CANCELLED, OrderStatus.CONFIRMED)
      ).toBe(false);
    });

    it('should NOT allow EXPIRED → RESERVED transition', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.EXPIRED, OrderStatus.RESERVED)
      ).toBe(false);
    });

    it('should NOT allow transitions from terminal states', () => {
      expect(
        OrderStateMachine.canTransition(OrderStatus.COMPLETED, OrderStatus.PENDING)
      ).toBe(false);
      
      expect(
        OrderStateMachine.canTransition(OrderStatus.CANCELLED, OrderStatus.PENDING)
      ).toBe(false);
      
      expect(
        OrderStateMachine.canTransition(OrderStatus.REFUNDED, OrderStatus.CONFIRMED)
      ).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.PENDING, OrderStatus.RESERVED);
      }).not.toThrow();

      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.RESERVED, OrderStatus.CONFIRMED);
      }).not.toThrow();
    });

    it('should throw for invalid transitions', () => {
      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.CONFIRMED, OrderStatus.PENDING);
      }).toThrow('Invalid order status transition');

      expect(() => {
        OrderStateMachine.validateTransition(OrderStatus.CANCELLED, OrderStatus.RESERVED);
      }).toThrow('Invalid order status transition');
    });

    it('should include allowed transitions in error message', () => {
      try {
        OrderStateMachine.validateTransition(OrderStatus.PENDING, OrderStatus.COMPLETED);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('PENDING → COMPLETED');
        expect(error.message).toContain('Valid transitions from PENDING');
        expect(error.message).toContain('RESERVED');
        expect(error.message).toContain('CANCELLED');
      }
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return correct transitions for PENDING', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.PENDING);
      expect(transitions).toEqual([
        OrderStatus.RESERVED,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
      ]);
    });

    it('should return correct transitions for RESERVED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.RESERVED);
      expect(transitions).toEqual([
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
      ]);
    });

    it('should return correct transitions for CONFIRMED', () => {
      const transitions = OrderStateMachine.getAllowedTransitions(OrderStatus.CONFIRMED);
      expect(transitions).toEqual([
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
        OrderStatus.REFUNDED,
      ]);
    });

    it('should return empty array for terminal states', () => {
      expect(OrderStateMachine.getAllowedTransitions(OrderStatus.COMPLETED)).toEqual([]);
      expect(OrderStateMachine.getAllowedTransitions(OrderStatus.CANCELLED)).toEqual([]);
      expect(OrderStateMachine.getAllowedTransitions(OrderStatus.EXPIRED)).toEqual([]);
      expect(OrderStateMachine.getAllowedTransitions(OrderStatus.REFUNDED)).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for terminal states', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.COMPLETED)).toBe(true);
      expect(OrderStateMachine.isTerminalState(OrderStatus.CANCELLED)).toBe(true);
      expect(OrderStateMachine.isTerminalState(OrderStatus.EXPIRED)).toBe(true);
      expect(OrderStateMachine.isTerminalState(OrderStatus.REFUNDED)).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(OrderStateMachine.isTerminalState(OrderStatus.PENDING)).toBe(false);
      expect(OrderStateMachine.isTerminalState(OrderStatus.RESERVED)).toBe(false);
      expect(OrderStateMachine.isTerminalState(OrderStatus.CONFIRMED)).toBe(false);
    });
  });

  describe('getTransitionDescription', () => {
    it('should return description for non-terminal states', () => {
      const desc = OrderStateMachine.getTransitionDescription(OrderStatus.PENDING);
      expect(desc).toContain('From PENDING');
      expect(desc).toContain('RESERVED');
      expect(desc).toContain('CANCELLED');
    });

    it('should return terminal state message for terminal states', () => {
      const desc = OrderStateMachine.getTransitionDescription(OrderStatus.COMPLETED);
      expect(desc).toContain('terminal state');
      expect(desc).toContain('no valid transitions');
    });
  });

  describe('validateTransitionPath', () => {
    it('should validate valid transition path', () => {
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

    it('should validate another valid path', () => {
      const path = [
        OrderStatus.PENDING,
        OrderStatus.RESERVED,
        OrderStatus.CANCELLED,
      ];
      const result = OrderStateMachine.validateTransitionPath(path);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid transition path', () => {
      const path = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED, // Invalid: should go through RESERVED
      ];
      const result = OrderStateMachine.validateTransitionPath(path);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(result.error).toContain('PENDING → CONFIRMED');
    });

    it('should reject path with terminal state in middle', () => {
      const path = [
        OrderStatus.PENDING,
        OrderStatus.CANCELLED,
        OrderStatus.RESERVED, // Can't transition from CANCELLED
      ];
      const result = OrderStateMachine.validateTransitionPath(path);
      expect(result.valid).toBe(false);
    });

    it('should return valid for single-item path', () => {
      const path = [OrderStatus.PENDING];
      const result = OrderStateMachine.validateTransitionPath(path);
      expect(result.valid).toBe(true);
    });

    it('should return valid for empty path', () => {
      const path: OrderStatus[] = [];
      const result = OrderStateMachine.validateTransitionPath(path);
      expect(result.valid).toBe(true);
    });
  });
});
