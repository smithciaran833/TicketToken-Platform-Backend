import { FastifyRequest, FastifyReply } from 'fastify';
import { setTenantContext } from '../../../src/middleware/tenant-context';

describe('Tenant Context Middleware', () => {
  let mockRequest: Partial<FastifyRequest> & { user?: any; db?: any; server?: any; tenantId?: string };
  let mockReply: Partial<FastifyReply>;
  let mockLog: { debug: jest.Mock; error: jest.Mock };
  let mockDb: { raw?: jest.Mock; query?: jest.Mock };

  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    mockLog = {
      debug: jest.fn(),
      error: jest.fn(),
    };

    mockDb = {
      raw: jest.fn().mockResolvedValue(undefined),
    };

    mockRequest = {
      log: mockLog as any,
      db: mockDb,
      server: { db: null },
    };

    mockReply = {};
  });

  describe('tenant ID extraction', () => {
    it('should use tenant_id from user object (snake_case)', async () => {
      mockRequest.user = { tenant_id: 'tenant-from-user-snake' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('tenant-from-user-snake');
      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        ['tenant-from-user-snake']
      );
    });

    it('should use tenantId from user object (camelCase)', async () => {
      mockRequest.user = { tenantId: 'tenant-from-user-camel' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('tenant-from-user-camel');
    });

    it('should prefer tenant_id over tenantId when both exist', async () => {
      mockRequest.user = {
        tenant_id: 'snake-case-tenant',
        tenantId: 'camel-case-tenant',
      };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('snake-case-tenant');
    });

    it('should use request.tenantId when user does not have tenant info', async () => {
      mockRequest.user = { id: 'user-123' };
      mockRequest.tenantId = 'request-level-tenant';

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('request-level-tenant');
    });

    it('should use default tenant ID when no tenant info available', async () => {
      mockRequest.user = undefined;
      mockRequest.tenantId = undefined;

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should use default tenant ID when user object exists but has no tenant', async () => {
      mockRequest.user = { id: 'user-123', role: 'admin' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should handle null tenant values in user object', async () => {
      mockRequest.user = { tenant_id: null, tenantId: null };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should handle undefined tenant values in user object', async () => {
      mockRequest.user = { tenant_id: undefined, tenantId: undefined };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });

    it('should handle empty string tenant values', async () => {
      mockRequest.user = { tenant_id: '' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Empty string is falsy, should fall through to default
      expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
    });
  });

  describe('database context setting', () => {
    describe('with Knex-style db (raw method)', () => {
      it('should call db.raw with correct SQL and tenant ID', async () => {
        const tenantId = 'test-tenant-123';
        mockRequest.user = { tenant_id: tenantId };

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockDb.raw).toHaveBeenCalledTimes(1);
        expect(mockDb.raw).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = ?',
          [tenantId]
        );
      });

      it('should use request.db when available', async () => {
        mockRequest.db = mockDb;
        mockRequest.server = { db: { raw: jest.fn() } };

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockDb.raw).toHaveBeenCalled();
        expect(mockRequest.server.db.raw).not.toHaveBeenCalled();
      });
    });

    describe('with pg-style db (query method)', () => {
      it('should call db.query with correct SQL and tenant ID', async () => {
        const tenantId = 'pg-tenant-456';
        mockRequest.user = { tenant_id: tenantId };
        mockRequest.db = { query: jest.fn().mockResolvedValue(undefined) };

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRequest.db.query).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = $1',
          [tenantId]
        );
      });
    });

    describe('with server.db fallback', () => {
      it('should use server.db when request.db is not available', async () => {
        mockRequest.db = undefined;
        mockRequest.server = { db: { raw: jest.fn().mockResolvedValue(undefined) } };

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRequest.server.db.raw).toHaveBeenCalled();
      });
    });

    describe('without database', () => {
      it('should still set tenantId on request when no db available', async () => {
        mockRequest.db = undefined;
        mockRequest.server = { db: undefined };
        mockRequest.user = { tenant_id: 'no-db-tenant' };

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRequest.tenantId).toBe('no-db-tenant');
      });

      it('should not throw when db is null', async () => {
        mockRequest.db = null;
        mockRequest.server = { db: null };

        await expect(
          setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply)
        ).resolves.not.toThrow();

        expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
      });
    });
  });

  describe('logging', () => {
    it('should log debug message on successful context set', async () => {
      const tenantId = 'logged-tenant';
      mockRequest.user = { tenant_id: tenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockLog.debug).toHaveBeenCalledWith(
        { tenantId },
        'Tenant context set for monitoring service'
      );
    });

    it('should log error when database operation fails', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.raw = jest.fn().mockRejectedValue(dbError);
      mockRequest.user = { tenant_id: 'error-tenant' };

      await expect(
        setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database connection failed');

      expect(mockLog.error).toHaveBeenCalledWith(
        { error: dbError, tenantId: 'error-tenant' },
        'Failed to set tenant context'
      );
    });
  });

  describe('error handling', () => {
    it('should throw error when db.raw fails', async () => {
      const dbError = new Error('Raw query failed');
      mockDb.raw = jest.fn().mockRejectedValue(dbError);

      await expect(
        setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Raw query failed');
    });

    it('should throw error when db.query fails', async () => {
      const queryError = new Error('Query execution failed');
      mockRequest.db = { query: jest.fn().mockRejectedValue(queryError) };

      await expect(
        setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Query execution failed');
    });

    it('should propagate original error after logging', async () => {
      const originalError = new Error('Connection timeout');
      mockDb.raw = jest.fn().mockRejectedValue(originalError);

      try {
        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBe(originalError);
      }
    });
  });

  describe('request mutation', () => {
    it('should set tenantId property on request object', async () => {
      mockRequest.user = { tenant_id: 'mutation-test' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('mutation-test');
      expect(mockRequest).toHaveProperty('tenantId', 'mutation-test');
    });

    it('should overwrite existing tenantId on request', async () => {
      mockRequest.tenantId = 'old-tenant';
      mockRequest.user = { tenant_id: 'new-tenant' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('new-tenant');
    });
  });

  describe('edge cases', () => {
    it('should handle UUID format tenant IDs', async () => {
      const uuidTenant = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.user = { tenant_id: uuidTenant };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(uuidTenant);
      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [uuidTenant]
      );
    });

    it('should handle numeric string tenant IDs', async () => {
      mockRequest.user = { tenant_id: '12345' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('12345');
    });

    it('should handle special characters in tenant ID', async () => {
      const specialTenant = 'tenant-with_special.chars';
      mockRequest.user = { tenant_id: specialTenant };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(specialTenant);
    });
  });
});
