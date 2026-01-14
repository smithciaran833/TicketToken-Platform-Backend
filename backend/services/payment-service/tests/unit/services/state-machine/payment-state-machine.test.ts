/**
 * Payment State Machine Unit Tests
 * 
 * Tests for:
 * - Valid state transitions
 * - Invalid state transitions
 * - State transition checking (canTransition)
 * - All payment state flows
 */

import { PaymentStateMachine, PaymentState } from '../../../../src/services/state-machine/payment-state-machine';

describe('PaymentStateMachine', () => {
  let stateMachine: PaymentStateMachine;

  beforeEach(() => {
    stateMachine = new PaymentStateMachine();
  });

  // ===========================================================================
  // VALID STATE TRANSITIONS
  // ===========================================================================

  describe('valid state transitions', () => {
    it('should transition PENDING -> PROCESSING on "process" event', () => {
      const result = stateMachine.transition(PaymentState.PENDING, 'process');
      expect(result).toBe(PaymentState.PROCESSING);
    });

    it('should transition PROCESSING -> COMPLETED on "complete" event', () => {
      const result = stateMachine.transition(PaymentState.PROCESSING, 'complete');
      expect(result).toBe(PaymentState.COMPLETED);
    });

    it('should transition PROCESSING -> FAILED on "fail" event', () => {
      const result = stateMachine.transition(PaymentState.PROCESSING, 'fail');
      expect(result).toBe(PaymentState.FAILED);
    });

    it('should transition FAILED -> PROCESSING on "retry" event', () => {
      const result = stateMachine.transition(PaymentState.FAILED, 'retry');
      expect(result).toBe(PaymentState.PROCESSING);
    });

    it('should transition COMPLETED -> REFUNDED on "refund" event', () => {
      const result = stateMachine.transition(PaymentState.COMPLETED, 'refund');
      expect(result).toBe(PaymentState.REFUNDED);
    });

    it('should transition PENDING -> CANCELLED on "cancel" event', () => {
      const result = stateMachine.transition(PaymentState.PENDING, 'cancel');
      expect(result).toBe(PaymentState.CANCELLED);
    });
  });

  // ===========================================================================
  // CAN TRANSITION
  // ===========================================================================

  describe('canTransition', () => {
    describe('from PENDING state', () => {
      it('should allow process event', () => {
        expect(stateMachine.canTransition(PaymentState.PENDING, 'process')).toBe(true);
      });

      it('should allow cancel event', () => {
        expect(stateMachine.canTransition(PaymentState.PENDING, 'cancel')).toBe(true);
      });

      it('should not allow complete event', () => {
        expect(stateMachine.canTransition(PaymentState.PENDING, 'complete')).toBe(false);
      });

      it('should not allow fail event', () => {
        expect(stateMachine.canTransition(PaymentState.PENDING, 'fail')).toBe(false);
      });

      it('should not allow refund event', () => {
        expect(stateMachine.canTransition(PaymentState.PENDING, 'refund')).toBe(false);
      });
    });

    describe('from PROCESSING state', () => {
      it('should allow complete event', () => {
        expect(stateMachine.canTransition(PaymentState.PROCESSING, 'complete')).toBe(true);
      });

      it('should allow fail event', () => {
        expect(stateMachine.canTransition(PaymentState.PROCESSING, 'fail')).toBe(true);
      });

      it('should not allow process event', () => {
        expect(stateMachine.canTransition(PaymentState.PROCESSING, 'process')).toBe(false);
      });

      it('should not allow cancel event', () => {
        expect(stateMachine.canTransition(PaymentState.PROCESSING, 'cancel')).toBe(false);
      });

      it('should not allow refund event', () => {
        expect(stateMachine.canTransition(PaymentState.PROCESSING, 'refund')).toBe(false);
      });
    });

    describe('from COMPLETED state', () => {
      it('should allow refund event', () => {
        expect(stateMachine.canTransition(PaymentState.COMPLETED, 'refund')).toBe(true);
      });

      it('should not allow process event', () => {
        expect(stateMachine.canTransition(PaymentState.COMPLETED, 'process')).toBe(false);
      });

      it('should not allow complete event', () => {
        expect(stateMachine.canTransition(PaymentState.COMPLETED, 'complete')).toBe(false);
      });

      it('should not allow cancel event', () => {
        expect(stateMachine.canTransition(PaymentState.COMPLETED, 'cancel')).toBe(false);
      });
    });

    describe('from FAILED state', () => {
      it('should allow retry event', () => {
        expect(stateMachine.canTransition(PaymentState.FAILED, 'retry')).toBe(true);
      });

      it('should not allow complete event', () => {
        expect(stateMachine.canTransition(PaymentState.FAILED, 'complete')).toBe(false);
      });

      it('should not allow cancel event', () => {
        expect(stateMachine.canTransition(PaymentState.FAILED, 'cancel')).toBe(false);
      });
    });

    describe('from REFUNDED state (terminal)', () => {
      it('should not allow any events', () => {
        expect(stateMachine.canTransition(PaymentState.REFUNDED, 'process')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.REFUNDED, 'complete')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.REFUNDED, 'fail')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.REFUNDED, 'retry')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.REFUNDED, 'refund')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.REFUNDED, 'cancel')).toBe(false);
      });
    });

    describe('from CANCELLED state (terminal)', () => {
      it('should not allow any events', () => {
        expect(stateMachine.canTransition(PaymentState.CANCELLED, 'process')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.CANCELLED, 'complete')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.CANCELLED, 'fail')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.CANCELLED, 'retry')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.CANCELLED, 'refund')).toBe(false);
        expect(stateMachine.canTransition(PaymentState.CANCELLED, 'cancel')).toBe(false);
      });
    });
  });

  // ===========================================================================
  // INVALID TRANSITIONS
  // ===========================================================================

  describe('invalid transitions', () => {
    it('should throw error for PENDING -> COMPLETED', () => {
      expect(() => stateMachine.transition(PaymentState.PENDING, 'complete')).toThrow(
        'Invalid transition: pending -> complete'
      );
    });

    it('should throw error for PENDING -> FAILED', () => {
      expect(() => stateMachine.transition(PaymentState.PENDING, 'fail')).toThrow(
        'Invalid transition: pending -> fail'
      );
    });

    it('should throw error for PENDING -> REFUNDED', () => {
      expect(() => stateMachine.transition(PaymentState.PENDING, 'refund')).toThrow(
        'Invalid transition: pending -> refund'
      );
    });

    it('should throw error for PROCESSING -> CANCELLED', () => {
      expect(() => stateMachine.transition(PaymentState.PROCESSING, 'cancel')).toThrow(
        'Invalid transition: processing -> cancel'
      );
    });

    it('should throw error for COMPLETED -> FAILED', () => {
      expect(() => stateMachine.transition(PaymentState.COMPLETED, 'fail')).toThrow(
        'Invalid transition: completed -> fail'
      );
    });

    it('should throw error for FAILED -> COMPLETED', () => {
      expect(() => stateMachine.transition(PaymentState.FAILED, 'complete')).toThrow(
        'Invalid transition: failed -> complete'
      );
    });

    it('should throw error for REFUNDED -> any event', () => {
      expect(() => stateMachine.transition(PaymentState.REFUNDED, 'process')).toThrow(
        'Invalid transition: refunded -> process'
      );
    });

    it('should throw error for CANCELLED -> any event', () => {
      expect(() => stateMachine.transition(PaymentState.CANCELLED, 'process')).toThrow(
        'Invalid transition: cancelled -> process'
      );
    });

    it('should throw error for unknown event', () => {
      expect(() => stateMachine.transition(PaymentState.PENDING, 'unknown')).toThrow(
        'Invalid transition: pending -> unknown'
      );
    });
  });

  // ===========================================================================
  // COMPLETE PAYMENT FLOWS
  // ===========================================================================

  describe('complete payment flows', () => {
    it('should complete a successful payment flow', () => {
      // PENDING -> PROCESSING -> COMPLETED
      let state = PaymentState.PENDING;
      
      expect(stateMachine.canTransition(state, 'process')).toBe(true);
      state = stateMachine.transition(state, 'process');
      expect(state).toBe(PaymentState.PROCESSING);
      
      expect(stateMachine.canTransition(state, 'complete')).toBe(true);
      state = stateMachine.transition(state, 'complete');
      expect(state).toBe(PaymentState.COMPLETED);
    });

    it('should complete a failed and retried payment flow', () => {
      // PENDING -> PROCESSING -> FAILED -> PROCESSING -> COMPLETED
      let state = PaymentState.PENDING;
      
      state = stateMachine.transition(state, 'process');
      expect(state).toBe(PaymentState.PROCESSING);
      
      state = stateMachine.transition(state, 'fail');
      expect(state).toBe(PaymentState.FAILED);
      
      state = stateMachine.transition(state, 'retry');
      expect(state).toBe(PaymentState.PROCESSING);
      
      state = stateMachine.transition(state, 'complete');
      expect(state).toBe(PaymentState.COMPLETED);
    });

    it('should complete a refund flow', () => {
      // PENDING -> PROCESSING -> COMPLETED -> REFUNDED
      let state = PaymentState.PENDING;
      
      state = stateMachine.transition(state, 'process');
      state = stateMachine.transition(state, 'complete');
      expect(state).toBe(PaymentState.COMPLETED);
      
      state = stateMachine.transition(state, 'refund');
      expect(state).toBe(PaymentState.REFUNDED);
      
      // Terminal state - no more transitions
      expect(stateMachine.canTransition(state, 'refund')).toBe(false);
    });

    it('should complete a cancelled payment flow', () => {
      // PENDING -> CANCELLED
      let state = PaymentState.PENDING;
      
      state = stateMachine.transition(state, 'cancel');
      expect(state).toBe(PaymentState.CANCELLED);
      
      // Terminal state - no more transitions
      expect(stateMachine.canTransition(state, 'process')).toBe(false);
    });

    it('should allow multiple retries', () => {
      // PENDING -> PROCESSING -> FAILED -> PROCESSING -> FAILED -> PROCESSING -> COMPLETED
      let state = PaymentState.PENDING;
      
      state = stateMachine.transition(state, 'process');
      state = stateMachine.transition(state, 'fail');
      expect(state).toBe(PaymentState.FAILED);
      
      state = stateMachine.transition(state, 'retry');
      state = stateMachine.transition(state, 'fail');
      expect(state).toBe(PaymentState.FAILED);
      
      state = stateMachine.transition(state, 'retry');
      state = stateMachine.transition(state, 'complete');
      expect(state).toBe(PaymentState.COMPLETED);
    });
  });

  // ===========================================================================
  // STATE ENUM VALUES
  // ===========================================================================

  describe('PaymentState enum', () => {
    it('should have correct string values', () => {
      expect(PaymentState.PENDING).toBe('pending');
      expect(PaymentState.PROCESSING).toBe('processing');
      expect(PaymentState.COMPLETED).toBe('completed');
      expect(PaymentState.FAILED).toBe('failed');
      expect(PaymentState.REFUNDED).toBe('refunded');
      expect(PaymentState.CANCELLED).toBe('cancelled');
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle case-sensitive events', () => {
      // Events should be lowercase
      expect(() => stateMachine.transition(PaymentState.PENDING, 'PROCESS')).toThrow();
      expect(() => stateMachine.transition(PaymentState.PENDING, 'Process')).toThrow();
    });

    it('should handle empty event string', () => {
      expect(() => stateMachine.transition(PaymentState.PENDING, '')).toThrow(
        'Invalid transition: pending -> '
      );
    });

    it('should create independent state machines', () => {
      const machine1 = new PaymentStateMachine();
      const machine2 = new PaymentStateMachine();

      // Both should work independently
      expect(machine1.transition(PaymentState.PENDING, 'process')).toBe(PaymentState.PROCESSING);
      expect(machine2.transition(PaymentState.PENDING, 'cancel')).toBe(PaymentState.CANCELLED);
    });
  });
});
