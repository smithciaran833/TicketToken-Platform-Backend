/**
 * Database With Retry Integration Tests
 */

import { retryableQuery, isRetryableDbError } from '../../../src/utils/dbWithRetry';
import { db } from '../setup';

describe('Database With Retry Integration Tests', () => {
  describe('retryableQuery', () => {
    it('should execute successful query without retry', async () => {
      const result = await retryableQuery(
        async () => db.raw('SELECT 1 as value'),
        'test-query'
      );
      
      expect(result.rows[0].value).toBe(1);
    });

    it('should return query result', async () => {
      const result = await retryableQuery(
        async () => db('tenants').select('id').limit(1),
        'select-tenants'
      );
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('isRetryableDbError', () => {
    it('should return true for ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED' };
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for ETIMEDOUT', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for deadlock (40P01)', () => {
      const error = { code: '40P01' };
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return true for serialization failure (40001)', () => {
      const error = { code: '40001' };
      expect(isRetryableDbError(error)).toBe(true);
    });

    it('should return false for unique violation (23505)', () => {
      const error = { code: '23505' };
      expect(isRetryableDbError(error)).toBe(false);
    });

    it('should return false for foreign key violation (23503)', () => {
      const error = { code: '23503' };
      expect(isRetryableDbError(error)).toBe(false);
    });

    it('should return false for unknown errors', () => {
      const error = { code: 'UNKNOWN' };
      expect(isRetryableDbError(error)).toBe(false);
    });
  });
});
