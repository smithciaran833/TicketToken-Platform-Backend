/**
 * COMPONENT TEST: OrderStateMachine
 *
 * Tests order state transitions
 */

process.env.NODE_ENV = 'test';

import { OrderStateMachine, OrderState } from '../../../../src/services/state-machine/order-state-machine';

describe('OrderStateMachine Component Tests', () => {
  let machine: OrderStateMachine;

  beforeEach(() => {
    machine = new OrderStateMachine();
  });

  // ===========================================================================
  // INITIAL STATE
  // ===========================================================================
  describe('initialization', () => {
    it('should default to CREATED state', () => {
      expect(machine.getState()).toBe(OrderState.CREATED);
    });

    it('should accept initial state', () => {
      const m = new OrderStateMachine(OrderState.PAID);
      expect(m.getState()).toBe(OrderState.PAID);
    });
  });

  // ===========================================================================
  // CAN TRANSITION
  // ===========================================================================
  describe('canTransition()', () => {
    it('should allow created -> payment_pending', () => {
      expect(machine.canTransition(OrderState.PAYMENT_PENDING)).toBe(true);
    });

    it('should allow created -> cancelled', () => {
      expect(machine.canTransition(OrderState.CANCELLED)).toBe(true);
    });

    it('should allow payment_pending -> payment_processing', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      expect(machine.canTransition(OrderState.PAYMENT_PROCESSING)).toBe(true);
    });

    it('should allow payment_processing -> paid', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      expect(machine.canTransition(OrderState.PAID)).toBe(true);
    });

    it('should allow payment_processing -> payment_failed', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      expect(machine.canTransition(OrderState.PAYMENT_FAILED)).toBe(true);
    });

    it('should allow paid -> fulfilled', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAID);
      expect(machine.canTransition(OrderState.FULFILLED)).toBe(true);
    });

    it('should allow paid -> refunded', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAID);
      expect(machine.canTransition(OrderState.REFUNDED)).toBe(true);
    });

    it('should allow fulfilled -> refunded', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAID);
      machine.transition(OrderState.FULFILLED);
      expect(machine.canTransition(OrderState.REFUNDED)).toBe(true);
    });

    it('should not allow cancelled -> any', () => {
      machine.transition(OrderState.CANCELLED);
      expect(machine.canTransition(OrderState.PAYMENT_PENDING)).toBe(false);
      expect(machine.canTransition(OrderState.CREATED)).toBe(false);
    });

    it('should not allow refunded -> any', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAID);
      machine.transition(OrderState.REFUNDED);
      expect(machine.canTransition(OrderState.PAID)).toBe(false);
    });
  });

  // ===========================================================================
  // TRANSITION
  // ===========================================================================
  describe('transition()', () => {
    it('should update state on valid transition', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      expect(machine.getState()).toBe(OrderState.PAYMENT_PENDING);
    });

    it('should throw on invalid transition', () => {
      expect(() => machine.transition(OrderState.PAID))
        .toThrow('Cannot transition from created to paid');
    });

    it('should throw when transitioning from terminal state', () => {
      machine.transition(OrderState.CANCELLED);
      expect(() => machine.transition(OrderState.PAYMENT_PENDING))
        .toThrow('Cannot transition from cancelled');
    });
  });

  // ===========================================================================
  // FULL ORDER FLOWS
  // ===========================================================================
  describe('full order flows', () => {
    it('should support happy path: created -> paid -> fulfilled', () => {
      expect(machine.getState()).toBe(OrderState.CREATED);
      
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAID);
      machine.transition(OrderState.FULFILLED);
      
      expect(machine.getState()).toBe(OrderState.FULFILLED);
    });

    it('should support payment failure and retry', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAYMENT_FAILED);
      
      expect(machine.getState()).toBe(OrderState.PAYMENT_FAILED);
      
      // Retry
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAID);
      
      expect(machine.getState()).toBe(OrderState.PAID);
    });

    it('should support refund after fulfillment', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.PAYMENT_PROCESSING);
      machine.transition(OrderState.PAID);
      machine.transition(OrderState.FULFILLED);
      machine.transition(OrderState.REFUNDED);
      
      expect(machine.getState()).toBe(OrderState.REFUNDED);
    });

    it('should support early cancellation', () => {
      machine.transition(OrderState.PAYMENT_PENDING);
      machine.transition(OrderState.CANCELLED);
      
      expect(machine.getState()).toBe(OrderState.CANCELLED);
    });
  });
});
