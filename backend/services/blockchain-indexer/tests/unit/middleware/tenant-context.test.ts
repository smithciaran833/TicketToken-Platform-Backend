/**
 * Comprehensive Unit Tests for src/middleware/tenant-context.ts
 *
 * Tests tenant context setting with RLS support
 */

import { setTenantContext } from '../../../src/middleware/tenant-context';

describe('src/middleware/tenant-context.ts - Comprehensive Unit Tests', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockDb: any;

  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      raw: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
    };

    mockRequest = {
      log: {
        debug: jest.fn(),
        error: jest.fn(),
      },
      server: {
        db: mockDb,
      },
    };

    mockReply = {};
  });

  // =============================================================================
  // TENANT ID EXTRACTION
  // =============================================================================

  describe('Tenant ID Extraction', () => {
    it('should extract tenant ID from user.tenant_id', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', ['tenant-123']);
    });

    it('should extract tenant ID from user.tenantId', async () => {
      mockRequest.user = { tenantId: 'tenant-456' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', ['tenant-456']);
    });

    it('should prefer user.tenant_id over user.tenantId', async () => {
      mockRequest.user = {
        tenant_id: 'tenant-primary',
        tenantId: 'tenant-secondary',
      };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-primary');
    });

    it('should extract tenant ID from request.tenantId', async () => {
      mockRequest.tenantId = 'tenant-789';

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-789');
    });

    it('should use default tenant ID when no tenant specified', async () => {
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', [DEFAULT_TENANT_ID]);
    });

    it('should prioritize user.tenant_id over request.tenantId', async () => {
      mockRequest.user = { tenant_id: 'user-tenant' };
      mockRequest.tenantId = 'request-tenant';

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('user-tenant');
    });
  });

  // =============================================================================
  // DATABASE CONTEXT SETTING (KNEX - db.raw)
  // =============================================================================

  describe('Database Context Setting - Knex (db.raw)', () => {
    it('should set tenant context using db.raw', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', ['tenant-123']);
    });

    it('should use db from request.server', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.server = { db: mockDb };

      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should use db from request.db if available', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.db = mockDb;

      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should prefer request.db over request.server.db', async () => {
      const requestDb = {
        raw: jest.fn().mockResolvedValue(undefined),
      };

      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.db = requestDb;
      mockRequest.server = { db: mockDb };

      await setTenantContext(mockRequest, mockReply);

      expect(requestDb.raw).toHaveBeenCalled();
      expect(mockDb.raw).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // DATABASE CONTEXT SETTING (PG - db.query)
  // =============================================================================

  describe('Database Context Setting - pg (db.query)', () => {
    it('should set tenant context using db.query when db.raw not available', async () => {
      const pgDb = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.server = { db: pgDb };

      await setTenantContext(mockRequest, mockReply);

      expect(pgDb.query).toHaveBeenCalledWith('SET LOCAL app.current_tenant = $1', ['tenant-123']);
    });

    it('should prefer db.raw over db.query', async () => {
      const mixedDb = {
        raw: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue(undefined),
      };

      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.server = { db: mixedDb };

      await setTenantContext(mockRequest, mockReply);

      expect(mixedDb.raw).toHaveBeenCalled();
      expect(mixedDb.query).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // LOGGING
  // =============================================================================

  describe('Logging', () => {
    it('should log debug message on success', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.log.debug).toHaveBeenCalledWith(
        { tenantId: 'tenant-123' },
        'Tenant context set for blockchain indexer'
      );
    });

    it('should log error on failure', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      const error = new Error('Database connection failed');
      mockDb.raw.mockRejectedValue(error);

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow(
        'Database connection failed'
      );

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        { error, tenantId: 'tenant-123' },
        'Failed to set tenant context'
      );
    });

    it('should handle missing log object', async () => {
      delete mockRequest.log;
      mockRequest.user = { tenant_id: 'tenant-123' };

      await expect(setTenantContext(mockRequest, mockReply)).resolves.not.toThrow();

      expect(mockRequest.tenantId).toBe('tenant-123');
    });
  });

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  describe('Error Handling', () => {
    it('should throw error when db.raw fails', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      const error = new Error('SQL error');
      mockDb.raw.mockRejectedValue(error);

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow('SQL error');
    });

    it('should throw error when db.query fails', async () => {
      const pgDb = {
        query: jest.fn().mockRejectedValue(new Error('Query failed')),
      };

      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.server = { db: pgDb };

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow('Query failed');
    });

    it('should log error before throwing', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      const error = new Error('Test error');
      mockDb.raw.mockRejectedValue(error);

      try {
        await setTenantContext(mockRequest, mockReply);
      } catch (e) {
        // Expected
      }

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        { error, tenantId: 'tenant-123' },
        'Failed to set tenant context'
      );
    });
  });

  // =============================================================================
  // NO DATABASE AVAILABLE
  // =============================================================================

  describe('No Database Available', () => {
    it('should still set request.tenantId when no db available', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      delete mockRequest.server.db;

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockRequest.log.debug).toHaveBeenCalledWith(
        { tenantId: 'tenant-123' },
        'Tenant context set for blockchain indexer'
      );
    });

    it('should set default tenant when no db and no user', async () => {
      delete mockRequest.server.db;

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle null user', async () => {
      mockRequest.user = null;

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should handle undefined user', async () => {
      mockRequest.user = undefined;

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should handle empty string tenant ID', async () => {
      mockRequest.user = { tenant_id: '' };

      await setTenantContext(mockRequest, mockReply);

      // Empty string is falsy, should use default
      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should handle null tenant_id', async () => {
      mockRequest.user = { tenant_id: null };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should handle UUID format tenant ID', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.user = { tenant_id: uuid };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(uuid);
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', [uuid]);
    });

    it('should handle numeric tenant ID', async () => {
      mockRequest.user = { tenant_id: '12345' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('12345');
    });

    it('should handle special characters in tenant ID', async () => {
      mockRequest.user = { tenant_id: 'tenant-123-abc_def' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123-abc_def');
    });
  });

  // =============================================================================
  // REQUEST OBJECT MUTATION
  // =============================================================================

  describe('Request Object Mutation', () => {
    it('should set tenantId on request object', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      expect(mockRequest.tenantId).toBeUndefined();

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123');
    });

    it('should overwrite existing tenantId on request', async () => {
      mockRequest.tenantId = 'old-tenant';
      mockRequest.user = { tenant_id: 'new-tenant' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('new-tenant');
    });
  });

  // =============================================================================
  // INTEGRATION SCENARIOS
  // =============================================================================

  describe('Integration Scenarios', () => {
    it('should handle authenticated user request', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenant_id: 'tenant-456',
        roles: ['user'],
      };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', ['tenant-456']);
      expect(mockRequest.log.debug).toHaveBeenCalled();
    });

    it('should handle service-to-service request', async () => {
      mockRequest.user = {
        serviceId: 'service-abc',
        tenant_id: 'tenant-789',
      };

      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-789');
    });

    it('should handle unauthenticated request with default tenant', async () => {
      // No user
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', [DEFAULT_TENANT_ID]);
    });

    it('should work with Knex database connection', async () => {
      const knexDb = {
        raw: jest.fn().mockResolvedValue(undefined),
      };

      mockRequest.user = { tenant_id: 'tenant-knex' };
      mockRequest.server = { db: knexDb };

      await setTenantContext(mockRequest, mockReply);

      expect(knexDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant = ?', ['tenant-knex']);
    });

    it('should work with pg database connection', async () => {
      const pgDb = {
        query: jest.fn().mockResolvedValue(undefined),
      };

      mockRequest.user = { tenant_id: 'tenant-pg' };
      mockRequest.server = { db: pgDb };

      await setTenantContext(mockRequest, mockReply);

      expect(pgDb.query).toHaveBeenCalledWith('SET LOCAL app.current_tenant = $1', ['tenant-pg']);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export setTenantContext function', () => {
      expect(typeof setTenantContext).toBe('function');
    });
  });
});
