import { withRetry, RetryOptions } from '../../../src/utils/retry';

describe('Unit: Retry Utility', () => {
  describe('withRetry()', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));
      
      await expect(withRetry(fn, { maxAttempts: 3, initialDelay: 10 }))
        .rejects.toThrow('always fails');
      
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await withRetry(fn, { maxAttempts: 3, initialDelay: 100 });
      const duration = Date.now() - start;
      
      // Should wait at least 100ms + 200ms = 300ms (exponential backoff)
      expect(duration).toBeGreaterThanOrEqual(250);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect custom maxAttempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      
      await expect(withRetry(fn, { maxAttempts: 5, initialDelay: 1 }))
        .rejects.toThrow('fail');
      
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should use default maxAttempts of 3', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      
      await expect(withRetry(fn, { initialDelay: 1 }))
        .rejects.toThrow('fail');
      
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect custom initialDelay', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await withRetry(fn, { maxAttempts: 2, initialDelay: 200 });
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(180);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use default initialDelay of 100ms', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await withRetry(fn, { maxAttempts: 2 });
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(80);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should work with async functions', async () => {
      const fn = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async result';
      });
      
      const result = await withRetry(fn);
      
      expect(result).toBe('async result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should work with functions returning promises', async () => {
      const fn = jest.fn(() => Promise.resolve('promise result'));
      
      const result = await withRetry(fn);
      
      expect(result).toBe('promise result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass through function arguments', async () => {
      const fn = jest.fn((a: number, b: string) => Promise.resolve(`${a}-${b}`));
      
      const result = await withRetry(() => fn(42, 'test'));
      
      expect(result).toBe('42-test');
      expect(fn).toHaveBeenCalledWith(42, 'test');
    });

    it('should preserve error types', async () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      
      const fn = jest.fn().mockRejectedValue(new CustomError('custom fail'));
      
      try {
        await withRetry(fn, { maxAttempts: 2, initialDelay: 1 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(CustomError);
        expect(error.message).toBe('custom fail');
      }
    });

    it('should retry different error types', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new TypeError('type error'))
        .mockRejectedValueOnce(new RangeError('range error'))
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 1 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should handle synchronous errors', async () => {
      const fn = jest.fn(() => {
        throw new Error('sync error');
      });
      
      await expect(withRetry(fn, { maxAttempts: 2, initialDelay: 1 }))
        .rejects.toThrow('sync error');
      
      expect(fn).toHaveBeenCalledTimes(2);
    });

   

 it('should handle functions with no return value', async () => {
      let callCount = 0;
      const fn = jest.fn(async () => {
        callCount++;
        if (callCount < 2) throw new Error('fail');
      });
      
      await withRetry(fn, { maxAttempts: 3, initialDelay: 1 });
      
      expect(fn).toHaveBeenCalledTimes(2);
      expect(callCount).toBe(2);
    });

    it('should retry with increasing delays (exponential backoff)', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'))
        .mockResolvedValue('success');
      
      const delays: number[] = [];
      const start = Date.now();
      
      await withRetry(fn, { maxAttempts: 4, initialDelay: 50 });
      
      // Delay progression should be: 50ms, 100ms, 200ms
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should handle maxAttempts of 1', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxAttempts: 1 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should fail immediately with maxAttempts of 1', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      
      await expect(withRetry(fn, { maxAttempts: 1, initialDelay: 1 }))
        .rejects.toThrow('fail');
      
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle very short delays', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxAttempts: 2, initialDelay: 1 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle zero delay', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxAttempts: 2, initialDelay: 0 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should work with large maxAttempts', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxAttempts: 100, initialDelay: 1 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should maintain context when retrying', async () => {
      const obj = {
        value: 'test',
        callCount: 0,
        async method() {
          this.callCount++;
          if (this.callCount < 2) throw new Error('fail');
          return this.value;
        }
      };
      
      const result = await withRetry(() => obj.method(), { maxAttempts: 3, initialDelay: 1 });
      
      expect(result).toBe('test');
      expect(obj.callCount).toBe(2);
    });

    it('should handle concurrent retry calls', async () => {
      const fn1 = jest.fn().mockResolvedValue('result1');
      const fn2 = jest.fn().mockResolvedValue('result2');
      const fn3 = jest.fn().mockResolvedValue('result3');
      
      const [r1, r2, r3] = await Promise.all([
        withRetry(fn1),
        withRetry(fn2),
        withRetry(fn3)
      ]);
      
      expect(r1).toBe('result1');
      expect(r2).toBe('result2');
      expect(r3).toBe('result3');
    });

    it('should not interfere with other concurrent retries', async () => {
      const fn1 = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success1');
      
      const fn2 = jest.fn().mockResolvedValue('success2');
      
      const [r1, r2] = await Promise.all([
        withRetry(fn1, { maxAttempts: 2, initialDelay: 10 }),
        withRetry(fn2, { maxAttempts: 2, initialDelay: 10 })
      ]);
      
      expect(r1).toBe('success1');
      expect(r2).toBe('success2');
      expect(fn1).toHaveBeenCalledTimes(2);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle functions that return undefined', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);
      
      const result = await withRetry(fn);
      
      expect(result).toBeUndefined();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return null', async () => {
      const fn = jest.fn().mockResolvedValue(null);
      
      const result = await withRetry(fn);
      
      expect(result).toBeNull();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return 0', async () => {
      const fn = jest.fn().mockResolvedValue(0);
      
      const result = await withRetry(fn);
      
      expect(result).toBe(0);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return false', async () => {
      const fn = jest.fn().mockResolvedValue(false);
      
      const result = await withRetry(fn);
      
      expect(result).toBe(false);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return empty string', async () => {
      const fn = jest.fn().mockResolvedValue('');
      
      const result = await withRetry(fn);
      
      expect(result).toBe('');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return complex objects', async () => {
      const complexObj = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        func: () => 'inner'
      };
      
      const fn = jest.fn().mockResolvedValue(complexObj);
      
      const result = await withRetry(fn) as typeof complexObj;
      
      expect(result).toBe(complexObj);
      expect(result.nested.deep.value).toBe('test');
    });
  });

  describe('Performance', () => {
    it('should complete quickly with no retries', async () => {
      const fn = jest.fn().mockResolvedValue('fast');
      
      const start = Date.now();
      await withRetry(fn, { initialDelay: 1000 }); // High delay shouldn't matter
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
    });

    it('should accumulate delay time correctly', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await withRetry(fn, { maxAttempts: 3, initialDelay: 50 });
      const duration = Date.now() - start;
      
      // Should take at least 50ms + 100ms = 150ms
      expect(duration).toBeGreaterThanOrEqual(130);
    });
  });
});
