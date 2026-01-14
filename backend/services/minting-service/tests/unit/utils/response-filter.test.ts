/**
 * Unit Tests for utils/response-filter.ts
 * 
 * Tests response filtering and sensitive data redaction.
 * Priority: 🟡 Medium (18 tests)
 */

import {
  MINT_RESPONSE_FIELDS,
  MINT_DETAILED_RESPONSE_FIELDS,
  JOB_RESPONSE_FIELDS,
  DLQ_JOB_RESPONSE_FIELDS,
  pick,
  omit,
  filterMintResponse,
  filterMintListResponse,
  filterDetailedMintResponse,
  filterJobResponse,
  filterDLQJobResponse,
  redactSensitiveFields,
  createPaginatedResponse,
} from '../../../src/utils/response-filter';

// =============================================================================
// Test Suite
// =============================================================================

describe('Response Filter', () => {
  // =============================================================================
  // Field Constants Tests
  // =============================================================================

  describe('Field Constants', () => {
    it('MINT_RESPONSE_FIELDS should contain expected fields', () => {
      expect(MINT_RESPONSE_FIELDS).toContain('id');
      expect(MINT_RESPONSE_FIELDS).toContain('ticket_id');
      expect(MINT_RESPONSE_FIELDS).toContain('tenant_id');
      expect(MINT_RESPONSE_FIELDS).toContain('status');
      expect(MINT_RESPONSE_FIELDS).toContain('mint_address');
      expect(MINT_RESPONSE_FIELDS).toContain('transaction_signature');
    });

    it('MINT_DETAILED_RESPONSE_FIELDS should extend MINT_RESPONSE_FIELDS', () => {
      // All basic fields should be included
      MINT_RESPONSE_FIELDS.forEach(field => {
        expect(MINT_DETAILED_RESPONSE_FIELDS).toContain(field);
      });
      // Plus additional fields
      expect(MINT_DETAILED_RESPONSE_FIELDS).toContain('blockchain');
      expect(MINT_DETAILED_RESPONSE_FIELDS).toContain('merkle_tree');
    });

    it('JOB_RESPONSE_FIELDS should contain expected fields', () => {
      expect(JOB_RESPONSE_FIELDS).toContain('id');
      expect(JOB_RESPONSE_FIELDS).toContain('name');
      expect(JOB_RESPONSE_FIELDS).toContain('data');
      expect(JOB_RESPONSE_FIELDS).toContain('progress');
      expect(JOB_RESPONSE_FIELDS).toContain('attemptsMade');
    });

    it('DLQ_JOB_RESPONSE_FIELDS should contain expected fields', () => {
      expect(DLQ_JOB_RESPONSE_FIELDS).toContain('id');
      expect(DLQ_JOB_RESPONSE_FIELDS).toContain('originalJobId');
      expect(DLQ_JOB_RESPONSE_FIELDS).toContain('data');
      expect(DLQ_JOB_RESPONSE_FIELDS).toContain('error');
      expect(DLQ_JOB_RESPONSE_FIELDS).toContain('failedAt');
    });
  });

  // =============================================================================
  // Helper Functions Tests
  // =============================================================================

  describe('Helper Functions', () => {
    describe('pick', () => {
      it('should return only specified keys', () => {
        const obj = { a: 1, b: 2, c: 3, d: 4 };
        const result = pick(obj, ['a', 'c'] as const);
        
        expect(result).toEqual({ a: 1, c: 3 });
        expect(result).not.toHaveProperty('b');
        expect(result).not.toHaveProperty('d');
      });

      it('should handle missing keys gracefully', () => {
        const obj = { a: 1, b: 2 };
        const result = pick(obj, ['a', 'c' as any] as const);
        
        expect(result).toEqual({ a: 1 });
      });

      it('should return empty object for no matches', () => {
        const obj = { a: 1, b: 2 };
        const result = pick(obj, ['x' as any, 'y' as any] as const);
        
        expect(result).toEqual({});
      });
    });

    describe('omit', () => {
      it('should remove specified keys', () => {
        const obj = { a: 1, b: 2, c: 3, d: 4 };
        const result = omit(obj, ['b', 'd'] as const);
        
        expect(result).toEqual({ a: 1, c: 3 });
      });

      it('should preserve other keys', () => {
        const obj = { a: 1, b: 2, c: 3 };
        const result = omit(obj, ['b'] as const);
        
        expect(result).toHaveProperty('a');
        expect(result).toHaveProperty('c');
        expect(result).not.toHaveProperty('b');
      });
    });
  });

  // =============================================================================
  // Filter Functions Tests
  // =============================================================================

  describe('Filter Functions', () => {
    it('filterMintResponse should filter to allowed fields', () => {
      const mint = {
        id: '123',
        ticket_id: '456',
        tenant_id: '789',
        status: 'completed',
        internal_field: 'should be removed',
        secret_data: 'should also be removed',
      };
      
      const filtered = filterMintResponse(mint);
      
      expect(filtered).toHaveProperty('id');
      expect(filtered).toHaveProperty('ticket_id');
      expect(filtered).toHaveProperty('status');
      expect(filtered).not.toHaveProperty('internal_field');
      expect(filtered).not.toHaveProperty('secret_data');
    });

    it('filterMintResponse should exclude sensitive fields', () => {
      const mint = {
        id: '123',
        ticket_id: '456',
        tenant_id: '789',
        password: 'secret',
        api_key: 'key123',
      };
      
      const filtered = filterMintResponse(mint);
      
      expect(filtered).not.toHaveProperty('password');
      expect(filtered).not.toHaveProperty('api_key');
    });

    it('filterMintListResponse should filter array of mints', () => {
      const mints = [
        { id: '1', ticket_id: 't1', internal: 'x' },
        { id: '2', ticket_id: 't2', internal: 'y' },
      ];
      
      const filtered = filterMintListResponse(mints);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0]).not.toHaveProperty('internal');
      expect(filtered[1]).not.toHaveProperty('internal');
    });

    it('filterDetailedMintResponse should include additional fields', () => {
      const mint = {
        id: '123',
        ticket_id: '456',
        blockchain: 'solana',
        merkle_tree: 'tree123',
        internal_secret: 'remove',
      };
      
      const filtered = filterDetailedMintResponse(mint);
      
      expect(filtered).toHaveProperty('blockchain');
      expect(filtered).toHaveProperty('merkle_tree');
      expect(filtered).not.toHaveProperty('internal_secret');
    });

    it('filterJobResponse should filter job fields', () => {
      const job = {
        id: 'job-1',
        name: 'mint-job',
        data: { ticketId: '123' },
        progress: 50,
        internalField: 'remove',
      };
      
      const filtered = filterJobResponse(job);
      
      expect(filtered).toHaveProperty('id');
      expect(filtered).toHaveProperty('name');
      expect(filtered).toHaveProperty('data');
      expect(filtered).not.toHaveProperty('internalField');
    });

    it('filterDLQJobResponse should filter DLQ fields', () => {
      const dlqJob = {
        id: 'dlq-1',
        originalJobId: 'job-1',
        error: 'Failed',
        internalData: 'remove',
      };
      
      const filtered = filterDLQJobResponse(dlqJob);
      
      expect(filtered).toHaveProperty('id');
      expect(filtered).toHaveProperty('originalJobId');
      expect(filtered).not.toHaveProperty('internalData');
    });
  });

  // =============================================================================
  // Redaction & Pagination Tests
  // =============================================================================

  describe('Redaction & Pagination', () => {
    describe('redactSensitiveFields', () => {
      it('should redact password', () => {
        const obj = { name: 'test', password: 'secret123' };
        const redacted = redactSensitiveFields(obj);
        
        expect(redacted.password).toBe('[REDACTED]');
        expect(redacted.name).toBe('test');
      });

      it('should redact nested sensitive fields', () => {
        const obj = {
          user: {
            name: 'john',
            apiKey: 'key123',
          }
        };
        const redacted = redactSensitiveFields(obj);
        
        expect(redacted.user.apiKey).toBe('[REDACTED]');
        expect(redacted.user.name).toBe('john');
      });

      it('should handle arrays', () => {
        const obj = {
          users: [
            { name: 'alice', token: 'token1' },
            { name: 'bob', token: 'token2' },
          ]
        };
        const redacted = redactSensitiveFields(obj);
        
        expect(redacted.users[0].token).toBe('[REDACTED]');
        expect(redacted.users[1].token).toBe('[REDACTED]');
        expect(redacted.users[0].name).toBe('alice');
      });

      it('should be case-insensitive', () => {
        const obj = {
          PASSWORD: 'secret1',
          ApiKey: 'key1',
          accessTOKEN: 'tok1',
        };
        const redacted = redactSensitiveFields(obj);
        
        expect(redacted.PASSWORD).toBe('[REDACTED]');
        expect(redacted.ApiKey).toBe('[REDACTED]');
        expect(redacted.accessTOKEN).toBe('[REDACTED]');
      });
    });

    describe('createPaginatedResponse', () => {
      it('should calculate hasMore correctly', () => {
        // Has more items
        const response1 = createPaginatedResponse([1, 2, 3], 10, 3, 0);
        expect(response1.pagination.hasMore).toBe(true);
        
        // No more items
        const response2 = createPaginatedResponse([1, 2, 3], 3, 10, 0);
        expect(response2.pagination.hasMore).toBe(false);
        
        // Exactly at end
        const response3 = createPaginatedResponse([1, 2], 5, 2, 3);
        expect(response3.pagination.hasMore).toBe(false);
      });

      it('should include pagination metadata', () => {
        const data = [{ id: 1 }, { id: 2 }];
        const response = createPaginatedResponse(data, 100, 10, 20);
        
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('pagination');
        expect(response.pagination).toEqual({
          total: 100,
          limit: 10,
          offset: 20,
          hasMore: true,
        });
        expect(response.data).toEqual(data);
      });
    });
  });
});
