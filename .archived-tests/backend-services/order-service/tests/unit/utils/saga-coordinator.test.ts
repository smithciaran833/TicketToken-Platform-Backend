import { SagaCoordinator, SagaStep, SagaResult } from '../../../src/utils/saga-coordinator';
import { logger } from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('SagaCoordinator', () => {
  let coordinator: SagaCoordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    coordinator = new SagaCoordinator();
  });

  describe('Successful Execution', () => {
    it('should execute all steps successfully', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };
      const step2 = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = await coordinator.executeSaga([step1, step2]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual(['result1', 'result2']);
      expect(result.compensated).toBe(false);
      expect(result.error).toBeUndefined();
      expect(step1.execute).toHaveBeenCalledTimes(1);
      expect(step2.execute).toHaveBeenCalledTimes(1);
      expect(step1.compensate).not.toHaveBeenCalled();
      expect(step2.compensate).not.toHaveBeenCalled();
    });

    it('should execute steps in order', async () => {
      const order: string[] = [];
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => { order.push('execute1'); return 'result1'; },
          compensate: async () => { order.push('compensate1'); },
        },
        {
          name: 'step2',
          execute: async () => { order.push('execute2'); return 'result2'; },
          compensate: async () => { order.push('compensate2'); },
        },
        {
          name: 'step3',
          execute: async () => { order.push('execute3'); return 'result3'; },
          compensate: async () => { order.push('compensate3'); },
        },
      ];

      await coordinator.executeSaga(steps);

      expect(order).toEqual(['execute1', 'execute2', 'execute3']);
    });

    it('should log info for each step execution', async () => {
      const steps: SagaStep[] = [
        {
          name: 'reserve-inventory',
          execute: async () => 'reserved',
          compensate: async () => {},
        },
        {
          name: 'charge-payment',
          execute: async () => 'charged',
          compensate: async () => {},
        },
      ];

      await coordinator.executeSaga(steps);

      expect(logger.info).toHaveBeenCalledWith('Executing saga step: reserve-inventory');
      expect(logger.info).toHaveBeenCalledWith('Saga step completed: reserve-inventory');
      expect(logger.info).toHaveBeenCalledWith('Executing saga step: charge-payment');
      expect(logger.info).toHaveBeenCalledWith('Saga step completed: charge-payment');
    });

    it('should handle single step saga', async () => {
      const step = {
        name: 'single-step',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn(),
      };

      const result = await coordinator.executeSaga([step]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual(['result']);
      expect(step.execute).toHaveBeenCalledTimes(1);
      expect(step.compensate).not.toHaveBeenCalled();
    });

    it('should handle steps returning different types', async () => {
      const steps: SagaStep[] = [
        {
          name: 'number-step',
          execute: async () => 42,
          compensate: async () => {},
        },
        {
          name: 'string-step',
          execute: async () => 'text',
          compensate: async () => {},
        },
        {
          name: 'object-step',
          execute: async () => ({ key: 'value' }),
          compensate: async () => {},
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.results).toEqual([42, 'text', { key: 'value' }]);
    });

    it('should handle steps returning undefined', async () => {
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => undefined,
          compensate: async () => {},
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([undefined]);
    });
  });

  describe('Failed Execution with Compensation', () => {
    it('should compensate when a step fails', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };
      const step2 = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('step2 failed')),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = await coordinator.executeSaga([step1, step2]);

      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);
      expect(result.error).toEqual(new Error('step2 failed'));
      expect(result.results).toEqual([]);
      expect(step1.compensate).toHaveBeenCalledWith('result1');
      expect(step2.compensate).not.toHaveBeenCalled();
    });

    it('should compensate steps in reverse order', async () => {
      const order: string[] = [];
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => { order.push('execute1'); return 'result1'; },
          compensate: async () => { order.push('compensate1'); },
        },
        {
          name: 'step2',
          execute: async () => { order.push('execute2'); return 'result2'; },
          compensate: async () => { order.push('compensate2'); },
        },
        {
          name: 'step3',
          execute: async () => { 
            order.push('execute3'); 
            throw new Error('failed');
          },
          compensate: async () => { order.push('compensate3'); },
        },
      ];

      await coordinator.executeSaga(steps);

      expect(order).toEqual(['execute1', 'execute2', 'execute3', 'compensate2', 'compensate1']);
    });

    it('should pass execution result to compensate function', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue({ id: 123, data: 'test' }),
        compensate: jest.fn().mockResolvedValue(undefined),
      };
      const step2 = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('fail')),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step1, step2]);

      expect(step1.compensate).toHaveBeenCalledWith({ id: 123, data: 'test' });
    });

    it('should log error when saga fails', async () => {
      const error = new Error('execution failed');
      const steps: SagaStep[] = [
        {
          name: 'failing-step',
          execute: async () => { throw error; },
          compensate: async () => {},
        },
      ];

      await coordinator.executeSaga(steps);

      expect(logger.error).toHaveBeenCalledWith(
        'Saga execution failed, starting compensation',
        { error }
      );
    });

    it('should log compensation steps', async () => {
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: async () => {},
        },
        {
          name: 'step2',
          execute: async () => { throw new Error('fail'); },
          compensate: async () => {},
        },
      ];

      await coordinator.executeSaga(steps);

      expect(logger.info).toHaveBeenCalledWith('Compensating saga step: step1');
      expect(logger.info).toHaveBeenCalledWith('Compensation completed: step1');
    });

    it('should only compensate successfully executed steps', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };
      const step2 = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn(),
      };
      const step3 = {
        name: 'step3',
        execute: jest.fn().mockRejectedValue(new Error('fail')),
        compensate: jest.fn(),
      };
      const step4 = {
        name: 'step4',
        execute: jest.fn(),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step1, step2, step3, step4]);

      expect(step1.compensate).toHaveBeenCalled();
      expect(step2.compensate).toHaveBeenCalled();
      expect(step3.compensate).not.toHaveBeenCalled();
      expect(step4.execute).not.toHaveBeenCalled();
      expect(step4.compensate).not.toHaveBeenCalled();
    });

    it('should handle first step failure', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockRejectedValue(new Error('fail')),
        compensate: jest.fn(),
      };

      const result = await coordinator.executeSaga([step1]);

      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);
      expect(step1.compensate).not.toHaveBeenCalled();
    });
  });

  describe('Compensation Failures', () => {
    it('should continue compensating even if one compensation fails', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };
      const step2 = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn().mockRejectedValue(new Error('compensation failed')),
      };
      const step3 = {
        name: 'step3',
        execute: jest.fn().mockRejectedValue(new Error('execution failed')),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step1, step2, step3]);

      expect(step2.compensate).toHaveBeenCalled();
      expect(step1.compensate).toHaveBeenCalled();
    });

    it('should log compensation failure but continue', async () => {
      const compensationError = new Error('compensation failed');
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: async () => { throw compensationError; },
        },
        {
          name: 'step2',
          execute: async () => { throw new Error('fail'); },
          compensate: async () => {},
        },
      ];

      await coordinator.executeSaga(steps);

      expect(logger.error).toHaveBeenCalledWith(
        'Compensation failed for step: step1',
        { error: compensationError }
      );
    });

    it('should compensate all steps even if multiple compensations fail', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn().mockRejectedValue(new Error('comp1 failed')),
      };
      const step2 = {
        name: 'step2',
        execute: jest.fn().mockResolvedValue('result2'),
        compensate: jest.fn().mockRejectedValue(new Error('comp2 failed')),
      };
      const step3 = {
        name: 'step3',
        execute: jest.fn().mockRejectedValue(new Error('exec failed')),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step1, step2, step3]);

      expect(step2.compensate).toHaveBeenCalled();
      expect(step1.compensate).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(3); // 1 for saga + 2 for compensations
    });
  });

  describe('Reset Functionality', () => {
    it('should reset executed steps', async () => {
      const step = {
        name: 'step',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step]);
      coordinator.reset();

      const step2 = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('fail')),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step2]);

      expect(step.compensate).not.toHaveBeenCalled();
    });

    it('should allow reuse after reset', async () => {
      const steps1: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: async () => {},
        },
      ];

      const result1 = await coordinator.executeSaga(steps1);
      expect(result1.success).toBe(true);

      coordinator.reset();

      const steps2: SagaStep[] = [
        {
          name: 'step2',
          execute: async () => 'result2',
          compensate: async () => {},
        },
      ];

      const result2 = await coordinator.executeSaga(steps2);
      expect(result2.success).toBe(true);
      expect(result2.results).toEqual(['result2']);
    });

    it('should not affect executed steps in reset saga', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step1]);
      coordinator.reset();

      const step2 = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('fail')),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step2]);

      expect(step1.compensate).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty steps array', async () => {
      const result = await coordinator.executeSaga([]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.compensated).toBe(false);
    });

    it('should handle async delay in execution', async () => {
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'result1';
          },
          compensate: async () => {},
        },
        {
          name: 'step2',
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'result2';
          },
          compensate: async () => {},
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(true);
      expect(result.results).toEqual(['result1', 'result2']);
    });

    it('should handle async delay in compensation', async () => {
      const compensated: string[] = [];
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result1',
          compensate: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            compensated.push('comp1');
          },
        },
        {
          name: 'step2',
          execute: async () => { throw new Error('fail'); },
          compensate: async () => {},
        },
      ];

      await coordinator.executeSaga(steps);

      expect(compensated).toEqual(['comp1']);
    });

    it('should handle steps with null results', async () => {
      const steps: SagaStep[] = [
        {
          name: 'step',
          execute: async () => null,
          compensate: async () => {},
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.results).toEqual([null]);
    });

    it('should handle steps throwing non-Error objects', async () => {
      const steps: SagaStep[] = [
        {
          name: 'step1',
          execute: async () => 'result',
          compensate: async () => {},
        },
        {
          name: 'step2',
          execute: async () => { throw 'string error'; },
          compensate: async () => {},
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('should handle large number of steps', async () => {
      const steps: SagaStep[] = Array(100).fill(null).map((_, i) => ({
        name: `step${i}`,
        execute: async () => `result${i}`,
        compensate: async () => {},
      }));

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(100);
    });
  });

  describe('Multiple Saga Executions', () => {
    it('should handle multiple successful sagas sequentially', async () => {
      const saga1Steps: SagaStep[] = [
        {
          name: 'saga1-step1',
          execute: async () => 'result1',
          compensate: async () => {},
        },
      ];

      const saga2Steps: SagaStep[] = [
        {
          name: 'saga2-step1',
          execute: async () => 'result2',
          compensate: async () => {},
        },
      ];

      const result1 = await coordinator.executeSaga(saga1Steps);
      const result2 = await coordinator.executeSaga(saga2Steps);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should not mix steps from different saga executions', async () => {
      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step1]);

      const step2 = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('fail')),
        compensate: jest.fn(),
      };

      await coordinator.executeSaga([step2]);

      expect(step1.compensate).toHaveBeenCalled();
    });

    it('should maintain separate execution history per saga', async () => {
      const coordinator1 = new SagaCoordinator();
      const coordinator2 = new SagaCoordinator();

      const step1 = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result1'),
        compensate: jest.fn(),
      };

      const step2 = {
        name: 'step2',
        execute: jest.fn().mockRejectedValue(new Error('fail')),
        compensate: jest.fn(),
      };

      await coordinator1.executeSaga([step1]);
      await coordinator2.executeSaga([step2]);

      expect(step1.compensate).not.toHaveBeenCalled();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle real-world order saga scenario', async () => {
      const orderData = { orderId: '123', amount: 100 };
      const inventoryReserved = { reservationId: 'res-456' };
      const paymentCharged = { transactionId: 'txn-789' };

      const steps: SagaStep[] = [
        {
          name: 'reserve-inventory',
          execute: async () => {
            return inventoryReserved;
          },
          compensate: async (result) => {
            expect(result).toEqual(inventoryReserved);
          },
        },
        {
          name: 'charge-payment',
          execute: async () => {
            return paymentCharged;
          },
          compensate: async (result) => {
            expect(result).toEqual(paymentCharged);
          },
        },
        {
          name: 'create-order',
          execute: async () => {
            return orderData;
          },
          compensate: async (result) => {
            expect(result).toEqual(orderData);
          },
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
    });

    it('should handle partial order saga with failure', async () => {
      const inventoryReleased = jest.fn();
      const paymentRefunded = jest.fn();

      const steps: SagaStep[] = [
        {
          name: 'reserve-inventory',
          execute: async () => ({ reserved: true }),
          compensate: inventoryReleased,
        },
        {
          name: 'charge-payment',
          execute: async () => ({ charged: true }),
          compensate: paymentRefunded,
        },
        {
          name: 'send-confirmation',
          execute: async () => { throw new Error('Email service down'); },
          compensate: async () => {},
        },
      ];

      const result = await coordinator.executeSaga(steps);

      expect(result.success).toBe(false);
      expect(paymentRefunded).toHaveBeenCalled();
      expect(inventoryReleased).toHaveBeenCalled();
    });

    it('should handle saga with mixed execution times', async () => {
      const executionOrder: number[] = [];
      const steps: SagaStep[] = [
        {
          name: 'fast',
          execute: async () => { 
            executionOrder.push(1);
            return 'fast'; 
          },
          compensate: async () => { executionOrder.push(-1); },
        },
        {
          name: 'slow',
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            executionOrder.push(2);
            return 'slow';
          },
          compensate: async () => { executionOrder.push(-2); },
        },
        {
          name: 'fail',
          execute: async () => {
            executionOrder.push(3);
            throw new Error('fail');
          },
          compensate: async () => {},
        },
      ];

      await coordinator.executeSaga(steps);

      expect(executionOrder).toEqual([1, 2, 3, -2, -1]);
    });
  });

  describe('Type Safety', () => {
    it('should handle typed saga results', async () => {
      interface StepResult {
        id: string;
        value: number;
      }

      const steps: SagaStep<StepResult>[] = [
        {
          name: 'step1',
          execute: async () => ({ id: 'a', value: 1 }),
          compensate: async () => {},
        },
        {
          name: 'step2',
          execute: async () => ({ id: 'b', value: 2 }),
          compensate: async () => {},
        },
      ];

      const result: SagaResult<StepResult> = await coordinator.executeSaga(steps);

      expect(result.results[0]).toEqual({ id: 'a', value: 1 });
      expect(result.results[1]).toEqual({ id: 'b', value: 2 });
    });
  });
});
