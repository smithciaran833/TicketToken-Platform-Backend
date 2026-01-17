// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/tenant-context.ts
 */

describe('src/middleware/tenant-context.ts - Comprehensive Unit Tests', () => {
  let tenantContext: any;
  let mockRequest: any;
  let mockReply: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Import module under test
    tenantContext = require('../../../src/middleware/tenant-context');

    // Mock database
    mockDb = {
      raw: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
    };

    // Mock request
    mockRequest = {
      user: undefined,
      tenantId: undefined,
      db: mockDb,
      log: {
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      },
      server: {},
    };

    // Mock reply
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  // =============================================================================
  // setTenantContext() - Tenant ID Extraction
  // =============================================================================

  describe('setTenantContext() - Tenant ID Extraction', () => {
    it('should extract tenant_id from user.tenant_id', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = ?', ['tenant-123']);
    });

    it('should extract tenantId from user.tenantId (camelCase)', async () => {
      mockRequest.user = { tenantId: 'tenant-456' };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = ?', ['tenant-456']);
    });

    it('should extract tenantId from request.tenantId', async () => {
      mockRequest.tenantId = 'tenant-789';

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-789');
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = ?', ['tenant-789']);
    });

    it('should use default tenant ID when no tenant found', async () => {
      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('00000000-0000-0000-0000-000000000001');
      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['00000000-0000-0000-0000-000000000001']
      );
    });

    it('should prioritize user.tenant_id over user.tenantId', async () => {
      mockRequest.user = { 
        tenant_id: 'tenant-priority',
        tenantId: 'tenant-secondary'
      };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-priority');
    });

    it('should prioritize user.tenantId over request.tenantId', async () => {
      mockRequest.user = { tenantId: 'user-tenant' };
      mockRequest.tenantId = 'request-tenant';

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('user-tenant');
    });
  });

  // =============================================================================
  // setTenantContext() - Database Operations
  // =============================================================================

  describe('setTenantContext() - Database Operations', () => {
    it('should use Knex raw method when available', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.db = { raw: jest.fn().mockResolvedValue(undefined) };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.db.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = ?', ['tenant-123']);
    });

    it('should use pg query method when raw not available', async () => {
      mockRequest.user = { tenant_id: 'tenant-456' };
      mockRequest.db = { query: jest.fn().mockResolvedValue(undefined) };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.db.query).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = $1', ['tenant-456']);
    });

    it('should use database from request.server when request.db not available', async () => {
      mockRequest.user = { tenant_id: 'tenant-789' };
      delete mockRequest.db;
      mockRequest.server.db = { raw: jest.fn().mockResolvedValue(undefined) };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.server.db.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = ?', ['tenant-789']);
    });

    it('should handle missing database gracefully', async () => {
      mockRequest.user = { tenant_id: 'tenant-abc' };
      delete mockRequest.db;
      mockRequest.server.db = undefined;

      await tenantContext.setTenantContext(mockRequest, mockReply);

      // Should still set tenantId on request
      expect(mockRequest.tenantId).toBe('tenant-abc');
    });

    it('should log debug message after setting context', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.log.debug).toHaveBeenCalledWith(
        { tenantId: 'tenant-123' },
        'Tenant context set for scanning service'
      );
    });
  });

  // =============================================================================
  // setTenantContext() - Error Handling
  // =============================================================================

  describe('setTenantContext() - Error Handling', () => {
    it('should throw error when database operation fails', async () => {
      const dbError = new Error('Database connection failed');
      mockRequest.user = { tenant_id: 'tenant-123' };
      mockDb.raw.mockRejectedValue(dbError);

      await expect(tenantContext.setTenantContext(mockRequest, mockReply)).rejects.toThrow('Database connection failed');
    });

    it('should log error when database operation fails', async () => {
      const dbError = new Error('Database error');
      mockRequest.user = { tenant_id: 'tenant-456' };
      mockDb.raw.mockRejectedValue(dbError);

      try {
        await tenantContext.setTenantContext(mockRequest, mockReply);
      } catch (error) {
        // Expected
      }

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        { error: dbError, tenantId: 'tenant-456' },
        'Failed to set tenant context'
      );
    });

    it('should not catch or suppress errors', async () => {
      const dbError = new Error('Critical DB error');
      mockRequest.user = { tenant_id: 'tenant-789' };
      mockDb.raw.mockRejectedValue(dbError);

      await expect(tenantContext.setTenantContext(mockRequest, mockReply)).rejects.toThrow(dbError);
    });

    it('should handle query method errors', async () => {
      const dbError = new Error('Query failed');
      mockRequest.user = { tenant_id: 'tenant-abc' };
      mockRequest.db = { query: jest.fn().mockRejectedValue(dbError) };

      await expect(tenantContext.setTenantContext(mockRequest, mockReply)).rejects.toThrow('Query failed');
      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // requireTenantContext()
  // =============================================================================

  describe('requireTenantContext()', () => {
    it('should allow request when tenantId is present', async () => {
      mockRequest.tenantId = 'tenant-123';

      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should reject request when tenantId is missing', async () => {
      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Tenant context required',
        message: 'This endpoint requires a valid tenant context',
      });
    });

    it('should reject request when tenantId is undefined', async () => {
      mockRequest.tenantId = undefined;

      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject request when tenantId is null', async () => {
      mockRequest.tenantId = null;

      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject request when tenantId is empty string', async () => {
      mockRequest.tenantId = '';

      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should warn when using default tenant ID', async () => {
      mockRequest.tenantId = '00000000-0000-0000-0000-000000000001';

      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockRequest.log.warn).toHaveBeenCalledWith('Scanning operation using default tenant ID');
      expect(mockReply.code).not.toHaveBeenCalled(); // Still allows request
    });

    it('should allow valid non-default tenant ID without warning', async () => {
      mockRequest.tenantId = '550e8400-e29b-41d4-a716-446655440000';

      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockRequest.log.warn).not.toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Integration Tests', () => {
    it('should set context and pass requireTenantContext', async () => {
      mockRequest.user = { tenant_id: 'tenant-integration' };

      await tenantContext.setTenantContext(mockRequest, mockReply);
      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-integration');
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should use default tenant and trigger warning in requireTenantContext', async () => {
      // No user, so uses default
      await tenantContext.setTenantContext(mockRequest, mockReply);
      await tenantContext.requireTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('00000000-0000-0000-0000-000000000001');
      expect(mockRequest.log.warn).toHaveBeenCalledWith('Scanning operation using default tenant ID');
    });

    it('should handle full request lifecycle with Knex', async () => {
      mockRequest.user = { tenant_id: 'full-lifecycle-tenant' };
      mockRequest.db = { raw: jest.fn().mockResolvedValue(undefined) };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.db.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['full-lifecycle-tenant']
      );
      expect(mockRequest.tenantId).toBe('full-lifecycle-tenant');
      expect(mockRequest.log.debug).toHaveBeenCalled();
    });

    it('should handle full request lifecycle with pg Pool', async () => {
      mockRequest.user = { tenant_id: 'pg-pool-tenant' };
      mockRequest.db = { query: jest.fn().mockResolvedValue(undefined) };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.db.query).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = $1',
        ['pg-pool-tenant']
      );
      expect(mockRequest.tenantId).toBe('pg-pool-tenant');
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle tenant ID with special characters', async () => {
      mockRequest.user = { tenant_id: 'tenant-123-abc-def' };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['tenant-123-abc-def']
      );
    });

    it('should handle very long tenant ID', async () => {
      const longId = 'a'.repeat(100);
      mockRequest.user = { tenant_id: longId };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = ?', [longId]);
    });

    it('should handle numeric tenant ID', async () => {
      mockRequest.user = { tenant_id: 12345 };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(12345);
      expect(mockDb.raw).toHaveBeenCalledWith('SET LOCAL app.current_tenant_id = ?', [12345]);
    });

    it('should store tenant on request even if db operation fails', async () => {
      mockRequest.user = { tenant_id: 'tenant-store-test' };
      mockDb.raw.mockRejectedValue(new Error('DB error'));

      try {
        await tenantContext.setTenantContext(mockRequest, mockReply);
      } catch (error) {
        // Expected
      }

      expect(mockRequest.tenantId).toBe('tenant-store-test');
    });

    it('should handle request with both db and server.db', async () => {
      mockRequest.user = { tenant_id: 'dual-db-tenant' };
      mockRequest.db = { raw: jest.fn().mockResolvedValue(undefined) };
      mockRequest.server.db = { raw: jest.fn().mockResolvedValue(undefined) };

      await tenantContext.setTenantContext(mockRequest, mockReply);

      // Should prefer request.db over server.db
      expect(mockRequest.db.raw).toHaveBeenCalled();
      expect(mockRequest.server.db.raw).not.toHaveBeenCalled();
    });
  });
});
