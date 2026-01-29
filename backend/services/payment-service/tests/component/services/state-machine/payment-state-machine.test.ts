/**
 * COMPONENT TEST: PaymentStateMachine
 *
 * Tests payment state transitions
 */

process.env.NODE_ENV = 'test';

import { PaymentStateMachine, PaymentState } from '../../../../src/services/state-machine/payment-state-machine';

describe('PaymentStateMachine Component Tests', () => {
  let machine: PaymentStateMachine;

  beforeEach(() => {
    machine = new PaymentStateMachine();
  });

  // ===========================================================================
  // CAN TRANSITION
  // ===========================================================================
  describe('canTransition()', () => {
    it('should allow pending -> processing', () => {
      expect(machine.canTransition(PaymentState.PENDING, 'process')).toBe(true);
    });

    it('should allow processing -> completed', () => {
      expect(machine.canTransition(PaymentState.PROCESSING, 'complete')).toBe(true);
    });

    it('should allow processing -> failed', () => {
      expect(machine.canTransition(PaymentState.PROCESSING, 'fail')).toBe(true);
    });

    it('should allow failed -> processing (retry)', () => {
      expect(machine.canTransition(PaymentState.FAILED, 'retry')).toBe(true);
    });

    it('should allow completed -> refunded', () => {
      expect(machine.canTransition(PaymentState.COMPLETED, 'refund')).toBe(true);
    });

    it('should allow pending -> cancelled', () => {
      expect(machine.canTransition(PaymentState.PENDING, 'cancel')).toBe(true);
    });

    it('should not allow completed -> processing', () => {
      expect(machine.canTransition(PaymentState.COMPLETED, 'process')).toBe(false);
    });

    it('should not allow refunded -> any', () => {
      expect(machine.canTransition(PaymentState.REFUNDED, 'process')).toBe(false);
      expect(machine.canTransition(PaymentState.REFUNDED, 'complete')).toBe(false);
    });

    it('should not allow cancelled -> any', () => {
      expect(machine.canTransition(PaymentState.CANCELLED, 'process')).toBe(false);
    });
  });

  // ===========================================================================
  // TRANSITION
  // ===========================================================================
  describe('transition()', () => {
    it('should return new state on valid transition', () => {
      const newState = machine.transition(PaymentState.PENDING, 'process');
      expect(newState).toBe(PaymentState.PROCESSING);
    });

    it('should return completed state', () => {
      const newState = machine.transition(PaymentState.PROCESSING, 'complete');
      expect(newState).toBe(PaymentState.COMPLETED);
    });

    it('should return failed state', () => {
      const newState = machine.transition(PaymentState.PROCESSING, 'fail');
      expect(newState).toBe(PaymentState.FAILED);
    });

    it('should return processing on retry', () => {
      const newState = machine.transition(PaymentState.FAILED, 'retry');
      expect(newState).toBe(PaymentState.PROCESSING);
    });

    it('should return refunded state', () => {
      const newState = machine.transition(PaymentState.COMPLETED, 'refund');
      expect(newState).toBe(PaymentState.REFUNDED);
    });

    it('should throw on invalid transition', () => {
      expect(() => machine.transition(PaymentState.COMPLETED, 'process'))
        .toThrow('Invalid transition');
    });

    it('should throw on unknown event', () => {
      expect(() => machine.transition(PaymentState.PENDING, 'unknown'))
        .toThrow('Invalid transition');
    });
  });

  // ===========================================================================
  // FULL PAYMENT FLOW
  // ===========================================================================
  describe('full payment flow', () => {
    it('should support happy path: pending -> processing -> completed', () => {
      let state = PaymentState.PENDING;
      
      state = machine.transition(state, 'process');
      expect(state).toBe(PaymentState.PROCESSING);
      
      state = machine.transition(state, 'complete');
      expect(state).toBe(PaymentState.COMPLETED);
    });

    it('should support failure and retry path', () => {
      let state = PaymentState.PENDING;
      
      state = machine.transition(state, 'process');
      state = machine.transition(state, 'fail');
      expect(state).toBe(PaymentState.FAILED);
      
      state = machine.transition(state, 'retry');
      expect(state).toBe(PaymentState.PROCESSING);
      
      state = machine.transition(state, 'complete');
      expect(state).toBe(PaymentState.COMPLETED);
    });

    it('should support refund path', () => {
      let state = PaymentState.PENDING;
      
      state = machine.transition(state, 'process');
      state = machine.transition(state, 'complete');
      state = machine.transition(state, 'refund');
      expect(state).toBe(PaymentState.REFUNDED);
    });

    it('should support cancellation path', () => {
      let state = PaymentState.PENDING;
      
      state = machine.transition(state, 'cancel');
      expect(state).toBe(PaymentState.CANCELLED);
    });
  });
});
