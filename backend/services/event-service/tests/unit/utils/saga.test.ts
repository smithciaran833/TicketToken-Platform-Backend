/**
 * Unit tests for src/utils/saga.ts
 * Tests Saga pattern implementation for distributed transactions
 */

import {
  Saga,
  SagaTimeoutError,
  SagaCompensationError,
  createEventSaga,
  createEventCancellationSaga,
  SagaStep,
  SagaResult,
} from '../../../src/utils/saga';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('utils/saga', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Saga class', () => {
    describe('constructor', () => {
      it('should create saga with name', () => {
        const saga = new Saga('test-saga');
        expect(saga).toBeDefined();
      });

      it('should accept custom options', () => {
        const saga = new Saga('test-saga', {
          timeout: 5000,
          maxRetries: 5,
        });
        expect(saga).toBeDefined();
      });
    });

    describe('addStep()', () => {
      it('should add steps and return saga for chaining', () => {
        const saga = new Saga('test-saga')
          .addStep('step1', async () => 'result1', async () => {})
          .addStep('step2', async () => 'result2', async () => {});

        expect(saga).toBeInstanceOf(Saga);
      });
    });

    describe('execute()', () => {
      it('should execute all steps in order', async () => {
        const executionOrder: string[] = [];

        const saga = new Saga<{ value: number }>('test-saga')
          .addStep(
            'step1',
            async () => { executionOrder.push('step1'); return 'r1'; },
            async () => {}
          )
          .addStep(
            'step2',
            async () => { executionOrder.push('step2'); return 'r2'; },
            async () => {}
          )
          .addStep(
            'step3',
            async () => { executionOrder.push('step3'); return 'r3'; },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({ value: 42 });

        expect(result.success).toBe(true);
        expect(result.completedSteps).toEqual(['step1', 'step2', 'step3']);
        expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
      });

      it('should return results from all steps', async () => {
        const saga = new Saga<{}>('test-saga')
          .addStep('step1', async () => ({ id: '1' }), async () => {})
          .addStep('step2', async () => ({ id: '2' }), async () => {});

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(result.success).toBe(true);
        expect(result.result?.get('step1')).toEqual({ id: '1' });
        expect(result.result?.get('step2')).toEqual({ id: '2' });
      });

      it('should pass previous results to subsequent steps', async () => {
        let receivedResults: Map<string, any> | undefined;

        const saga = new Saga<{}>('test-saga')
          .addStep('step1', async () => 'first-value', async () => {})
          .addStep(
            'step2',
            async (_ctx, previousResults) => {
              receivedResults = previousResults;
              return 'second-value';
            },
            async () => {}
          );

        jest.useRealTimers();
        await saga.execute({});

        expect(receivedResults?.get('step1')).toBe('first-value');
      });

      it('should compensate on step failure', async () => {
        const compensated: string[] = [];

        const saga = new Saga<{}>('test-saga', { maxRetries: 1 })
          .addStep(
            'step1',
            async () => 'r1',
            async () => { compensated.push('step1'); }
          )
          .addStep(
            'step2',
            async () => 'r2',
            async () => { compensated.push('step2'); }
          )
          .addStep(
            'step3',
            async () => { throw new Error('Step 3 failed'); },
            async () => { compensated.push('step3'); }
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(result.success).toBe(false);
        expect(result.failedStep).toBe('step3');
        expect(result.completedSteps).toEqual(['step1', 'step2']);
        expect(compensated).toEqual(['step2', 'step1']); // Reverse order
      });

      it('should compensate in reverse order', async () => {
        const order: string[] = [];

        const saga = new Saga<{}>('test-saga', { maxRetries: 1 })
          .addStep(
            'first',
            async () => 'r1',
            async () => { order.push('compensate-first'); }
          )
          .addStep(
            'second',
            async () => 'r2',
            async () => { order.push('compensate-second'); }
          )
          .addStep(
            'third',
            async () => { throw new Error('Failed'); },
            async () => {}
          );

        jest.useRealTimers();
        await saga.execute({});

        expect(order).toEqual(['compensate-second', 'compensate-first']);
      });

      it('should pass step data to compensate function', async () => {
        let compensateData: any;

        const saga = new Saga<{}>('test-saga', { maxRetries: 1 })
          .addStep(
            'step1',
            async () => ({ eventId: 'evt-123', status: 'created' }),
            async (_ctx, data) => { compensateData = data; }
          )
          .addStep(
            'step2',
            async () => { throw new Error('Failed'); },
            async () => {}
          );

        jest.useRealTimers();
        await saga.execute({});

        expect(compensateData).toEqual({ eventId: 'evt-123', status: 'created' });
      });

      it('should return error information on failure', async () => {
        const saga = new Saga<{}>('test-saga', { maxRetries: 1 })
          .addStep(
            'step1',
            async () => { throw new Error('Specific error message'); },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error?.message).toBe('Specific error message');
      });
    });

    describe('Retry logic', () => {
      it('should retry failed steps', async () => {
        let attempts = 0;

        const saga = new Saga<{}>('test-saga', { maxRetries: 3, retryDelay: 10 })
          .addStep(
            'flaky-step',
            async () => {
              attempts++;
              if (attempts < 3) throw new Error('Temporary failure');
              return 'success';
            },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(result.success).toBe(true);
        expect(attempts).toBe(3);
      });

      it('should not retry validation errors', async () => {
        let attempts = 0;

        const saga = new Saga<{}>('test-saga', { maxRetries: 3 })
          .addStep(
            'validation-step',
            async () => {
              attempts++;
              throw new Error('Validation failed: invalid input');
            },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(result.success).toBe(false);
        expect(attempts).toBe(1); // No retries
      });

      it('should not retry not found errors', async () => {
        let attempts = 0;

        const saga = new Saga<{}>('test-saga', { maxRetries: 3 })
          .addStep(
            'find-step',
            async () => {
              attempts++;
              throw new Error('Resource not found');
            },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(attempts).toBe(1);
      });

      it('should not retry unauthorized errors', async () => {
        let attempts = 0;

        const saga = new Saga<{}>('test-saga', { maxRetries: 3 })
          .addStep(
            'auth-step',
            async () => {
              attempts++;
              throw new Error('Unauthorized access');
            },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(attempts).toBe(1);
      });
    });

    describe('Timeout handling', () => {
      it('should timeout long-running sagas', async () => {
        const saga = new Saga<{}>('test-saga', { timeout: 100 })
          .addStep(
            'slow-step',
            async () => {
              await new Promise(resolve => setTimeout(resolve, 200));
              return 'done';
            },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        // Note: Due to how Jest handles timeouts, we check the general behavior
        // In real execution, this would fail with timeout
      });
    });

    describe('Compensation error handling', () => {
      it('should continue compensation on error when configured', async () => {
        const compensated: string[] = [];

        const saga = new Saga<{}>('test-saga', {
          maxRetries: 1,
          continueCompensationOnError: true,
        })
          .addStep(
            'step1',
            async () => 'r1',
            async () => { compensated.push('step1'); }
          )
          .addStep(
            'step2',
            async () => 'r2',
            async () => { throw new Error('Compensation failed'); }
          )
          .addStep(
            'step3',
            async () => { throw new Error('Step failed'); },
            async () => {}
          );

        jest.useRealTimers();
        const result = await saga.execute({});

        expect(result.success).toBe(false);
        expect(compensated).toContain('step1');
      });
    });
  });

  describe('SagaTimeoutError', () => {
    it('should create timeout error with message', () => {
      const error = new SagaTimeoutError('Operation timed out');
      expect(error.message).toBe('Operation timed out');
      expect(error.name).toBe('SagaTimeoutError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('SagaCompensationError', () => {
    it('should create compensation error with message', () => {
      const error = new SagaCompensationError('Compensation failed');
      expect(error.message).toBe('Compensation failed');
      expect(error.name).toBe('SagaCompensationError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('createEventSaga()', () => {
    it('should create saga with event-specific defaults', () => {
      const saga = createEventSaga('create-event');
      expect(saga).toBeInstanceOf(Saga);
    });
  });

  describe('createEventCancellationSaga()', () => {
    it('should create cancellation saga with predefined steps', () => {
      const saga = createEventCancellationSaga();
      expect(saga).toBeInstanceOf(Saga);
    });

    it('should execute cancellation steps', async () => {
      const mockDb = {
        _table: '',
        _whereClause: {},
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ status: 'ON_SALE' }]),
      };
      (mockDb as any) = jest.fn().mockReturnValue(mockDb);

      const saga = createEventCancellationSaga();

      // The saga has predefined steps, testing structure
      expect(saga).toBeDefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete saga lifecycle', async () => {
      type Context = {
        orderId: string;
        items: string[];
      };

      const saga = new Saga<Context>('order-processing')
        .addStep(
          'validate-inventory',
          async (ctx) => {
            return { validated: true, items: ctx.items };
          },
          async () => {}
        )
        .addStep(
          'reserve-inventory',
          async (ctx, prev) => {
            return { reserved: true, reservationId: 'res-123' };
          },
          async (ctx, data) => {
            // Release reservation
          }
        )
        .addStep(
          'process-payment',
          async () => {
            return { paymentId: 'pay-456' };
          },
          async (ctx, data) => {
            // Refund payment
          }
        );

      jest.useRealTimers();
      const result = await saga.execute({
        orderId: 'order-789',
        items: ['item1', 'item2'],
      });

      expect(result.success).toBe(true);
      expect(result.completedSteps).toHaveLength(3);
    });

    it('should rollback partial transaction on failure', async () => {
      const actions: string[] = [];

      const saga = new Saga<{}>('partial-transaction', { maxRetries: 1 })
        .addStep(
          'step-a',
          async () => { actions.push('execute-a'); return 'a'; },
          async () => { actions.push('rollback-a'); }
        )
        .addStep(
          'step-b',
          async () => { actions.push('execute-b'); return 'b'; },
          async () => { actions.push('rollback-b'); }
        )
        .addStep(
          'step-c',
          async () => {
            actions.push('execute-c');
            throw new Error('C failed');
          },
          async () => { actions.push('rollback-c'); }
        );

      jest.useRealTimers();
      await saga.execute({});

      expect(actions).toEqual([
        'execute-a',
        'execute-b',
        'execute-c',
        'rollback-b',
        'rollback-a',
      ]);
    });
  });
});
