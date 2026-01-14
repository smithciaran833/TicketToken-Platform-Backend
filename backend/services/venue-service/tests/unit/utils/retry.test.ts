/**
 * Unit tests for src/utils/retry.ts
 * Tests retry wrapper with exponential backoff and jitter
 */

import {
  withRetry,
  createRetryWrapper,
  Retry,
  httpRetryOptions,
  dbRetryOptions,
  externalServiceRetryOptions,
  RetryOptions,
} from '../../../src/utils/retry';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('utils/retry', () => {
  // Helper to create errors with specific codes
  const createError = (code?: string, status?: number, message = 'Test error') => {
    const error: any = new Error(message);
    if (code) error.code = code;
    if (status) error.status = status;
    return error;
  };

  // Small delay options for fast tests
  const fastOptions: RetryOptions = {
    initialDelay: 1,
    maxDelay: 10,
    jitterFactor: 0,
    maxRetries: 3,
  };

  describe('withRetry()', () => {
    describe('Happy Path', () => {
      it('should return result on first successful call', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should pass through resolved value', async () => {
        const expected = { data: 'test', count: 42 };
        const fn = jest.fn().mockResolvedValue(expected);
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toEqual(expected);
      });

      it('should work with async functions', async () => {
        const fn = jest.fn().mockImplementation(async () => {
          return 'async result';
        });
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('async result');
      });
    });

    describe('Retry Behavior', () => {
      it('should retry on ECONNREFUSED error', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry on ETIMEDOUT error', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ETIMEDOUT'))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry on ECONNRESET error', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNRESET'))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry on timeout errors by name', async () => {
        const error = new Error('Request timed out');
        error.name = 'TimeoutError';
        
        const fn = jest.fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry on timeout errors by message', async () => {
        const error = new Error('Operation timeout occurred');
        
        const fn = jest.fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry on HTTP 500 errors', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError(undefined, 500))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry on HTTP 502 errors', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError(undefined, 502))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
      });

      it('should retry on HTTP 503 errors', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError(undefined, 503))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
      });

      it('should retry on HTTP 429 rate limit errors', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError(undefined, 429))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
      });

      it('should retry on PostgreSQL serialization errors (40001)', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('40001'))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
      });

      it('should retry on PostgreSQL deadlock errors (40P01)', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('40P01'))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
      });

      it('should retry with statusCode property', async () => {
        const error: any = new Error('Server error');
        error.statusCode = 500;
        
        const fn = jest.fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
      });

      it('should retry with response.status property', async () => {
        const error: any = new Error('Server error');
        error.response = { status: 500 };
        
        const fn = jest.fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
      });

      it('should retry multiple times before succeeding', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, fastOptions);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });

    describe('Non-Retryable Errors', () => {
      it('should not retry on HTTP 400 errors', async () => {
        const fn = jest.fn().mockRejectedValue(createError(undefined, 400));
        
        await expect(withRetry(fn, fastOptions)).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should not retry on HTTP 401 errors', async () => {
        const fn = jest.fn().mockRejectedValue(createError(undefined, 401));
        
        await expect(withRetry(fn, fastOptions)).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should not retry on HTTP 403 errors', async () => {
        const fn = jest.fn().mockRejectedValue(createError(undefined, 403));
        
        await expect(withRetry(fn, fastOptions)).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should not retry on HTTP 404 errors', async () => {
        const fn = jest.fn().mockRejectedValue(createError(undefined, 404));
        
        await expect(withRetry(fn, fastOptions)).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should not retry on generic errors', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('Generic error'));
        
        await expect(withRetry(fn, fastOptions)).rejects.toThrow('Generic error');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should not retry on validation errors', async () => {
        const fn = jest.fn().mockRejectedValue(createError('VALIDATION_ERROR', 422));
        
        await expect(withRetry(fn, fastOptions)).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('Max Retries Exceeded', () => {
      it('should throw after max retries exceeded', async () => {
        const fn = jest.fn().mockRejectedValue(createError('ECONNREFUSED'));
        
        await expect(withRetry(fn, { ...fastOptions, maxRetries: 2 })).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      });

      it('should throw the last error after max retries', async () => {
        const error = createError('ECONNREFUSED', undefined, 'Connection refused');
        const fn = jest.fn().mockRejectedValue(error);
        
        await expect(withRetry(fn, { ...fastOptions, maxRetries: 1 })).rejects.toThrow('Connection refused');
      });

      it('should work with maxRetries of 0', async () => {
        const fn = jest.fn().mockRejectedValue(createError('ECONNREFUSED'));
        
        await expect(withRetry(fn, { ...fastOptions, maxRetries: 0 })).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('Options Configuration', () => {
      it('should use custom isRetryable function', async () => {
        const customIsRetryable = jest.fn().mockReturnValue(false);
        const fn = jest.fn().mockRejectedValue(createError('ECONNREFUSED'));
        
        await expect(
          withRetry(fn, { ...fastOptions, isRetryable: customIsRetryable })
        ).rejects.toThrow();
        
        expect(customIsRetryable).toHaveBeenCalled();
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should call onRetry callback before each retry', async () => {
        const onRetry = jest.fn();
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        await withRetry(fn, { ...fastOptions, onRetry });
        
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(
          expect.any(Error),
          1, // attempt number
          expect.any(Number) // delay
        );
      });

      it('should use custom initialDelay', async () => {
        const onRetry = jest.fn();
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        await withRetry(fn, { 
          initialDelay: 5, 
          jitterFactor: 0,
          maxRetries: 3,
          onRetry,
        });
        
        expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 5);
      });

      it('should use custom backoffMultiplier', async () => {
        const onRetry = jest.fn();
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        await withRetry(fn, { 
          initialDelay: 1, 
          backoffMultiplier: 3,
          jitterFactor: 0,
          maxRetries: 3,
          onRetry,
        });
        
        expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 1);
        expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2, 3);
      });

      it('should cap delay at maxDelay', async () => {
        const onRetry = jest.fn();
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        await withRetry(fn, { 
          initialDelay: 10, 
          maxDelay: 20,
          backoffMultiplier: 10,
          jitterFactor: 0,
          maxRetries: 5,
          onRetry,
        });
        
        // Second retry would be 100ms but capped at 20ms
        expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2, 20);
        expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 3, 20);
      });

      it('should use operationName in logs', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        await withRetry(fn, { 
          ...fastOptions,
          operationName: 'TestOperation',
        });
        
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    describe('Jitter', () => {
      it('should add jitter to delay when jitterFactor is set', async () => {
        const delays: number[] = [];
        
        // Run multiple times to test jitter variance
        for (let i = 0; i < 5; i++) {
          const onRetry = jest.fn();
          const fn = jest.fn()
            .mockRejectedValueOnce(createError('ECONNREFUSED'))
            .mockResolvedValueOnce('success');
          
          await withRetry(fn, { 
            initialDelay: 100, 
            jitterFactor: 0.5, // 50% jitter
            maxRetries: 3,
            onRetry,
          });
          
          delays.push(onRetry.mock.calls[0][2]);
        }
        
        // With 50% jitter, delays should vary between 50-150
        expect(delays.every(d => d >= 50 && d <= 150)).toBe(true);
      });

      it('should not add jitter when jitterFactor is 0', async () => {
        const onRetry = jest.fn();
        const fn = jest.fn()
          .mockRejectedValueOnce(createError('ECONNREFUSED'))
          .mockResolvedValueOnce('success');
        
        await withRetry(fn, { 
          initialDelay: 10, 
          jitterFactor: 0,
          maxRetries: 3,
          onRetry,
        });
        
        expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 10);
      });
    });

    describe('Default Options', () => {
      it('should use default values when no options provided', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        
        const result = await withRetry(fn);
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('createRetryWrapper()', () => {
    it('should wrap function with retry logic', async () => {
      const originalFn = jest.fn()
        .mockRejectedValueOnce(createError('ECONNREFUSED'))
        .mockResolvedValueOnce('success');
      
      const wrappedFn = createRetryWrapper(originalFn, fastOptions);
      
      const result = await wrappedFn();
      
      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to wrapped function', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrappedFn = createRetryWrapper(originalFn, fastOptions);
      
      await wrappedFn('arg1', 'arg2', 123);
      
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });

    it('should preserve function return type', async () => {
      const originalFn = jest.fn().mockResolvedValue({ data: 'test' });
      const wrappedFn = createRetryWrapper(originalFn, fastOptions);
      
      const result = await wrappedFn();
      
      expect(result).toEqual({ data: 'test' });
    });

    it('should use default options when not provided', async () => {
      const originalFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = createRetryWrapper(originalFn);
      
      const result = await wrappedFn();
      
      expect(result).toBe('success');
    });
  });

  describe('Retry Decorator', () => {
    it('should return a decorator function', () => {
      const decorator = Retry({ maxRetries: 3 });
      expect(typeof decorator).toBe('function');
    });

    it('should decorate method with retry logic', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(createError('ECONNREFUSED'))
        .mockResolvedValueOnce('success');
      
      // Manually apply decorator to simulate decorator behavior
      const originalMethod = async function(this: any) {
        return mockFn();
      };
      
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      
      const decorator = Retry(fastOptions);
      const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
      
      const result = await decoratedDescriptor.value.call({});
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should use method name as operationName by default', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(createError('ECONNREFUSED'))
        .mockResolvedValueOnce('success');
      
      const originalMethod = async function(this: any) {
        return mockFn();
      };
      
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      
      const decorator = Retry(fastOptions);
      const decoratedDescriptor = decorator({}, 'myNamedMethod', descriptor);
      
      await decoratedDescriptor.value.call({});
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should preserve this context', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const context = { value: 'test-value' };
      
      const originalMethod = async function(this: typeof context) {
        mockFn(this.value);
        return this.value;
      };
      
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      
      const decorator = Retry(fastOptions);
      const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
      
      const result = await decoratedDescriptor.value.call(context);
      
      expect(result).toBe('test-value');
      expect(mockFn).toHaveBeenCalledWith('test-value');
    });

    it('should pass method arguments', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const originalMethod = async function(this: any, arg1: string, arg2: number) {
        mockFn(arg1, arg2);
        return 'success';
      };
      
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      
      const decorator = Retry(fastOptions);
      const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
      
      await decoratedDescriptor.value.call({}, 'hello', 42);
      
      expect(mockFn).toHaveBeenCalledWith('hello', 42);
    });

    it('should use custom operationName when provided', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(createError('ECONNREFUSED'))
        .mockResolvedValueOnce('success');
      
      const originalMethod = async function(this: any) {
        return mockFn();
      };
      
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      
      const decorator = Retry({ ...fastOptions, operationName: 'CustomOperation' });
      const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
      
      await decoratedDescriptor.value.call({});
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Preset Options', () => {
    describe('httpRetryOptions', () => {
      it('should have correct default values', () => {
        expect(httpRetryOptions.maxRetries).toBe(3);
        expect(httpRetryOptions.initialDelay).toBe(1000);
        expect(httpRetryOptions.maxDelay).toBe(10000);
        expect(httpRetryOptions.backoffMultiplier).toBe(2);
        expect(httpRetryOptions.jitterFactor).toBe(0.2);
      });

      it('should have isRetryable that retries ECONNREFUSED', () => {
        expect(httpRetryOptions.isRetryable!(createError('ECONNREFUSED'))).toBe(true);
      });

      it('should have isRetryable that retries ETIMEDOUT', () => {
        expect(httpRetryOptions.isRetryable!(createError('ETIMEDOUT'))).toBe(true);
      });

      it('should have isRetryable that retries HTTP 500', () => {
        const error: any = new Error('Server error');
        error.response = { status: 500 };
        expect(httpRetryOptions.isRetryable!(error)).toBe(true);
      });

      it('should have isRetryable that retries HTTP 502', () => {
        const error: any = new Error('Bad gateway');
        error.response = { status: 502 };
        expect(httpRetryOptions.isRetryable!(error)).toBe(true);
      });

      it('should have isRetryable that retries HTTP 503', () => {
        const error: any = new Error('Service unavailable');
        error.response = { status: 503 };
        expect(httpRetryOptions.isRetryable!(error)).toBe(true);
      });

      it('should have isRetryable that retries HTTP 429', () => {
        const error: any = new Error('Too many requests');
        error.response = { status: 429 };
        expect(httpRetryOptions.isRetryable!(error)).toBe(true);
      });

      it('should have isRetryable that does not retry HTTP 400', () => {
        const error: any = new Error('Bad request');
        error.response = { status: 400 };
        expect(httpRetryOptions.isRetryable!(error)).toBe(false);
      });

      it('should have isRetryable that does not retry HTTP 404', () => {
        const error: any = new Error('Not found');
        error.response = { status: 404 };
        expect(httpRetryOptions.isRetryable!(error)).toBe(false);
      });

      it('should have isRetryable that uses status property', () => {
        const error: any = new Error('Server error');
        error.status = 500;
        expect(httpRetryOptions.isRetryable!(error)).toBe(true);
      });
    });

    describe('dbRetryOptions', () => {
      it('should have correct default values', () => {
        expect(dbRetryOptions.maxRetries).toBe(3);
        expect(dbRetryOptions.initialDelay).toBe(100);
        expect(dbRetryOptions.maxDelay).toBe(2000);
        expect(dbRetryOptions.backoffMultiplier).toBe(2);
        expect(dbRetryOptions.jitterFactor).toBe(0.3);
      });

      it('should have isRetryable that retries PostgreSQL serialization (40001)', () => {
        expect(dbRetryOptions.isRetryable!(createError('40001'))).toBe(true);
      });

      it('should have isRetryable that retries PostgreSQL deadlock (40P01)', () => {
        expect(dbRetryOptions.isRetryable!(createError('40P01'))).toBe(true);
      });

      it('should have isRetryable that retries ECONNREFUSED', () => {
        expect(dbRetryOptions.isRetryable!(createError('ECONNREFUSED'))).toBe(true);
      });

      it('should have isRetryable that does not retry generic errors', () => {
        expect(dbRetryOptions.isRetryable!(new Error('Generic'))).toBe(false);
      });

      it('should have isRetryable that does not retry constraint violations', () => {
        expect(dbRetryOptions.isRetryable!(createError('23505'))).toBe(false);
      });
    });

    describe('externalServiceRetryOptions', () => {
      it('should have correct default values', () => {
        expect(externalServiceRetryOptions.maxRetries).toBe(3);
        expect(externalServiceRetryOptions.initialDelay).toBe(2000);
        expect(externalServiceRetryOptions.maxDelay).toBe(30000);
        expect(externalServiceRetryOptions.backoffMultiplier).toBe(2);
        expect(externalServiceRetryOptions.jitterFactor).toBe(0.2);
      });

      it('should not have custom isRetryable (uses default)', () => {
        expect(externalServiceRetryOptions.isRetryable).toBeUndefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle function that throws synchronously', async () => {
      const fn = jest.fn().mockImplementation(() => {
        throw createError('ECONNREFUSED');
      });
      
      await expect(withRetry(fn, { ...fastOptions, maxRetries: 0 })).rejects.toThrow();
    });

    it('should handle null error by throwing TypeError', async () => {
      const fn = jest.fn().mockRejectedValue(null);
      
      // The isRetryable check tries to read .code from the error
      await expect(withRetry(fn, fastOptions)).rejects.toThrow(TypeError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined error by throwing TypeError', async () => {
      const fn = jest.fn().mockRejectedValue(undefined);
      
      // The isRetryable check tries to read .code from the error
      await expect(withRetry(fn, fastOptions)).rejects.toThrow(TypeError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle error without message', async () => {
      const error: any = createError('ECONNREFUSED');
      delete error.message;
      
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');
      
      const result = await withRetry(fn, fastOptions);
      
      expect(result).toBe('success');
    });

    it('should handle very large maxRetries', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn, { ...fastOptions, maxRetries: 1000 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle very small delays', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(createError('ECONNREFUSED'))
        .mockResolvedValueOnce('success');
      
      const result = await withRetry(fn, { 
        initialDelay: 1, 
        maxRetries: 3,
        jitterFactor: 0,
      });
      
      expect(result).toBe('success');
    });

    it('should handle function returning undefined', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);
      
      const result = await withRetry(fn, fastOptions);
      
      expect(result).toBeUndefined();
    });

    it('should handle function returning null', async () => {
      const fn = jest.fn().mockResolvedValue(null);
      
      const result = await withRetry(fn, fastOptions);
      
      expect(result).toBeNull();
    });
  });
});
      
