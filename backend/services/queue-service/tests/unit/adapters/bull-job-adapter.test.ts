import { BullJobData, createBullJobAdapter } from '../../../src/adapters/bull-job-adapter';

describe('BullJobAdapter', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createBullJobAdapter', () => {
    it('should create adapter with full pg-boss job data', () => {
      const pgBossJob = {
        id: 'job-123',
        name: 'payment-process',
        data: {
          amount: 5000,
          userId: 'user-456',
        },
      };

      const adapter = createBullJobAdapter(pgBossJob);

      expect(adapter.id).toBe('job-123');
      expect(adapter.name).toBe('payment-process');
      expect(adapter.data).toEqual({ amount: 5000, userId: 'user-456' });
      expect(adapter.queue).toEqual({ name: 'payment-process' });
      expect(adapter.opts).toEqual({});
      expect(adapter.attemptsMade).toBe(0);
    });

    it('should use job data as data when data property is missing', () => {
      const pgBossJob = {
        id: 'job-456',
        name: 'email-send',
        to: 'test@example.com',
        subject: 'Hello',
      };

      const adapter = createBullJobAdapter(pgBossJob);

      expect(adapter.data).toEqual(pgBossJob);
    });

    it('should use null for missing id', () => {
      const pgBossJob = {
        name: 'test-job',
        data: { key: 'value' },
      };

      const adapter = createBullJobAdapter(pgBossJob);

      expect(adapter.id).toBeNull();
    });

    it('should use "unknown" for missing name', () => {
      const pgBossJob = {
        id: 'job-789',
        data: { foo: 'bar' },
      };

      const adapter = createBullJobAdapter(pgBossJob);

      expect(adapter.name).toBe('unknown');
      expect(adapter.queue).toEqual({ name: 'unknown' });
    });

    it('should handle empty pg-boss job object', () => {
      const pgBossJob = {};

      const adapter = createBullJobAdapter(pgBossJob);

      expect(adapter.id).toBeNull();
      expect(adapter.name).toBe('unknown');
      expect(adapter.data).toEqual({});
      expect(adapter.queue).toEqual({ name: 'unknown' });
    });

    it('should handle primitive data value', () => {
      const pgBossJob = {
        id: 'job-001',
        name: 'simple',
        data: 'just a string',
      };

      const adapter = createBullJobAdapter(pgBossJob);

      expect(adapter.data).toBe('just a string');
    });

    it('should handle array data value', () => {
      const pgBossJob = {
        id: 'job-002',
        name: 'batch',
        data: [1, 2, 3, 4, 5],
      };

      const adapter = createBullJobAdapter(pgBossJob);

      expect(adapter.data).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle null data value', () => {
      const pgBossJob = {
        id: 'job-003',
        name: 'empty',
        data: null,
      };

      const adapter = createBullJobAdapter(pgBossJob);

      // null || pgBossJob returns pgBossJob
      expect(adapter.data).toEqual(pgBossJob);
    });

    describe('progress function', () => {
      it('should have a progress function', () => {
        const adapter = createBullJobAdapter({ id: 'job-1', name: 'test' });

        expect(adapter.progress).toBeDefined();
        expect(typeof adapter.progress).toBe('function');
      });

      it('should resolve without error when called with number', async () => {
        const adapter = createBullJobAdapter({ id: 'job-1', name: 'test' });

        await expect(adapter.progress!(50)).resolves.toBeUndefined();
      });

      it('should resolve without error when called with object', async () => {
        const adapter = createBullJobAdapter({ id: 'job-1', name: 'test' });

        await expect(
          adapter.progress!({ step: 2, total: 5, message: 'Processing...' })
        ).resolves.toBeUndefined();
      });

      it('should handle 0% progress', async () => {
        const adapter = createBullJobAdapter({ id: 'job-1', name: 'test' });

        await expect(adapter.progress!(0)).resolves.toBeUndefined();
      });

      it('should handle 100% progress', async () => {
        const adapter = createBullJobAdapter({ id: 'job-1', name: 'test' });

        await expect(adapter.progress!(100)).resolves.toBeUndefined();
      });
    });

    describe('log function', () => {
      it('should have a log function', () => {
        const adapter = createBullJobAdapter({ id: 'job-1', name: 'test' });

        expect(adapter.log).toBeDefined();
        expect(typeof adapter.log).toBe('function');
      });

      it('should log message with job id', () => {
        const adapter = createBullJobAdapter({ id: 'job-123', name: 'test' });

        adapter.log!('Processing started');

        expect(consoleSpy).toHaveBeenCalledWith('[Job job-123] Processing started');
      });

      it('should log with "unknown" when job id is missing', () => {
        const adapter = createBullJobAdapter({ name: 'test' });

        adapter.log!('Some message');

        expect(consoleSpy).toHaveBeenCalledWith('[Job unknown] Some message');
      });

      it('should handle empty message', () => {
        const adapter = createBullJobAdapter({ id: 'job-456', name: 'test' });

        adapter.log!('');

        expect(consoleSpy).toHaveBeenCalledWith('[Job job-456] ');
      });

      it('should handle message with special characters', () => {
        const adapter = createBullJobAdapter({ id: 'job-789', name: 'test' });

        adapter.log!('Error: Something failed! @#$%^&*()');

        expect(consoleSpy).toHaveBeenCalledWith(
          '[Job job-789] Error: Something failed! @#$%^&*()'
        );
      });
    });

    describe('type safety', () => {
      it('should support generic type for data', () => {
        interface PaymentData {
          amount: number;
          currency: string;
        }

        const pgBossJob = {
          id: 'job-typed',
          name: 'payment',
          data: { amount: 1000, currency: 'USD' },
        };

        const adapter = createBullJobAdapter<PaymentData>(pgBossJob);

        expect(adapter.data.amount).toBe(1000);
        expect(adapter.data.currency).toBe('USD');
      });

      it('should work with any type when generic not specified', () => {
        const adapter = createBullJobAdapter({
          id: 'job-any',
          name: 'flexible',
          data: { anything: 'goes', nested: { deep: true } },
        });

        expect(adapter.data.anything).toBe('goes');
        expect(adapter.data.nested.deep).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle numeric job id', () => {
        const pgBossJob = {
          id: 12345,
          name: 'numeric-id',
          data: {},
        };

        const adapter = createBullJobAdapter(pgBossJob);

        expect(adapter.id).toBe(12345);
      });

      it('should handle very long job name', () => {
        const longName = 'a'.repeat(500);
        const pgBossJob = {
          id: 'job-long',
          name: longName,
          data: {},
        };

        const adapter = createBullJobAdapter(pgBossJob);

        expect(adapter.name).toBe(longName);
        expect(adapter.queue?.name).toBe(longName);
      });

      it('should handle deeply nested data', () => {
        const deepData = {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep',
                },
              },
            },
          },
        };

        const adapter = createBullJobAdapter({
          id: 'deep-job',
          name: 'nested',
          data: deepData,
        });

        expect(adapter.data.level1.level2.level3.level4.value).toBe('deep');
      });
    });
  });
});
