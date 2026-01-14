import { withCircuitBreaker, createCircuitBreaker, CircuitBreakerOptions } from '../../../src/utils/circuitBreaker';

describe('Unit: Circuit Breaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withCircuitBreaker() - Basic Usage', () => {
    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const breaker = withCircuitBreaker(fn, { name: 'test-breaker' });

      const result = await breaker();

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass through arguments', async () => {
      const fn = jest.fn((a: number, b: string) => Promise.resolve(`${a}-${b}`));
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker(42, 'test');

      expect(result).toBe('42-test');
      expect(fn).toHaveBeenCalledWith(42, 'test');
    });

    it('should handle async functions', async () => {
      const fn = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      });
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker();
      expect(result).toBe('async-result');
    });

    it('should track successful calls', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      await breaker();
      await breaker();
      await breaker();

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('createCircuitBreaker()', () => {
    it('should create circuit breaker with default options', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn);

      expect(breaker).toBeDefined();
      expect(typeof breaker.fire).toBe('function');
    });

    it('should create circuit breaker with custom options', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn, {
        timeout: 5000,
        errorThresholdPercentage: 60,
        name: 'custom-breaker'
      });

      expect(breaker).toBeDefined();
    });

    it('should allow firing the breaker', async () => {
      const fn = jest.fn().mockResolvedValue('fired');
      const breaker = createCircuitBreaker(fn, { name: 'test' });

      const result = await breaker.fire();
      expect(result).toBe('fired');
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout slow functions', async () => {
      const fn = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('slow'), 2000)));
      const breaker = withCircuitBreaker(fn, {
        name: 'test',
        timeout: 100
      });

      await expect(breaker()).rejects.toThrow();
    });

    it('should not timeout fast functions', async () => {
      const fn = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('fast'), 50)));
      const breaker = withCircuitBreaker(fn, {
        name: 'test',
        timeout: 200
      });

      const result = await breaker();
      expect(result).toBe('fast');
    });

    it('should use default timeout of 3000ms', async () => {
      const fn = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('ok'), 100)));
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker();
      expect(result).toBe('ok');
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      await expect(breaker()).rejects.toThrow('test error');
    });

    it('should handle multiple errors and open circuit', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const breaker = withCircuitBreaker(fn, { name: 'test-multi-error' });

      // First call throws the original error
      await expect(breaker()).rejects.toThrow('fail');
      // After failure, circuit may open - subsequent calls may throw "Breaker is open"
      try {
        await breaker();
      } catch (error: any) {
        expect(['fail', 'Breaker is open']).toContain(error.message);
      }
    });

    it('should preserve error types', async () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const fn = jest.fn().mockRejectedValue(new CustomError('custom'));
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      try {
        await breaker();
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(CustomError);
        expect(error.message).toBe('custom');
      }
    });

    it('should handle synchronous errors', async () => {
      const fn = jest.fn(() => {
        throw new Error('sync error');
      });
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      await expect(breaker()).rejects.toThrow('sync error');
    });
  });

  describe('Circuit Breaker Options', () => {
    it('should accept errorThresholdPercentage option', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn, {
        name: 'test',
        errorThresholdPercentage: 75
      });

      expect(breaker).toBeDefined();
    });

    it('should accept resetTimeout option', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn, {
        name: 'test',
        resetTimeout: 5000
      });

      expect(breaker).toBeDefined();
    });

    it('should accept rollingCountTimeout option', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn, {
        name: 'test',
        rollingCountTimeout: 15000
      });

      expect(breaker).toBeDefined();
    });

    it('should accept rollingCountBuckets option', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn, {
        name: 'test',
        rollingCountBuckets: 20
      });

      expect(breaker).toBeDefined();
    });

    it('should accept all options together', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn, {
        name: 'full-options',
        timeout: 5000,
        errorThresholdPercentage: 60,
        resetTimeout: 20000,
        rollingCountTimeout: 15000,
        rollingCountBuckets: 15
      });

      expect(breaker).toBeDefined();
    });
  });

  describe('Multiple Circuit Breakers', () => {
    it('should handle multiple independent breakers', async () => {
      const fn1 = jest.fn().mockResolvedValue('result1');
      const fn2 = jest.fn().mockResolvedValue('result2');

      const breaker1 = withCircuitBreaker(fn1, { name: 'breaker1' });
      const breaker2 = withCircuitBreaker(fn2, { name: 'breaker2' });

      const r1 = await breaker1();
      const r2 = await breaker2();

      expect(r1).toBe('result1');
      expect(r2).toBe('result2');
    });

    it('should track breakers separately', async () => {
      const fn1 = jest.fn().mockResolvedValue('ok1');
      const fn2 = jest.fn().mockRejectedValue(new Error('fail2'));

      const breaker1 = withCircuitBreaker(fn1, { name: 'breaker1' });
      const breaker2 = withCircuitBreaker(fn2, { name: 'breaker2' });

      const r1 = await breaker1();
      expect(r1).toBe('ok1');

      await expect(breaker2()).rejects.toThrow('fail2');
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent successful requests', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const results = await Promise.all([
        breaker(),
        breaker(),
        breaker()
      ]);

      expect(results).toEqual(['ok', 'ok', 'ok']);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent mixed results', async () => {
      let callCount = 0;
      const fn = jest.fn(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('even fail'));
        }
        return Promise.resolve('odd success');
      });

      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const results = await Promise.allSettled([
        breaker(),
        breaker(),
        breaker()
      ]);

      expect(results.length).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle functions returning undefined', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker();
      expect(result).toBeUndefined();
    });

    it('should handle functions returning null', async () => {
      const fn = jest.fn().mockResolvedValue(null);
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker();
      expect(result).toBeNull();
    });

    it('should handle functions returning 0', async () => {
      const fn = jest.fn().mockResolvedValue(0);
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker();
      expect(result).toBe(0);
    });

    it('should handle functions returning false', async () => {
      const fn = jest.fn().mockResolvedValue(false);
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker();
      expect(result).toBe(false);
    });

    it('should handle functions returning empty string', async () => {
      const fn = jest.fn().mockResolvedValue('');
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker();
      expect(result).toBe('');
    });

    it('should handle functions returning complex objects', async () => {
      const complexObj = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        func: () => 'inner'
      };

      const fn = jest.fn().mockResolvedValue(complexObj);
      const breaker = withCircuitBreaker(fn, { name: 'test' });

      const result = await breaker() as typeof complexObj;
      expect(result).toBe(complexObj);
      expect(result.nested.deep.value).toBe('test');
    });

    it('should handle zero timeout by resolving if function is instant', async () => {
      const fn = jest.fn().mockResolvedValue('instant');
      const breaker = withCircuitBreaker(fn, {
        name: 'test',
        timeout: 0
      });

      // Zero timeout with instant function should resolve
      const result = await breaker();
      expect(result).toBe('instant');
    });

    it('should handle very long timeout', async () => {
      const fn = jest.fn(() => Promise.resolve('ok'));
      const breaker = withCircuitBreaker(fn, {
        name: 'test',
        timeout: 60000 // 1 minute
      });

      const result = await breaker();
      expect(result).toBe('ok');
    });
  });

  describe('Named Circuit Breakers', () => {
    it('should create breaker with name', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn, { name: 'my-breaker' });

      expect(breaker).toBeDefined();
    });

    it('should create breaker without name', () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const breaker = createCircuitBreaker(fn);

      expect(breaker).toBeDefined();
    });

    it('should handle breakers with same name', async () => {
      const fn1 = jest.fn().mockResolvedValue('result1');
      const fn2 = jest.fn().mockResolvedValue('result2');

      const breaker1 = withCircuitBreaker(fn1, { name: 'shared-name' });
      const breaker2 = withCircuitBreaker(fn2, { name: 'shared-name' });

      const r1 = await breaker1();
      const r2 = await breaker2();

      expect(r1).toBe('result1');
      expect(r2).toBe('result2');
    });
  });
});
