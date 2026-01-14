/**
 * Unit tests for src/utils/circuitBreaker.ts
 * Tests circuit breaker wrapper around opossum
 */

import {
  createCircuitBreaker,
  withCircuitBreaker,
  CircuitBreakerOptions,
} from '../../../src/utils/circuitBreaker';

// Mock the logger
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: (...args: any[]) => mockLoggerWarn(...args),
    info: (...args: any[]) => mockLoggerInfo(...args),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('utils/circuitBreaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCircuitBreaker()', () => {
    describe('Configuration', () => {
      it('should create a circuit breaker instance', () => {
        const fn = jest.fn().mockResolvedValue('result');
        
        const breaker = createCircuitBreaker(fn);
        
        expect(breaker).toBeDefined();
        expect(typeof breaker.fire).toBe('function');
      });

      it('should use default options when none provided', () => {
        const fn = jest.fn().mockResolvedValue('result');
        
        const breaker = createCircuitBreaker(fn) as any;
        
        // Check that breaker was created successfully with defaults
        expect(breaker.options.timeout).toBe(3000);
        expect(breaker.options.errorThresholdPercentage).toBe(50);
        expect(breaker.options.resetTimeout).toBe(30000);
      });

      it('should use custom options when provided', () => {
        const fn = jest.fn().mockResolvedValue('result');
        const options: CircuitBreakerOptions = {
          timeout: 5000,
          errorThresholdPercentage: 75,
          resetTimeout: 60000,
          name: 'custom-breaker',
        };
        
        const breaker = createCircuitBreaker(fn, options) as any;
        
        expect(breaker.options.timeout).toBe(5000);
        expect(breaker.options.errorThresholdPercentage).toBe(75);
        expect(breaker.options.resetTimeout).toBe(60000);
        expect(breaker.options.name).toBe('custom-breaker');
      });

      it('should merge custom options with defaults', () => {
        const fn = jest.fn().mockResolvedValue('result');
        const options: CircuitBreakerOptions = {
          timeout: 5000,
          // Other options should use defaults
        };
        
        const breaker = createCircuitBreaker(fn, options) as any;
        
        expect(breaker.options.timeout).toBe(5000);
        expect(breaker.options.errorThresholdPercentage).toBe(50); // default
        expect(breaker.options.resetTimeout).toBe(30000); // default
      });

      it('should set rolling count options', () => {
        const fn = jest.fn().mockResolvedValue('result');
        const options: CircuitBreakerOptions = {
          rollingCountTimeout: 20000,
          rollingCountBuckets: 20,
        };
        
        const breaker = createCircuitBreaker(fn, options) as any;
        
        expect(breaker.options.rollingCountTimeout).toBe(20000);
        expect(breaker.options.rollingCountBuckets).toBe(20);
      });
    });

    describe('Function Execution', () => {
      it('should call the wrapped function through fire()', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        const breaker = createCircuitBreaker(fn);
        
        const result = await breaker.fire();
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should pass arguments to the wrapped function', async () => {
        const fn = jest.fn().mockResolvedValue('result');
        const breaker = createCircuitBreaker(fn);
        
        await breaker.fire('arg1', 'arg2', 123);
        
        expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 123);
      });

      it('should return the function result', async () => {
        const expected = { data: 'test', count: 42 };
        const fn = jest.fn().mockResolvedValue(expected);
        const breaker = createCircuitBreaker(fn);
        
        const result = await breaker.fire();
        
        expect(result).toEqual(expected);
      });

      it('should propagate errors from the wrapped function', async () => {
        const error = new Error('Function failed');
        const fn = jest.fn().mockRejectedValue(error);
        const breaker = createCircuitBreaker(fn);
        
        await expect(breaker.fire()).rejects.toThrow('Function failed');
      });

      it('should work with sync functions', async () => {
        const fn = jest.fn().mockReturnValue('sync result');
        const breaker = createCircuitBreaker(fn);
        
        const result = await breaker.fire();
        
        expect(result).toBe('sync result');
      });
    });

    describe('Event Logging', () => {
      it('should log when circuit opens', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fail'));
        const breaker = createCircuitBreaker(fn, { 
          name: 'test-breaker',
          errorThresholdPercentage: 1,
          rollingCountTimeout: 1000,
          rollingCountBuckets: 1,
        });
        
        // Trigger multiple failures to open the circuit
        try { await breaker.fire(); } catch {}
        try { await breaker.fire(); } catch {}
        try { await breaker.fire(); } catch {}
        
        // Wait a bit for the circuit to open
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(mockLoggerWarn).toHaveBeenCalledWith(
          expect.stringContaining('Circuit breaker opened')
        );
      });

      it('should include breaker name in log when named', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fail'));
        const breaker = createCircuitBreaker(fn, { 
          name: 'my-named-breaker',
          errorThresholdPercentage: 1,
          rollingCountTimeout: 1000,
          rollingCountBuckets: 1,
        });
        
        // Trigger failures to open circuit
        try { await breaker.fire(); } catch {}
        try { await breaker.fire(); } catch {}
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check that the name appears in logs
        const warnCalls = mockLoggerWarn.mock.calls.flat();
        const hasName = warnCalls.some((call: string) => call.includes('my-named-breaker'));
        expect(hasName).toBe(true);
      });

      it('should use "unnamed" in log when no name provided', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fail'));
        const breaker = createCircuitBreaker(fn, { 
          // no name provided
          errorThresholdPercentage: 1,
          rollingCountTimeout: 1000,
          rollingCountBuckets: 1,
        });
        
        // Trigger failures
        try { await breaker.fire(); } catch {}
        try { await breaker.fire(); } catch {}
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const warnCalls = mockLoggerWarn.mock.calls.flat();
        const hasUnnamed = warnCalls.some((call: string) => call.includes('unnamed'));
        expect(hasUnnamed).toBe(true);
      });
    });

    describe('Circuit States', () => {
      it('should start in closed state', () => {
        const fn = jest.fn().mockResolvedValue('result');
        const breaker = createCircuitBreaker(fn);
        
        expect(breaker.closed).toBe(true);
        expect(breaker.opened).toBe(false);
      });

      it('should allow calls when closed', async () => {
        const fn = jest.fn().mockResolvedValue('result');
        const breaker = createCircuitBreaker(fn);
        
        const result = await breaker.fire();
        
        expect(result).toBe('result');
      });

      it('should track successful and failed calls', async () => {
        const fn = jest.fn()
          .mockResolvedValueOnce('success')
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValueOnce('success');
        
        const breaker = createCircuitBreaker(fn);
        
        await breaker.fire();
        try { await breaker.fire(); } catch {}
        await breaker.fire();
        
        // The breaker should have stats
        const stats = breaker.stats;
        expect(stats).toBeDefined();
      });
    });
  });

  describe('withCircuitBreaker()', () => {
    describe('Function Wrapping', () => {
      it('should return a function', () => {
        const fn = jest.fn().mockResolvedValue('result');
        
        const wrapped = withCircuitBreaker(fn);
        
        expect(typeof wrapped).toBe('function');
      });

      it('should call the original function when invoked', async () => {
        const fn = jest.fn().mockResolvedValue('result');
        const wrapped = withCircuitBreaker(fn);
        
        const result = await wrapped();
        
        expect(result).toBe('result');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should pass arguments to the original function', async () => {
        const fn = jest.fn().mockResolvedValue('result');
        const wrapped = withCircuitBreaker(fn);
        
        await wrapped('arg1', 'arg2', 123);
        
        expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 123);
      });

      it('should return the result from the original function', async () => {
        const expected = { success: true, data: [1, 2, 3] };
        const fn = jest.fn().mockResolvedValue(expected);
        const wrapped = withCircuitBreaker(fn);
        
        const result = await wrapped();
        
        expect(result).toEqual(expected);
      });

      it('should propagate errors from the original function', async () => {
        const error = new Error('Original function failed');
        const fn = jest.fn().mockRejectedValue(error);
        const wrapped = withCircuitBreaker(fn);
        
        await expect(wrapped()).rejects.toThrow('Original function failed');
      });
    });

    describe('Configuration', () => {
      it('should use default options when none provided', async () => {
        const fn = jest.fn().mockResolvedValue('result');
        const wrapped = withCircuitBreaker(fn);
        
        const result = await wrapped();
        
        expect(result).toBe('result');
      });

      it('should accept custom options', async () => {
        const fn = jest.fn().mockResolvedValue('result');
        const options: CircuitBreakerOptions = {
          timeout: 5000,
          errorThresholdPercentage: 75,
          name: 'custom-wrapped',
        };
        
        const wrapped = withCircuitBreaker(fn, options);
        const result = await wrapped();
        
        expect(result).toBe('result');
      });
    });

    describe('Multiple Calls', () => {
      it('should handle multiple sequential calls', async () => {
        const fn = jest.fn().mockResolvedValue('result');
        const wrapped = withCircuitBreaker(fn);
        
        await wrapped();
        await wrapped();
        await wrapped();
        
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should handle concurrent calls', async () => {
        const fn = jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve('result'), 10))
        );
        const wrapped = withCircuitBreaker(fn);
        
        const results = await Promise.all([
          wrapped(),
          wrapped(),
          wrapped(),
        ]);
        
        expect(results).toEqual(['result', 'result', 'result']);
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });

    describe('Type Preservation', () => {
      it('should preserve function return type', async () => {
        interface UserData {
          id: number;
          name: string;
        }
        
        const fn = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });
        const wrapped = withCircuitBreaker(fn);
        
        const result = await wrapped();
        
        expect(result.id).toBe(1);
        expect(result.name).toBe('Test');
      });

      it('should work with functions that have typed parameters', async () => {
        const fn = jest.fn().mockImplementation((id: number, name: string) => 
          Promise.resolve({ id, name })
        );
        
        const wrapped = withCircuitBreaker(fn);
        const result = await wrapped(42, 'test');
        
        expect(result).toEqual({ id: 42, name: 'test' });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle function that returns undefined', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);
      const breaker = createCircuitBreaker(fn);
      
      const result = await breaker.fire();
      
      expect(result).toBeUndefined();
    });

    it('should handle function that returns null', async () => {
      const fn = jest.fn().mockResolvedValue(null);
      const breaker = createCircuitBreaker(fn);
      
      const result = await breaker.fire();
      
      expect(result).toBeNull();
    });

    it('should handle function that throws synchronously', async () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });
      const breaker = createCircuitBreaker(fn);
      
      await expect(breaker.fire()).rejects.toThrow('Sync error');
    });

    it('should handle function that returns a rejected promise', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Rejected'));
      const breaker = createCircuitBreaker(fn);
      
      await expect(breaker.fire()).rejects.toThrow('Rejected');
    });

    it('should handle empty options object', () => {
      const fn = jest.fn().mockResolvedValue('result');
      
      const breaker = createCircuitBreaker(fn, {});
      
      expect(breaker).toBeDefined();
    });

    it('should handle function with no arguments', async () => {
      const fn = jest.fn().mockResolvedValue('no args result');
      const wrapped = withCircuitBreaker(fn);
      
      const result = await wrapped();
      
      expect(result).toBe('no args result');
      expect(fn).toHaveBeenCalledWith();
    });

    it('should handle function with many arguments', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const wrapped = withCircuitBreaker(fn);
      
      await wrapped('a', 'b', 'c', 'd', 'e', 1, 2, 3, 4, 5);
      
      expect(fn).toHaveBeenCalledWith('a', 'b', 'c', 'd', 'e', 1, 2, 3, 4, 5);
    });
  });

  describe('Default Options Constants', () => {
    it('should have default timeout of 3000ms', () => {
      const fn = jest.fn();
      const breaker = createCircuitBreaker(fn) as any;
      
      expect(breaker.options.timeout).toBe(3000);
    });

    it('should have default error threshold of 50%', () => {
      const fn = jest.fn();
      const breaker = createCircuitBreaker(fn) as any;
      
      expect(breaker.options.errorThresholdPercentage).toBe(50);
    });

    it('should have default reset timeout of 30000ms', () => {
      const fn = jest.fn();
      const breaker = createCircuitBreaker(fn) as any;
      
      expect(breaker.options.resetTimeout).toBe(30000);
    });

    it('should have default rolling count timeout of 10000ms', () => {
      const fn = jest.fn();
      const breaker = createCircuitBreaker(fn) as any;
      
      expect(breaker.options.rollingCountTimeout).toBe(10000);
    });

    it('should have default rolling count buckets of 10', () => {
      const fn = jest.fn();
      const breaker = createCircuitBreaker(fn) as any;
      
      expect(breaker.options.rollingCountBuckets).toBe(10);
    });
  });
});
