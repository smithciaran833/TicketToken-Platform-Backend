/**
 * Database Circuit Breaker Integration Tests
 */

import { wrapDatabaseWithCircuitBreaker, createDbCircuitBreaker } from '../../../src/utils/dbCircuitBreaker';
import { db } from '../setup';

describe('Database Circuit Breaker Integration Tests', () => {
  describe('wrapDatabaseWithCircuitBreaker', () => {
    it('should wrap database instance', () => {
      // Create a mock db-like object to avoid modifying the real db
      const mockDb = {
        from: jest.fn().mockReturnValue(Promise.resolve([])),
        raw: jest.fn().mockReturnValue(Promise.resolve({ rows: [] })),
        transaction: jest.fn().mockReturnValue(Promise.resolve({}))
      };
      
      const wrapped = wrapDatabaseWithCircuitBreaker(mockDb as any);
      expect(wrapped).toBeDefined();
    });
  });

  describe('createDbCircuitBreaker', () => {
    it('should return the db instance (passthrough)', () => {
      const mockDb = { query: jest.fn() };
      const result = createDbCircuitBreaker(mockDb);
      expect(result).toBe(mockDb);
    });
  });

  describe('Database queries with real connection', () => {
    it('should execute queries through the connection', async () => {
      const result = await db.raw('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });
  });
});
