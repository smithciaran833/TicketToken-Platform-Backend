/**
 * Unit Tests: Saga Coordinator
 *
 * Tests distributed transaction saga pattern including:
 * - Successful saga execution
 * - Compensation on failure
 * - Step ordering
 */

import { SagaCoordinator, SagaStep, SagaResult } from '../../../src/utils/saga-coordinator';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('SagaCoordinator', () => {
  let coordinator: SagaCoordinator;

  beforeEach(() => {
    coordinator = new SagaCoordinator();
    jest.clearAllMocks();
  });

  // ============================================
  // Successful Execution
  // ============================================
  describe('Successful Execution', () => {
    it('should execute all steps in order', async () => {
      const executionOrder: string[] = [];

      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: jest.fn(async () => {
            executionOrder.push('execute1');
            return 'result1';
          }),
          compensate: jest.fn(),
        },
        {
          name: 'step2',
          execute: jest.fn(async () => {
            executionOrder.push('execute2');
            return 'result2';
          }),
          compensate: jest.fn(),
        },
        {
          name: 'step3',
          execute: jest.fn(async () => {
            executionOrder.push('execute3');
            return 'result3';
          }),
          compensate: jest.fn(),
        },
      ];

      await coordinator.executeSaga(steps);

      expect(executionOrder).toEqual(['execute1', 'execute2', 'execute3']);
    });

    it('should return success result with all step results', async () => {
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => ({ id: 1 }),
          compensate: jest.fn(),
        },
        {
          name: 'step2',
          execute: async () => ({ id: 2 }),
          compensate: jest.fn(),
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.compensated).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should not call compensate on success', async () => {
      const compensate = jest.fn();
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result',
          compensate,
        },
      ];

      await coordinator.executeSaga(steps);

      expect(compensate).not.toHaveBeenCalled();
    });

    it('should handle empty steps array', async () => {
      const result = await coordinator.executeSaga([]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.compensated).toBe(false);
    });

    it('should handle steps returning different types', async () => {
      const steps: SagaStep[] = [
        {
          name: 'string-step',
          execute: async () => 'string-result',
          compensate: jest.fn(),
        },
        {
          name: 'number-step',
          execute: async () => 42,
          compensate: jest.fn(),
        },
        {
          name: 'object-step',
          execute: async () => ({ key: 'value' }),
          compensate: jest.fn(),
        },
        {
          name: 'null-step',
          execute: async () => null,
          compensate: jest.fn(),
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([
        'string-result',
        42,
        { key: 'value' },
        null,
      ]);
    });
  });

  // ============================================
  // Failure and Compensation
  // ============================================
  describe('Failure and Compensation', () => {
    it('should compensate in reverse order on failure', async () => {
      const compensationOrder: string[] = [];

      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: jest.fn(async () => {
            compensationOrder.push('compensate1');
          }),
        },
        {
          name: 'step2',
          execute: async () => 'result2',
          compensate: jest.fn(async () => {
            compensationOrder.push('compensate2');
          }),
        },
        {
          name: 'step3',
          execute: async () => {
            throw new Error('Step 3 failed');
          },
          compensate: jest.fn(async () => {
            compensationOrder.push('compensate3');
          }),
        },
      ];

      await coordinator.executeSaga(steps);

      // Step 3 fails so only steps 1 and 2 need compensation
      // Compensation should be in reverse order: 2, then 1
      expect(compensationOrder).toEqual(['compensate2', 'compensate1']);
    });

    it('should return failure result with error', async () => {
      const testError = new Error('Saga step failed');

      const steps: SagaStep[] = [
        {
          name: 'failing-step',
          execute: async () => {
            throw testError;
          },
          compensate: jest.fn(),
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(false);
      expect(result.error).toBe(testError);
      expect(result.compensated).toBe(true);
      expect(result.results).toEqual([]);
    });

    it('should pass step result to compensate function', async () => {
      const compensateMock = jest.fn();

      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => ({ orderId: '123', tickets: ['A1', 'A2'] }),
          compensate: compensateMock,
        },
        {
          name: 'step2',
          execute: async () => {
            throw new Error('Failed');
          },
          compensate: jest.fn(),
        },
      ];

      await coordinator.executeSaga(steps);

      expect(compensateMock).toHaveBeenCalledWith({
        orderId: '123',
        tickets: ['A1', 'A2'],
      });
    });

    it('should continue compensating even if one compensation fails', async () => {
      const compensations: string[] = [];

      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: jest.fn(async () => {
            compensations.push('compensate1');
          }),
        },
        {
          name: 'step2',
          execute: async () => 'result2',
          compensate: jest.fn(async () => {
            compensations.push('compensate2-failed');
            throw new Error('Compensation failed');
          }),
        },
        {
          name: 'step3',
          execute: async () => {
            throw new Error('Step 3 failed');
          },
          compensate: jest.fn(),
        },
      ];

      const result = await coordinator.executeSaga(steps);

      // Both compensations should be attempted
      expect(compensations).toContain('compensate2-failed');
      expect(compensations).toContain('compensate1');
      expect(result.compensated).toBe(true);
    });

    it('should only compensate executed steps', async () => {
      const compensate1 = jest.fn();
      const compensate2 = jest.fn();
      const compensate3 = jest.fn();

      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: compensate1,
        },
        {
          name: 'step2',
          execute: async () => {
            throw new Error('Step 2 failed');
          },
          compensate: compensate2,
        },
        {
          name: 'step3',
          execute: async () => 'result3',
          compensate: compensate3,
        },
      ];

      await coordinator.executeSaga(steps);

      // Only step1 was completed, so only it should be compensated
      expect(compensate1).toHaveBeenCalled();
      expect(compensate2).not.toHaveBeenCalled(); // Failed step
      expect(compensate3).not.toHaveBeenCalled(); // Never executed
    });
  });

  // ============================================
  // Reset
  // ============================================
  describe('Reset', () => {
    it('should clear executed steps on reset', async () => {
      const compensate = jest.fn();

      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate,
        },
      ];

      // First saga execution
      await coordinator.executeSaga(steps);
      
      // Reset
      coordinator.reset();

      // Execute a failing saga
      const failingSteps: SagaStep[] = [
        {
          name: 'failing-step',
          execute: async () => {
            throw new Error('Failed');
          },
          compensate: jest.fn(),
        },
      ];

      await coordinator.executeSaga(failingSteps);

      // The compensate from the first saga should not be called
      // because reset cleared the executed steps
      expect(compensate).not.toHaveBeenCalled();
    });

    it('should allow reuse after reset', async () => {
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: jest.fn(),
        },
      ];

      // First execution
      const result1 = await coordinator.executeSaga(steps);
      expect(result1.success).toBe(true);

      // Reset
      coordinator.reset();

      // Second execution
      const result2 = await coordinator.executeSaga(steps);
      expect(result2.success).toBe(true);
    });
  });

  // ============================================
  // Real-world Scenarios
  // ============================================
  describe('Real-world Scenarios', () => {
    it('should handle order creation saga', async () => {
      const steps: SagaStep[] = [
        {
          name: 'reserve-tickets',
          execute: async () => ({ reservationId: 'res-123' }),
          compensate: async (result) => {
            // Release tickets
            expect(result.reservationId).toBe('res-123');
          },
        },
        {
          name: 'create-payment-intent',
          execute: async () => ({ paymentIntentId: 'pi-456' }),
          compensate: async (result) => {
            // Cancel payment intent
            expect(result.paymentIntentId).toBe('pi-456');
          },
        },
        {
          name: 'create-order',
          execute: async () => ({ orderId: 'order-789' }),
          compensate: async (result) => {
            // Delete order
            expect(result.orderId).toBe('order-789');
          },
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({ reservationId: 'res-123' });
      expect(result.results[1]).toEqual({ paymentIntentId: 'pi-456' });
      expect(result.results[2]).toEqual({ orderId: 'order-789' });
    });

    it('should rollback on payment failure', async () => {
      const releaseTickets = jest.fn();

      const steps: SagaStep[] = [
        {
          name: 'reserve-tickets',
          execute: async () => ({ reservationId: 'res-123' }),
          compensate: releaseTickets,
        },
        {
          name: 'create-payment-intent',
          execute: async () => {
            throw new Error('Payment provider unavailable');
          },
          compensate: jest.fn(),
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);
      expect(releaseTickets).toHaveBeenCalledWith({ reservationId: 'res-123' });
    });
  });
});
