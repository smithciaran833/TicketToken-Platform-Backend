import { retryableQuery, isRetryableDbError } from '../../../src/utils/dbWithRetry';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/utils/retry', () => ({
  withRetry: jest.fn((fn) => fn()),
}));

describe('DB With Retry Utils', () => {
  // =============================================================================
  // retryableQuery - 3 test cases
  // =============================================================================

  describe('retryableQuery', () => {
    it('should execute query successfully', async () => {
      const queryFn = jest.fn().mockResolvedValue('result');

      const result = await retryableQuery(queryFn, 'test-query');

      expect(result).toBe('result');
      expect(queryFn).toHaveBeenCalled();
    });

    it('should handle query errors', async () => {
      const queryFn = jest.fn().mockRejectedValue(new Error('Query failed'));

      await expect(retryableQuery(queryFn)).rejects.toThrow('Query failed');
    });

    it('should accept custom operation name', async () => {
      const queryFn = jest.fn().mockResolvedValue('data');

      await retryableQuery(queryFn, 'custom-operation');

      expect(queryFn).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // isRetryableDbError - 8 test cases
  // =============================================================================

  describe('isRetryableDbError', () => {
    it('should retry on ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED' };

      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should retry on ETIMEDOUT', () => {
      const error = { code: 'ETIMEDOUT' };

      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should retry on deadlock (40P01)', () => {
      const error = { code: '40P01' };

      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should retry on serialization failure (40001)', () => {
      const error = { code: '40001' };

      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should not retry on unique constraint violation (23505)', () => {
      const error = { code: '23505' };

      expect(isRetryableDbError(error)).toBe(false);
    });

    it('should not retry on foreign key violation (23503)', () => {
      const error = { code: '23503' };

      expect(isRetryableDbError(error)).toBe(false);
    });

    it('should not retry on unknown error codes', () => {
      const error = { code: 'UNKNOWN' };

      expect(isRetryableDbError(error)).toBe(false);
    });

    it('should handle errors without code', () => {
      const error = { message: 'Some error' };

      expect(isRetryableDbError(error)).toBe(false);
    });
  });
});
