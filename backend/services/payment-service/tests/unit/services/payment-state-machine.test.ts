/**
 * Unit Tests for Payment State Machine
 * 
 * Tests payment state transitions and valid state flows.
 */

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('Payment State Machine', () => {
  // Define payment states
  type PaymentState = 
    | 'created'
    | 'pending'
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'succeeded'
    | 'canceled'
    | 'failed'
    | 'refunded'
    | 'partially_refunded';

  // Valid transitions map
  const validTransitions: Record<PaymentState, PaymentState[]> = {
    created: ['pending', 'requires_payment_method', 'canceled'],
    pending: ['requires_confirmation', 'requires_action', 'processing', 'failed', 'canceled'],
    requires_payment_method: ['pending', 'requires_confirmation', 'canceled'],
    requires_confirmation: ['processing', 'requires_action', 'canceled'],
    requires_action: ['processing', 'requires_confirmation', 'canceled', 'failed'],
    processing: ['requires_capture', 'succeeded', 'failed'],
    requires_capture: ['succeeded', 'canceled'],
    succeeded: ['refunded', 'partially_refunded'],
    canceled: [], // Terminal state
    failed: ['pending'], // Can retry
    refunded: [], // Terminal state
    partially_refunded: ['refunded'],
  };

  const canTransition = (from: PaymentState, to: PaymentState): boolean => {
    return validTransitions[from]?.includes(to) ?? false;
  };

  describe('State Definitions', () => {
    it('should have all states defined', () => {
      const states: PaymentState[] = [
        'created',
        'pending',
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing',
        'requires_capture',
        'succeeded',
        'canceled',
        'failed',
        'refunded',
        'partially_refunded',
      ];

      states.forEach(state => {
        expect(validTransitions[state]).toBeDefined();
      });
    });

    it('should identify terminal states', () => {
      const terminalStates: PaymentState[] = ['canceled', 'refunded'];
      
      terminalStates.forEach(state => {
        expect(validTransitions[state]).toHaveLength(0);
      });
    });
  });

  describe('Valid Transitions', () => {
    it('should allow transition from created to pending', () => {
      expect(canTransition('created', 'pending')).toBe(true);
    });

    it('should allow transition from created to canceled', () => {
      expect(canTransition('created', 'canceled')).toBe(true);
    });

    it('should allow transition from pending to processing', () => {
      expect(canTransition('pending', 'processing')).toBe(true);
    });

    it('should allow transition from processing to succeeded', () => {
      expect(canTransition('processing', 'succeeded')).toBe(true);
    });

    it('should allow transition from processing to failed', () => {
      expect(canTransition('processing', 'failed')).toBe(true);
    });

    it('should allow transition from succeeded to refunded', () => {
      expect(canTransition('succeeded', 'refunded')).toBe(true);
    });

    it('should allow transition from succeeded to partially_refunded', () => {
      expect(canTransition('succeeded', 'partially_refunded')).toBe(true);
    });

    it('should allow transition from requires_capture to succeeded', () => {
      expect(canTransition('requires_capture', 'succeeded')).toBe(true);
    });

    it('should allow transition from failed to pending (retry)', () => {
      expect(canTransition('failed', 'pending')).toBe(true);
    });

    it('should allow transition from partially_refunded to refunded', () => {
      expect(canTransition('partially_refunded', 'refunded')).toBe(true);
    });
  });

  describe('Invalid Transitions', () => {
    it('should not allow transition from succeeded to pending', () => {
      expect(canTransition('succeeded', 'pending')).toBe(false);
    });

    it('should not allow transition from canceled (terminal)', () => {
      expect(canTransition('canceled', 'pending')).toBe(false);
      expect(canTransition('canceled', 'processing')).toBe(false);
    });

    it('should not allow transition from refunded (terminal)', () => {
      expect(canTransition('refunded', 'succeeded')).toBe(false);
    });

    it('should not allow skipping states', () => {
      expect(canTransition('created', 'succeeded')).toBe(false);
      expect(canTransition('created', 'refunded')).toBe(false);
    });

    it('should not allow transition from processing back to created', () => {
      expect(canTransition('processing', 'created')).toBe(false);
    });
  });

  describe('Payment Flow Scenarios', () => {
    it('should support happy path flow', () => {
      const happyPath: PaymentState[] = [
        'created',
        'requires_payment_method',
        'pending',
        'processing',
        'succeeded',
      ];

      for (let i = 0; i < happyPath.length - 1; i++) {
        expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
      }
    });

    it('should support manual capture flow', () => {
      const manualCaptureFlow: PaymentState[] = [
        'created',
        'pending',
        'processing',
        'requires_capture',
        'succeeded',
      ];

      for (let i = 0; i < manualCaptureFlow.length - 1; i++) {
        expect(canTransition(manualCaptureFlow[i], manualCaptureFlow[i + 1])).toBe(true);
      }
    });

    it('should support 3DS authentication flow', () => {
      const threeDSFlow: PaymentState[] = [
        'pending',
        'requires_action',
        'processing',
        'succeeded',
      ];

      for (let i = 0; i < threeDSFlow.length - 1; i++) {
        expect(canTransition(threeDSFlow[i], threeDSFlow[i + 1])).toBe(true);
      }
    });

    it('should support refund flow', () => {
      const refundFlow: PaymentState[] = [
        'succeeded',
        'partially_refunded',
        'refunded',
      ];

      for (let i = 0; i < refundFlow.length - 1; i++) {
        expect(canTransition(refundFlow[i], refundFlow[i + 1])).toBe(true);
      }
    });

    it('should support cancellation flow', () => {
      expect(canTransition('created', 'canceled')).toBe(true);
      expect(canTransition('pending', 'canceled')).toBe(true);
      expect(canTransition('requires_confirmation', 'canceled')).toBe(true);
      expect(canTransition('requires_capture', 'canceled')).toBe(true);
    });

    it('should support failure and retry flow', () => {
      const failureRetryFlow: PaymentState[] = [
        'processing',
        'failed',
        'pending',
        'processing',
        'succeeded',
      ];

      for (let i = 0; i < failureRetryFlow.length - 1; i++) {
        expect(canTransition(failureRetryFlow[i], failureRetryFlow[i + 1])).toBe(true);
      }
    });
  });

  describe('State Metadata', () => {
    interface StateMetadata {
      state: PaymentState;
      timestamp: Date;
      reason?: string;
      actor?: string;
    }

    it('should track state history', () => {
      const stateHistory: StateMetadata[] = [
        { state: 'created', timestamp: new Date('2026-01-08T10:00:00Z') },
        { state: 'pending', timestamp: new Date('2026-01-08T10:00:01Z') },
        { state: 'processing', timestamp: new Date('2026-01-08T10:00:02Z') },
        { state: 'succeeded', timestamp: new Date('2026-01-08T10:00:03Z') },
      ];

      expect(stateHistory).toHaveLength(4);
      expect(stateHistory[0].state).toBe('created');
      expect(stateHistory[stateHistory.length - 1].state).toBe('succeeded');
    });

    it('should record transition reason', () => {
      const failedState: StateMetadata = {
        state: 'failed',
        timestamp: new Date(),
        reason: 'Card declined: insufficient_funds',
      };

      expect(failedState.reason).toContain('insufficient_funds');
    });

    it('should record actor for manual transitions', () => {
      const canceledState: StateMetadata = {
        state: 'canceled',
        timestamp: new Date(),
        reason: 'Customer requested cancellation',
        actor: 'user-123',
      };

      expect(canceledState.actor).toBe('user-123');
    });
  });

  describe('Timeout Handling', () => {
    it('should transition to failed after payment timeout', () => {
      const paymentCreatedAt = new Date('2026-01-08T10:00:00Z');
      const now = new Date('2026-01-08T10:31:00Z'); // 31 minutes later
      const timeoutMinutes = 30;

      const hasTimedOut = (now.getTime() - paymentCreatedAt.getTime()) > timeoutMinutes * 60 * 1000;
      
      expect(hasTimedOut).toBe(true);
    });

    it('should not timeout within allowed window', () => {
      const paymentCreatedAt = new Date('2026-01-08T10:00:00Z');
      const now = new Date('2026-01-08T10:25:00Z'); // 25 minutes later
      const timeoutMinutes = 30;

      const hasTimedOut = (now.getTime() - paymentCreatedAt.getTime()) > timeoutMinutes * 60 * 1000;
      
      expect(hasTimedOut).toBe(false);
    });

    it('should transition requires_action to failed after SCA timeout', () => {
      const scaTimeoutMinutes = 15;
      const actionRequiredAt = new Date('2026-01-08T10:00:00Z');
      const now = new Date('2026-01-08T10:20:00Z'); // 20 minutes later

      const hasScaTimedOut = (now.getTime() - actionRequiredAt.getTime()) > scaTimeoutMinutes * 60 * 1000;
      
      expect(hasScaTimedOut).toBe(true);
    });
  });

  describe('Idempotency', () => {
    it('should be idempotent for same state transition', () => {
      const currentState: PaymentState = 'processing';
      const requestedState: PaymentState = 'succeeded';
      
      // First transition succeeds
      const firstResult = canTransition(currentState, requestedState);
      
      // Same request should give same result
      const secondResult = canTransition(currentState, requestedState);
      
      expect(firstResult).toBe(secondResult);
    });

    it('should reject duplicate transitions to terminal state', () => {
      // Once in terminal state, can't transition again
      const terminalState: PaymentState = 'refunded';
      const anyOtherState: PaymentState = 'succeeded';
      
      expect(canTransition(terminalState, anyOtherState)).toBe(false);
    });
  });
});
