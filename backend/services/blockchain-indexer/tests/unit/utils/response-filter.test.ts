/**
 * Comprehensive Unit Tests for src/utils/response-filter.ts
 *
 * Tests response filtering, field sanitization, and data protection
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

import {
  filterResponse,
  createEntityFilter,
  filterTransaction,
  filterWalletActivity,
  filterMarketplaceEvent,
  filterDiscrepancy,
  filterSyncStatus,
  paginateResponse,
  selectFields,
  selectFieldsArray,
} from '../../../src/utils/response-filter';

describe('src/utils/response-filter.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // FILTER RESPONSE - BASIC FILTERING
  // =============================================================================

  describe('filterResponse() - Basic Filtering', () => {
    it('should remove globally blocked fields', () => {
      const data = {
        id: '123',
        name: 'Test',
        password: 'secret123',
        apiKey: 'key123',
      };

      const result = filterResponse(data);

      expect(result).toEqual({
        id: '123',
        name: 'Test',
      });
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('apiKey');
    });

    it('should redact sensitive fields', () => {
      const data = {
        id: '123',
        name: 'John Doe',
        ssn: '123-45-6789',
        creditCard: '4111111111111111',
      };

      const result = filterResponse(data);

      expect(result).toEqual({
        id: '123',
        name: 'John Doe',
        ssn: '[REDACTED]',
        creditCard: '[REDACTED]',
      });
    });

    it('should handle null and undefined data', () => {
      expect(filterResponse(null)).toBeNull();
      expect(filterResponse(undefined)).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(filterResponse('string')).toBe('string');
      expect(filterResponse(123)).toBe(123);
      expect(filterResponse(true)).toBe(true);
    });

    it('should filter arrays', () => {
      const data = [
        { id: '1', name: 'User1', password: 'secret1' },
        { id: '2', name: 'User2', password: 'secret2' },
      ];

      const result = filterResponse(data);

      expect(result).toEqual([
        { id: '1', name: 'User1' },
        { id: '2', name: 'User2' },
      ]);
    });

    it('should handle empty arrays', () => {
      const result = filterResponse([]);
      expect(result).toEqual([]);
    });

    it('should handle empty objects', () => {
      const result = filterResponse({});
      expect(result).toEqual({});
    });
  });

  // =============================================================================
  // FILTER RESPONSE - NESTED OBJECTS
  // =============================================================================

  describe('filterResponse() - Nested Objects', () => {
    it('should filter nested objects by default', () => {
      const data = {
        id: '123',
        user: {
          name: 'John',
          password: 'secret',
          profile: {
            age: 30,
            ssn: '123-45-6789',
          },
        },
      };

      const result = filterResponse(data);

      expect(result).toEqual({
        id: '123',
        user: {
          name: 'John',
          profile: {
            age: 30,
            ssn: '[REDACTED]',
          },
        },
      });
    });

    it('should not filter nested objects when deep is false', () => {
      const data = {
        id: '123',
        user: {
          name: 'John',
          password: 'secret',
        },
      };

      const result = filterResponse(data, { deep: false });

      expect(result).toEqual({
        id: '123',
        user: {
          name: 'John',
          password: 'secret',
        },
      });
    });

    it('should respect maxDepth option', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  password: 'secret',
                },
              },
            },
          },
        },
      };

      const result = filterResponse(data, { maxDepth: 2 });

      // Should not filter beyond maxDepth
      expect(result.level1.level2.level3.level4.level5.password).toBe('secret');
    });

    it('should filter arrays within objects', () => {
      const data = {
        users: [
          { id: '1', name: 'User1', password: 'secret1' },
          { id: '2', name: 'User2', password: 'secret2' },
        ],
      };

      const result = filterResponse(data);

      expect(result).toEqual({
        users: [
          { id: '1', name: 'User1' },
          { id: '2', name: 'User2' },
        ],
      });
    });

    it('should preserve Date objects', () => {
      const date = new Date('2024-01-01');
      const data = {
        id: '123',
        createdAt: date,
      };

      const result = filterResponse(data);

      expect(result.createdAt).toBe(date);
      expect(result.createdAt instanceof Date).toBe(true);
    });
  });

  // =============================================================================
  // FILTER RESPONSE - OPTIONS
  // =============================================================================

  describe('filterResponse() - Options', () => {
    it('should block additional fields', () => {
      const data = {
        id: '123',
        name: 'Test',
        customField: 'value',
      };

      const result = filterResponse(data, {
        additionalBlockedFields: ['customField'],
      });

      expect(result).toEqual({
        id: '123',
        name: 'Test',
      });
    });

    it('should nullify blocked fields when nullifyBlocked is true', () => {
      const data = {
        id: '123',
        name: 'Test',
        password: 'secret',
      };

      const result = filterResponse(data, { nullifyBlocked: true });

      expect(result).toEqual({
        id: '123',
        name: 'Test',
        password: null,
      });
    });

    it('should allow additional fields', () => {
      const data = {
        id: '123',
        signature: 'sig123',
        customField: 'value',
      };

      const result = filterResponse(data, {
        entityType: 'transaction',
        additionalAllowedFields: ['customField'],
      });

      expect(result).toHaveProperty('customField');
    });

    it('should use entity whitelist when provided', () => {
      const data = {
        id: '123',
        signature: 'sig123',
        slot: 100,
        notAllowedField: 'value',
      };

      const result = filterResponse(data, { entityType: 'transaction' });

      expect(result).toEqual({
        id: '123',
        signature: 'sig123',
        slot: 100,
      });
      expect(result).not.toHaveProperty('notAllowedField');
    });
  });

  // =============================================================================
  // CREATE ENTITY FILTER
  // =============================================================================

  describe('createEntityFilter()', () => {
    it('should create a filter function for entity type', () => {
      const filter = createEntityFilter('transaction');
      expect(typeof filter).toBe('function');
    });

    it('should filter data using entity whitelist', () => {
      const filter = createEntityFilter('transaction');
      const data = {
        id: '123',
        signature: 'sig123',
        notAllowed: 'value',
      };

      const result = filter(data);

      expect(result).toEqual({
        id: '123',
        signature: 'sig123',
      });
    });

    it('should accept additional options', () => {
      const filter = createEntityFilter('transaction', {
        additionalAllowedFields: ['customField'],
      });

      const data = {
        id: '123',
        signature: 'sig123',
        customField: 'value',
      };

      const result = filter(data);

      expect(result).toHaveProperty('customField');
    });
  });

  // =============================================================================
  // PRE-BUILT ENTITY FILTERS
  // =============================================================================

  describe('Pre-built Entity Filters', () => {
    describe('filterTransaction()', () => {
      it('should filter transaction data', () => {
        const data = {
          id: '123',
          signature: 'sig123',
          slot: 100,
          block_time: 1234567890,
          instruction_type: 'transfer',
          notAllowed: 'value',
        };

        const result = filterTransaction(data);

        expect(result).toEqual({
          id: '123',
          signature: 'sig123',
          slot: 100,
          block_time: 1234567890,
          instruction_type: 'transfer',
        });
      });
    });

    describe('filterWalletActivity()', () => {
      it('should filter wallet activity data', () => {
        const data = {
          id: '123',
          walletAddress: 'addr123',
          activityType: 'transfer',
          amount: 100,
          notAllowed: 'value',
        };

        const result = filterWalletActivity(data);

        expect(result).toEqual({
          id: '123',
          walletAddress: 'addr123',
          activityType: 'transfer',
          amount: 100,
        });
      });
    });

    describe('filterMarketplaceEvent()', () => {
      it('should filter marketplace event data', () => {
        const data = {
          id: '123',
          marketplace: 'opensea',
          eventType: 'sale',
          price: 1000,
          seller: 'seller123',
          buyer: 'buyer123',
          notAllowed: 'value',
        };

        const result = filterMarketplaceEvent(data);

        expect(result).toEqual({
          id: '123',
          marketplace: 'opensea',
          eventType: 'sale',
          price: 1000,
          seller: 'seller123',
          buyer: 'buyer123',
        });
      });
    });

    describe('filterDiscrepancy()', () => {
      it('should filter discrepancy data', () => {
        const data = {
          id: '123',
          assetId: 'asset123',
          discrepancyType: 'ownership_mismatch',
          onChainOwner: 'owner1',
          databaseOwner: 'owner2',
          resolved: false,
          notAllowed: 'value',
        };

        const result = filterDiscrepancy(data);

        expect(result).toEqual({
          id: '123',
          assetId: 'asset123',
          discrepancyType: 'ownership_mismatch',
          onChainOwner: 'owner1',
          databaseOwner: 'owner2',
          resolved: false,
        });
      });
    });

    describe('filterSyncStatus()', () => {
      it('should filter sync status data', () => {
        const data = {
          lastProcessedSlot: 12345,
          lastProcessedSignature: 'sig123',
          indexerVersion: '1.0.0',
          isRunning: true,
          notAllowed: 'value',
        };

        const result = filterSyncStatus(data);

        expect(result).toEqual({
          lastProcessedSlot: 12345,
          lastProcessedSignature: 'sig123',
          indexerVersion: '1.0.0',
          isRunning: true,
        });
      });
    });
  });

  // =============================================================================
  // PAGINATE RESPONSE
  // =============================================================================

  describe('paginateResponse()', () => {
    it('should wrap data in pagination format', () => {
      const data = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const result = paginateResponse(data, 10, 3, 0);

      expect(result).toEqual({
        data: [{ id: '1' }, { id: '2' }, { id: '3' }],
        pagination: {
          total: 10,
          limit: 3,
          offset: 0,
          hasMore: true,
        },
      });
    });

    it('should set hasMore to false when at end', () => {
      const data = [{ id: '8' }, { id: '9' }, { id: '10' }];
      const result = paginateResponse(data, 10, 3, 7);

      expect(result.pagination.hasMore).toBe(false);
    });

    it('should handle empty data', () => {
      const result = paginateResponse([], 0, 10, 0);

      expect(result).toEqual({
        data: [],
        pagination: {
          total: 0,
          limit: 10,
          offset: 0,
          hasMore: false,
        },
      });
    });

    it('should calculate hasMore correctly for various offsets', () => {
      // Offset 0, has more
      let result = paginateResponse([1, 2], 10, 2, 0);
      expect(result.pagination.hasMore).toBe(true);

      // Offset 5, has more
      result = paginateResponse([6, 7], 10, 2, 5);
      expect(result.pagination.hasMore).toBe(true);

      // Offset 8, no more
      result = paginateResponse([9, 10], 10, 2, 8);
      expect(result.pagination.hasMore).toBe(false);

      // Exactly at end
      result = paginateResponse([10], 10, 1, 9);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  // =============================================================================
  // SELECT FIELDS
  // =============================================================================

  describe('selectFields()', () => {
    it('should select specified fields from object', () => {
      const obj = {
        id: '123',
        name: 'Test',
        email: 'test@example.com',
        password: 'secret',
      };

      const result = selectFields(obj, ['id', 'name', 'email']);

      expect(result).toEqual({
        id: '123',
        name: 'Test',
        email: 'test@example.com',
      });
      expect(result).not.toHaveProperty('password');
    });

    it('should handle non-existent fields gracefully', () => {
      const obj = {
        id: '123',
        name: 'Test',
      };

      const result = selectFields(obj, ['id', 'name', 'nonExistent' as any]);

      expect(result).toEqual({
        id: '123',
        name: 'Test',
      });
    });

    it('should return empty object for empty field list', () => {
      const obj = {
        id: '123',
        name: 'Test',
      };

      const result = selectFields(obj, []);

      expect(result).toEqual({});
    });

    it('should handle empty object', () => {
      const result = selectFields({} as any, ['id', 'name']);
      expect(result).toEqual({});
    });
  });

  // =============================================================================
  // SELECT FIELDS ARRAY
  // =============================================================================

  describe('selectFieldsArray()', () => {
    it('should select fields from array of objects', () => {
      const arr = [
        { id: '1', name: 'User1', email: 'user1@example.com', password: 'secret1' },
        { id: '2', name: 'User2', email: 'user2@example.com', password: 'secret2' },
      ];

      const result = selectFieldsArray(arr, ['id', 'name']);

      expect(result).toEqual([
        { id: '1', name: 'User1' },
        { id: '2', name: 'User2' },
      ]);
    });

    it('should handle empty array', () => {
      const result = selectFieldsArray([], ['id', 'name']);
      expect(result).toEqual([]);
    });

    it('should handle array with mixed data', () => {
      const arr = [
        { id: '1', name: 'User1' },
        { id: '2', email: 'user2@example.com' },
      ];

      const result = selectFieldsArray(arr, ['id', 'name']);

      expect(result).toEqual([
        { id: '1', name: 'User1' },
        { id: '2' },
      ]);
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should filter complex nested transaction data', () => {
      const data = {
        id: '123',
        signature: 'sig123',
        slot: 100,
        block_time: 1234567890,
        instruction_type: 'transfer',
        fullData: {
          accounts: ['acc1', 'acc2'],
          logs: ['log1', 'log2'],
        },
        metadata: {
          apiKey: 'secret-key', // Should be blocked
          timestamp: '2024-01-01',
        },
        notAllowed: 'value',
      };

      const result = filterTransaction(data);

      expect(result).toEqual({
        id: '123',
        signature: 'sig123',
        slot: 100,
        block_time: 1234567890,
        instruction_type: 'transfer',
        fullData: {
          accounts: ['acc1', 'acc2'],
          logs: ['log1', 'log2'],
        },
      });
    });

    it('should paginate and filter data together', () => {
      const rawData = [
        { id: '1', signature: 'sig1', password: 'secret1', notAllowed: 'val1' },
        { id: '2', signature: 'sig2', password: 'secret2', notAllowed: 'val2' },
      ];

      const filtered = filterTransaction(rawData);
      const paginated = paginateResponse(filtered, 10, 2, 0);

      expect(paginated.data).toEqual([
        { id: '1', signature: 'sig1' },
        { id: '2', signature: 'sig2' },
      ]);
      expect(paginated.pagination.total).toBe(10);
    });

    it('should handle multiple filtering operations', () => {
      const data = {
        id: '123',
        name: 'Test',
        password: 'secret',
        ssn: '123-45-6789',
        customBlocked: 'value',
      };

      const result = filterResponse(data, {
        additionalBlockedFields: ['customBlocked'],
        nullifyBlocked: true,
      });

      expect(result).toEqual({
        id: '123',
        name: 'Test',
        password: null,
        ssn: '[REDACTED]',
        customBlocked: null,
      });
    });

    it('should preserve array order during filtering', () => {
      const data = [
        { id: '3', name: 'Third', password: 'secret3' },
        { id: '1', name: 'First', password: 'secret1' },
        { id: '2', name: 'Second', password: 'secret2' },
      ];

      const result = filterResponse(data);

      expect(result[0].id).toBe('3');
      expect(result[1].id).toBe('1');
      expect(result[2].id).toBe('2');
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle circular references gracefully', () => {
      const data: any = { id: '123', name: 'Test' };
      data.self = data;

      // This would cause infinite recursion without maxDepth
      const result = filterResponse(data, { maxDepth: 1 });

      expect(result.id).toBe('123');
      expect(result.name).toBe('Test');
    });

    it('should handle objects with null prototype', () => {
      const obj = Object.create(null);
      obj.id = '123';
      obj.name = 'Test';
      obj.password = 'secret';

      const result = filterResponse(obj);

      expect(result.id).toBe('123');
      expect(result.name).toBe('Test');
      expect(result).not.toHaveProperty('password');
    });

    it('should handle arrays with null/undefined elements', () => {
      const data = [
        { id: '1', name: 'User1' },
        null,
        { id: '2', name: 'User2' },
        undefined,
      ];

      const result = filterResponse(data);

      expect(result).toHaveLength(4);
      expect(result[1]).toBeNull();
      expect(result[3]).toBeUndefined();
    });

    it('should handle objects with symbol keys', () => {
      const symbolKey = Symbol('test');
      const data: any = {
        id: '123',
        name: 'Test',
        [symbolKey]: 'value',
      };

      const result = filterResponse(data);

      expect(result.id).toBe('123');
      expect(result.name).toBe('Test');
    });

    it('should handle very deeply nested objects', () => {
      let deepObj: any = { value: 'deep', password: 'secret' };
      for (let i = 0; i < 20; i++) {
        deepObj = { nested: deepObj, password: `secret${i}` };
      }

      const result = filterResponse(deepObj, { maxDepth: 5 });

      // Should stop filtering after maxDepth
      expect(result).toBeDefined();
    });

    it('should handle mixed types in arrays', () => {
      const data = [
        'string',
        123,
        true,
        { id: '1', password: 'secret' },
        ['nested', 'array'],
      ];

      const result = filterResponse(data);

      expect(result[0]).toBe('string');
      expect(result[1]).toBe(123);
      expect(result[2]).toBe(true);
      expect(result[3]).toEqual({ id: '1' });
      expect(result[4]).toEqual(['nested', 'array']);
    });
  });
});
