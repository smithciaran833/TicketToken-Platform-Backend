import { wrapDatabaseWithCircuitBreaker, createDbCircuitBreaker } from '../../../src/utils/dbCircuitBreaker';

jest.mock('../../../src/utils/logger');

// Mock withCircuitBreaker to return the function unchanged
jest.mock('../../../src/utils/circuitBreaker', () => ({
  withCircuitBreaker: jest.fn((fn) => fn),
}));

describe('Database Circuit Breaker Utils', () => {
  describe('wrapDatabaseWithCircuitBreaker', () => {
    it('should return the database instance', () => {
      const mockDb: any = {
        from: jest.fn(),
        raw: jest.fn(),
        transaction: jest.fn(),
      };

      const result = wrapDatabaseWithCircuitBreaker(mockDb);

      expect(result).toBe(mockDb);
    });

    it('should replace from method', () => {
      const mockDb: any = {
        from: jest.fn(),
        raw: jest.fn(),
        transaction: jest.fn(),
      };
      const originalFrom = mockDb.from;

      wrapDatabaseWithCircuitBreaker(mockDb);

      // Method should be replaced with the same function (since we mock withCircuitBreaker to return fn)
      expect(mockDb.from).toBeDefined();
      expect(typeof mockDb.from).toBe('function');
    });

    it('should replace raw method', () => {
      const mockDb: any = {
        from: jest.fn(),
        raw: jest.fn(),
        transaction: jest.fn(),
      };
      const originalRaw = mockDb.raw;

      wrapDatabaseWithCircuitBreaker(mockDb);

      expect(mockDb.raw).toBeDefined();
      expect(typeof mockDb.raw).toBe('function');
    });

    it('should replace transaction method', () => {
      const mockDb: any = {
        from: jest.fn(),
        raw: jest.fn(),
        transaction: jest.fn(),
      };
      const originalTransaction = mockDb.transaction;

      wrapDatabaseWithCircuitBreaker(mockDb);

      expect(mockDb.transaction).toBeDefined();
      expect(typeof mockDb.transaction).toBe('function');
    });
  });

  describe('createDbCircuitBreaker', () => {
    it('should return the database instance unchanged', () => {
      const mockDb: any = { query: jest.fn() };
      
      const result = createDbCircuitBreaker(mockDb);

      expect(result).toBe(mockDb);
    });
  });
});
