// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/tenant-context.ts
 */

describe('src/middleware/tenant-context.ts - Comprehensive Unit Tests', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock database
    mockDb = {
      raw: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined)
    };

    // Mock request
    mockRequest = {
      user: undefined,
      tenantId: undefined,
      db: mockDb,
      server: {},
      log: {
        debug: jest.fn(),
        error: jest.fn()
      }
    };

    // Mock reply
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  // =============================================================================
  // setTenantContext() - Tenant ID Resolution
  // =============================================================================

  describe('setTenantContext() - Tenant ID Resolution', () => {
    it('should use tenant_id from user', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['tenant-123']
      );
    });

    it('should fallback to venueId from user', async () => {
      mockRequest.user = { venueId: 'venue-456' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['venue-456']
      );
    });

    it('should prefer tenant_id over venueId', async () => {
      mockRequest.user = { tenant_id: 'tenant-123', venueId: 'venue-456' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['tenant-123']
      );
    });

    it('should fallback to request.tenantId', async () => {
      mockRequest.tenantId = 'request-tenant-789';

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['request-tenant-789']
      );
    });

    it('should use default tenant ID when none provided', async () => {
      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['00000000-0000-0000-0000-000000000001']
      );
    });

    it('should handle empty user object', async () => {
      mockRequest.user = {};

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['00000000-0000-0000-0000-000000000001']
      );
    });

    it('should handle null tenant_id', async () => {
      mockRequest.user = { tenant_id: null, venueId: 'venue-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['venue-1']
      );
    });

    it('should handle undefined tenant_id', async () => {
      mockRequest.user = { tenant_id: undefined, venueId: 'venue-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['venue-1']
      );
    });

    it('should handle empty string tenant_id', async () => {
      mockRequest.user = { tenant_id: '', venueId: 'venue-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['venue-1']
      );
    });
  });

  // =============================================================================
  // setTenantContext() - Database Interaction (db.raw)
  // =============================================================================

  describe('setTenantContext() - Database Interaction (db.raw)', () => {
    it('should call db.raw when available', async () => {
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should set PostgreSQL session variable', async () => {
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['tenant-1']
      );
    });

    it('should use knex parameter placeholder', async () => {
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalledWith(
        expect.stringContaining('?'),
        expect.any(Array)
      );
    });
  });

  // =============================================================================
  // setTenantContext() - Database Interaction (db.query)
  // =============================================================================

  describe('setTenantContext() - Database Interaction (db.query)', () => {
    it('should call db.query when db.raw not available', async () => {
      mockDb.raw = undefined;
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should use PostgreSQL parameter placeholder', async () => {
      mockDb.raw = undefined;
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.query).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = $1',
        ['tenant-1']
      );
    });

    it('should set session variable via query', async () => {
      mockDb.raw = undefined;
      mockRequest.user = { tenant_id: 'tenant-123' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL'),
        ['tenant-123']
      );
    });
  });

  // =============================================================================
  // setTenantContext() - Database Source Resolution
  // =============================================================================

  describe('setTenantContext() - Database Source Resolution', () => {
    it('should use db from request', async () => {
      mockRequest.db = mockDb;
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should fallback to db from server', async () => {
      mockRequest.db = undefined;
      mockRequest.server.db = mockDb;
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should prefer request.db over server.db', async () => {
      const serverDb = {
        raw: jest.fn().mockResolvedValue(undefined)
      };
      mockRequest.db = mockDb;
      mockRequest.server.db = serverDb;
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockDb.raw).toHaveBeenCalled();
      expect(serverDb.raw).not.toHaveBeenCalled();
    });

    it('should handle missing db gracefully', async () => {
      mockRequest.db = undefined;
      mockRequest.server.db = undefined;
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-1');
    });
  });

  // =============================================================================
  // setTenantContext() - Request Modification
  // =============================================================================

  describe('setTenantContext() - Request Modification', () => {
    it('should set tenantId on request', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123');
    });

    it('should set default tenant ID on request', async () => {
      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('should overwrite existing tenantId', async () => {
      mockRequest.tenantId = 'old-tenant';
      mockRequest.user = { tenant_id: 'new-tenant' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('new-tenant');
    });
  });

  // =============================================================================
  // setTenantContext() - Logging
  // =============================================================================

  describe('setTenantContext() - Logging', () => {
    it('should log debug message on success', async () => {
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.log.debug).toHaveBeenCalledWith(
        { tenantId: 'tenant-1' },
        'Tenant context set for search service'
      );
    });

    it('should include tenantId in debug log', async () => {
      mockRequest.user = { tenant_id: 'tenant-123' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      await setTenantContext(mockRequest, mockReply);

      expect(mockRequest.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-123' }),
        expect.any(String)
      );
    });

    it('should handle missing logger', async () => {
      mockRequest.log = undefined;
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      await expect(setTenantContext(mockRequest, mockReply)).resolves.not.toThrow();
    });

    it('should log error on failure', async () => {
      const error = new Error('DB error');
      mockDb.raw.mockRejectedValue(error);
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow();

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        { error, tenantId: 'tenant-1' },
        'Failed to set tenant context'
      );
    });

    it('should include error and tenantId in error log', async () => {
      const error = new Error('Connection failed');
      mockDb.raw.mockRejectedValue(error);
      mockRequest.user = { tenant_id: 'tenant-123' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      try {
        await setTenantContext(mockRequest, mockReply);
      } catch (e) {}

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          tenantId: 'tenant-123'
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // setTenantContext() - Error Handling
  // =============================================================================

  describe('setTenantContext() - Error Handling', () => {
    it('should propagate db.raw errors', async () => {
      const error = new Error('Database error');
      mockDb.raw.mockRejectedValue(error);
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow('Database error');
    });

    it('should propagate db.query errors', async () => {
      mockDb.raw = undefined;
      const error = new Error('Query failed');
      mockDb.query.mockRejectedValue(error);
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow('Query failed');
    });

    it('should throw the original error', async () => {
      const error = new Error('Original error');
      mockDb.raw.mockRejectedValue(error);
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toBe(error);
    });

    it('should log before throwing', async () => {
      const error = new Error('Error');
      mockDb.raw.mockRejectedValue(error);
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      try {
        await setTenantContext(mockRequest, mockReply);
      } catch (e) {
        expect(mockRequest.log.error).toHaveBeenCalled();
      }
    });

    it('should handle connection errors', async () => {
      mockDb.raw.mockRejectedValue(new Error('Connection refused'));
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      mockDb.raw.mockRejectedValue(new Error('Query timeout'));
      mockRequest.user = { tenant_id: 'tenant-1' };

      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      await expect(setTenantContext(mockRequest, mockReply)).rejects.toThrow();
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export setTenantContext function', () => {
      const module = require('../../../src/middleware/tenant-context');

      expect(module.setTenantContext).toBeDefined();
      expect(typeof module.setTenantContext).toBe('function');
    });

    it('should be an async function', () => {
      const { setTenantContext } = require('../../../src/middleware/tenant-context');

      expect(setTenantContext.constructor.name).toBe('AsyncFunction');
    });
  });
});
