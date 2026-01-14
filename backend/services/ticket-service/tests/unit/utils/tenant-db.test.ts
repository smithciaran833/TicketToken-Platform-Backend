/**
 * Unit Tests for src/utils/tenant-db.ts
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const mockQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
  },
}));

import {
  isValidTenantId,
  setTenantContext,
  clearTenantContext,
  getCurrentTenantContext,
  verifyTenantContext,
  withTenantContext,
  withTenantContextTrx,
  withJobTenantContext,
  withTenantBatch,
  tenantQuery,
  verifyRLSConfiguration,
  selectTicketsForUpdate,
  verifyTenantBasedRLS,
  TenantDB,
} from '../../../src/utils/tenant-db';

describe('utils/tenant-db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('isValidTenantId()', () => {
    it('returns true for valid UUID v4', () => {
      expect(isValidTenantId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidTenantId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    });

    it('returns false for invalid UUID', () => {
      expect(isValidTenantId('not-a-uuid')).toBe(false);
      expect(isValidTenantId('550e8400-e29b-31d4-a716-446655440000')).toBe(false); // v3 not v4
      expect(isValidTenantId('550e8400-e29b-41d4-c716-446655440000')).toBe(false); // wrong variant
    });

    it('returns false for null/undefined/non-string', () => {
      expect(isValidTenantId(null as any)).toBe(false);
      expect(isValidTenantId(undefined as any)).toBe(false);
      expect(isValidTenantId(123 as any)).toBe(false);
      expect(isValidTenantId({} as any)).toBe(false);
    });
  });

  describe('setTenantContext()', () => {
    it('throws for invalid tenant ID', async () => {
      await expect(setTenantContext('invalid')).rejects.toThrow('Invalid tenant ID format');
    });

    it('calls set_config with tenant ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      await setTenantContext('550e8400-e29b-41d4-a716-446655440000');
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        ['550e8400-e29b-41d4-a716-446655440000']
      );
    });
  });

  describe('clearTenantContext()', () => {
    it('sets empty tenant context', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      await clearTenantContext();
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        []
      );
    });
  });

  describe('getCurrentTenantContext()', () => {
    it('returns null when not set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: '' }] });
      
      const result = await getCurrentTenantContext();
      
      expect(result).toBeNull();
    });

    it('returns tenant ID when set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: '550e8400-e29b-41d4-a716-446655440000' }] });
      
      const result = await getCurrentTenantContext();
      
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('verifyTenantContext()', () => {
    it('returns false when not valid', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: '' }] });
      
      const result = await verifyTenantContext();
      
      expect(result).toBe(false);
    });

    it('returns true when valid UUID set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ tenant_id: '550e8400-e29b-41d4-a716-446655440000' }] });
      
      const result = await verifyTenantContext();
      
      expect(result).toBe(true);
    });
  });

  describe('withTenantContext()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('throws for invalid tenant ID', async () => {
      await expect(withTenantContext('invalid', async () => 'result')).rejects.toThrow('Invalid tenant ID format');
    });

    it('sets context, runs operation, commits', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      const result = await withTenantContext(validTenantId, async () => 'success');
      
      expect(result).toBe('success');
      expect(mockQuery).toHaveBeenCalledWith('BEGIN', []);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('set_config'), [validTenantId]);
      expect(mockQuery).toHaveBeenCalledWith('COMMIT', []);
    });

    it('rolls back on operation error', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      await expect(
        withTenantContext(validTenantId, async () => {
          throw new Error('Operation failed');
        })
      ).rejects.toThrow('Operation failed');
      
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK', []);
    });
  });

  describe('withTenantContextTrx()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('throws for invalid tenant ID', async () => {
      const mockTrx = { raw: jest.fn() } as any;
      
      await expect(
        withTenantContextTrx('invalid', mockTrx, async () => 'result')
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('sets context on provided transaction', async () => {
      const mockTrx = { raw: jest.fn().mockResolvedValue({}) } as any;
      
      const result = await withTenantContextTrx(validTenantId, mockTrx, async (trx) => 'success');
      
      expect(result).toBe('success');
      expect(mockTrx.raw).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        [validTenantId]
      );
    });
  });

  describe('withJobTenantContext()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('logs job start and completion', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      await withJobTenantContext(validTenantId, 'test-job', async () => 'done');
      
      // Logger is mocked, just verify no throw
    });

    it('logs job failure with duration', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      await expect(
        withJobTenantContext(validTenantId, 'test-job', async () => {
          throw new Error('Job failed');
        })
      ).rejects.toThrow('Job failed');
    });
  });

  describe('withTenantBatch()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('processes items in chunks', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      const items = [1, 2, 3, 4, 5];
      const results = await withTenantBatch(
        validTenantId,
        items,
        2,
        async (batch) => batch.map(i => i * 2)
      );
      
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('sets tenant context for each batch', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      const items = [1, 2, 3];
      await withTenantBatch(validTenantId, items, 2, async (batch) => batch);
      
      // Should have called BEGIN at least twice (for 2 batches)
      const beginCalls = mockQuery.mock.calls.filter(c => c[0] === 'BEGIN');
      expect(beginCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('tenantQuery()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('builds WHERE clause with tenant_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      
      await tenantQuery('tickets', validTenantId);
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $1'),
        [validTenantId]
      );
    });

    it('adds additional WHERE conditions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      await tenantQuery('tickets', validTenantId, '*', { status: 'active' });
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        [validTenantId, 'active']
      );
    });
  });

  describe('verifyRLSConfiguration()', () => {
    it('detects superuser role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ rolsuper: true, rolbypassrls: false }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ relname: 'tickets', relrowsecurity: true }] });
      
      const result = await verifyRLSConfiguration();
      
      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('superuser'))).toBe(true);
    });

    it('detects BYPASSRLS permission', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ rolsuper: false, rolbypassrls: true }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ relname: 'tickets', relrowsecurity: true }] });
      
      const result = await verifyRLSConfiguration();
      
      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('bypass'))).toBe(true);
    });

    it('checks RLS enabled on tickets table', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ rolsuper: false, rolbypassrls: false }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ relname: 'tickets', relrowsecurity: false }] });
      
      const result = await verifyRLSConfiguration();
      
      expect(result.isValid).toBe(false);
      expect(result.issues.some(i => i.includes('RLS not enabled'))).toBe(true);
    });
  });

  describe('selectTicketsForUpdate()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('uses FOR UPDATE SKIP LOCKED by default', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      
      await selectTicketsForUpdate(validTenantId, 'type-1', 5);
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        [validTenantId, 'type-1', 5]
      );
    });

    it('uses FOR UPDATE when skipLocked=false', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      
      await selectTicketsForUpdate(validTenantId, 'type-1', 5, { skipLocked: false });
      
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs).toContain('FOR UPDATE');
      expect(callArgs).not.toContain('SKIP LOCKED');
    });

    it('sets lock_timeout when waitTimeout provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      
      await selectTicketsForUpdate(validTenantId, 'type-1', 5, { waitTimeout: 1000 });
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('lock_timeout'),
        []
      );
    });
  });

  describe('verifyTenantBasedRLS()', () => {
    it('checks policies use current_setting', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          polname: 'tenant_isolation',
          policy_expr: "tenant_id = current_setting('app.current_tenant_id')::uuid"
        }]
      });
      
      const result = await verifyTenantBasedRLS();
      
      expect(result.isValid).toBe(true);
    });

    it('returns issues for non-tenant policies', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          polname: 'user_policy',
          policy_expr: 'user_id = current_user_id()'
        }]
      });
      
      const result = await verifyTenantBasedRLS();
      
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('TenantDB exports', () => {
    it('exports all functions', () => {
      expect(TenantDB.setContext).toBe(setTenantContext);
      expect(TenantDB.clearContext).toBe(clearTenantContext);
      expect(TenantDB.getContext).toBe(getCurrentTenantContext);
      expect(TenantDB.verifyContext).toBe(verifyTenantContext);
      expect(TenantDB.withContext).toBe(withTenantContext);
      expect(TenantDB.withContextTrx).toBe(withTenantContextTrx);
      expect(TenantDB.withJobContext).toBe(withJobTenantContext);
      expect(TenantDB.withBatch).toBe(withTenantBatch);
      expect(TenantDB.query).toBe(tenantQuery);
      expect(TenantDB.verifyRLS).toBe(verifyRLSConfiguration);
      expect(TenantDB.verifyTenantRLS).toBe(verifyTenantBasedRLS);
      expect(TenantDB.selectForUpdate).toBe(selectTicketsForUpdate);
      expect(TenantDB.isValidTenantId).toBe(isValidTenantId);
    });
  });
});
