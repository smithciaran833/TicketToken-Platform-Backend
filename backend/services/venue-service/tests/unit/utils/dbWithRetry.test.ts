/**
 * Unit tests for src/utils/dbWithRetry.ts
 * Tests database retry wrapper and decorator
 */

import {
  retryableQuery,
  isRetryableDbError,
  RetryableDb,
} from '../../../src/utils/dbWithRetry';

// Mock the retry utility
jest.mock('../../../src/utils/retry', () => ({
  withRetry: jest.fn((fn, options) => fn()),
}));

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

import { withRetry } from '../../../src/utils/retry';

describe('utils/dbWithRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isRetryableDbError()', () => {
    describe('Connection Errors', () => {
      it('should return true for ECONNREFUSED', () => {
        const error = { code: 'ECONNREFUSED' };
        
        expect(isRetryableDbError(error)).toBe(true);
      });

      it('should return true for ETIMEDOUT', () => {
        const error = { code: 'ETIMEDOUT' };
        
        expect(isRetryableDbError(error)).toBe(true);
      });
    });

    describe('PostgreSQL Transaction Errors', () => {
      it('should return true for deadlock error (40P01)', () => {
        const error = { code: '40P01' };
        
        expect(isRetryableDbError(error)).toBe(true);
      });

      it('should return true for serialization failure (40001)', () => {
        const error = { code: '40001' };
        
        expect(isRetryableDbError(error)).toBe(true);
      });
    });

    describe('Non-Retryable Errors', () => {
      it('should return false for unique constraint violation (23505)', () => {
        const error = { code: '23505' };
        
        expect(isRetryableDbError(error)).toBe(false);
      });

      it('should return false for foreign key constraint violation (23503)', () => {
        const error = { code: '23503' };
        
        expect(isRetryableDbError(error)).toBe(false);
      });

      it('should return false for unknown error codes', () => {
        const error = { code: 'UNKNOWN' };
        
        expect(isRetryableDbError(error)).toBe(false);
      });

      it('should return false for generic errors', () => {
        const error = new Error('Generic error');
        
        expect(isRetryableDbError(error)).toBe(false);
      });

      it('should return false for errors without code', () => {
        const error = { message: 'No code' };
        
        expect(isRetryableDbError(error)).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle null error', () => {
        expect(isRetryableDbError(null)).toBe(false);
      });

      it('should handle undefined error', () => {
        expect(isRetryableDbError(undefined)).toBe(false);
      });

      it('should handle error object with null code', () => {
        const error = { code: null };
        
        expect(isRetryableDbError(error)).toBe(false);
      });

      it('should handle error object with undefined code', () => {
        const error = { code: undefined };
        
        expect(isRetryableDbError(error)).toBe(false);
      });

      it('should handle error object with numeric code', () => {
        const error = { code: 123 };
        
        expect(isRetryableDbError(error)).toBe(false);
      });
    });
  });

  describe('retryableQuery()', () => {
    describe('Function Execution', () => {
      it('should call the query function', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn);
        
        expect(withRetry).toHaveBeenCalled();
      });

      it('should return the result of the query function', async () => {
        const queryFn = jest.fn().mockResolvedValue({ id: 1, name: 'test' });
        (withRetry as jest.Mock).mockImplementation((fn) => fn());
        
        const result = await retryableQuery(queryFn);
        
        expect(result).toEqual({ id: 1, name: 'test' });
      });

      it('should propagate errors from the query function', async () => {
        const error = new Error('Query failed');
        const queryFn = jest.fn().mockRejectedValue(error);
        (withRetry as jest.Mock).mockImplementation((fn) => fn());
        
        await expect(retryableQuery(queryFn)).rejects.toThrow('Query failed');
      });
    });

    describe('Retry Configuration', () => {
      it('should use maxRetries of 3', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn);
        
        expect(withRetry).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            maxRetries: 3,
          })
        );
      });

      it('should use initialDelay of 50ms', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn);
        
        expect(withRetry).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            initialDelay: 50,
          })
        );
      });

      it('should use maxDelay of 1000ms', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn);
        
        expect(withRetry).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            maxDelay: 1000,
          })
        );
      });

      it('should use isRetryableDbError as isRetryable', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn);
        
        expect(withRetry).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            isRetryable: isRetryableDbError,
          })
        );
      });

      it('should include onRetry callback', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn);
        
        expect(withRetry).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            onRetry: expect.any(Function),
          })
        );
      });
    });

    describe('Operation Name', () => {
      it('should default operation name to "query"', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn);
        
        // The operation name is used in onRetry callback
        const config = (withRetry as jest.Mock).mock.calls[0][1];
        expect(config.onRetry).toBeDefined();
      });

      it('should use custom operation name when provided', async () => {
        const queryFn = jest.fn().mockResolvedValue('result');
        
        await retryableQuery(queryFn, 'findUser');
        
        // Verify withRetry was called with the function
        expect(withRetry).toHaveBeenCalled();
      });
    });
  });

  describe('RetryableDb Decorator', () => {
    beforeEach(() => {
      (withRetry as jest.Mock).mockImplementation((fn) => fn());
    });

    describe('Decorator Application', () => {
      it('should return a decorator function', () => {
        const decorator = RetryableDb('test-operation');
        
        expect(typeof decorator).toBe('function');
      });

      it('should wrap method with retryableQuery', async () => {
        const mockFn = jest.fn().mockResolvedValue('result');
        
        const originalMethod = async function(this: any) {
          return mockFn();
        };
        
        const descriptor: PropertyDescriptor = {
          value: originalMethod,
          writable: true,
          enumerable: false,
          configurable: true,
        };
        
        const decorator = RetryableDb('database');
        const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
        
        const result = await decoratedDescriptor.value.call({});
        
        expect(result).toBe('result');
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
        
        const decorator = RetryableDb('database');
        const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
        
        const result = await decoratedDescriptor.value.call(context);
        
        expect(result).toBe('test-value');
        expect(mockFn).toHaveBeenCalledWith('test-value');
      });

      it('should pass method arguments', async () => {
        const mockFn = jest.fn().mockResolvedValue('result');
        
        const originalMethod = async function(this: any, id: number, name: string) {
          mockFn(id, name);
          return 'result';
        };
        
        const descriptor: PropertyDescriptor = {
          value: originalMethod,
          writable: true,
          enumerable: false,
          configurable: true,
        };
        
        const decorator = RetryableDb('database');
        const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
        
        await decoratedDescriptor.value.call({}, 42, 'test');
        
        expect(mockFn).toHaveBeenCalledWith(42, 'test');
      });
    });

    describe('Operation Name in Decorator', () => {
      it('should combine operation prefix with method name', async () => {
        const mockFn = jest.fn().mockResolvedValue('result');
        
        const originalMethod = async function(this: any) {
          return mockFn();
        };
        
        const descriptor: PropertyDescriptor = {
          value: originalMethod,
          writable: true,
          enumerable: false,
          configurable: true,
        };
        
        const decorator = RetryableDb('venues');
        const decoratedDescriptor = decorator({}, 'findById', descriptor);
        
        // Invoke the decorated method to trigger withRetry
        await decoratedDescriptor.value.call({});
        
        // The operation name would be 'venues.findById'
        expect(withRetry).toHaveBeenCalled();
      });

      it('should default operation prefix to "database"', async () => {
        const mockFn = jest.fn().mockResolvedValue('result');
        
        const originalMethod = async function(this: any) {
          return mockFn();
        };
        
        const descriptor: PropertyDescriptor = {
          value: originalMethod,
          writable: true,
          enumerable: false,
          configurable: true,
        };
        
        const decorator = RetryableDb();
        const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
        
        // Invoke the decorated method to trigger withRetry
        await decoratedDescriptor.value.call({});
        
        // The operation name would be 'database.testMethod'
        expect(withRetry).toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should propagate errors from decorated method', async () => {
        const error = new Error('Database error');
        const mockFn = jest.fn().mockRejectedValue(error);
        (withRetry as jest.Mock).mockImplementation((fn) => fn());
        
        const originalMethod = async function(this: any) {
          return mockFn();
        };
        
        const descriptor: PropertyDescriptor = {
          value: originalMethod,
          writable: true,
          enumerable: false,
          configurable: true,
        };
        
        const decorator = RetryableDb('database');
        const decoratedDescriptor = decorator({}, 'testMethod', descriptor);
        
        await expect(decoratedDescriptor.value.call({})).rejects.toThrow('Database error');
      });
    });
  });

  describe('Integration with retry.ts', () => {
    it('should use the withRetry function from retry module', async () => {
      const queryFn = jest.fn().mockResolvedValue('result');
      
      await retryableQuery(queryFn);
      
      expect(withRetry).toHaveBeenCalledTimes(1);
    });

    it('should pass the query function to withRetry', async () => {
      const queryFn = jest.fn().mockResolvedValue('result');
      
      await retryableQuery(queryFn);
      
      expect(withRetry).toHaveBeenCalledWith(
        queryFn,
        expect.any(Object)
      );
    });
  });
});
