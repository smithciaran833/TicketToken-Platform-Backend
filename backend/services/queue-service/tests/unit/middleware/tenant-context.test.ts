// Mock database config BEFORE imports
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
};

jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn(() => mockPool),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { setTenantContext } from '../../../src/middleware/tenant-context';
import { getPool } from '../../../src/config/database.config';

describe('Tenant Context Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    mockRequest = {
      log: {
        debug: jest.fn(),
        error: jest.fn(),
      } as any,
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  describe('setTenantContext', () => {
    describe('tenant ID resolution', () => {
      it('should use user.tenant_id when available', async () => {
        (mockRequest as any).user = { tenant_id: 'tenant-from-user' };

        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockQuery).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = $1',
          ['tenant-from-user']
        );
        expect(mockRequest.tenantId).toBe('tenant-from-user');
      });

      it('should use user.tenantId when tenant_id not available', async () => {
        (mockRequest as any).user = { tenantId: 'tenant-camel-case' };

        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockQuery).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = $1',
          ['tenant-camel-case']
        );
        expect(mockRequest.tenantId).toBe('tenant-camel-case');
      });

      it('should prefer tenant_id over tenantId', async () => {
        (mockRequest as any).user = {
          tenant_id: 'snake-case-tenant',
          tenantId: 'camel-case-tenant',
        };

        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRequest.tenantId).toBe('snake-case-tenant');
      });

      it('should use request.tenantId when user not available', async () => {
        mockRequest.tenantId = 'request-tenant-id';

        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockQuery).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = $1',
          ['request-tenant-id']
        );
      });

      it('should use default tenant ID when no tenant info available', async () => {
        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockQuery).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = $1',
          [DEFAULT_TENANT_ID]
        );
        expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
      });

      it('should use default when user exists but has no tenant', async () => {
        (mockRequest as any).user = { userId: 'user-123' };

        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRequest.tenantId).toBe(DEFAULT_TENANT_ID);
      });
    });

    describe('database interaction', () => {
      it('should get pool from config', async () => {
        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(getPool).toHaveBeenCalled();
      });

      it('should execute SET LOCAL query', async () => {
        (mockRequest as any).user = { tenantId: 'test-tenant' };

        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockQuery).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = $1',
          ['test-tenant']
        );
      });
    });

    describe('logging', () => {
      it('should log debug message on success', async () => {
        mockRequest.tenantId = 'logged-tenant';

        await setTenantContext(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRequest.log!.debug).toHaveBeenCalledWith(
          { tenantId: 'logged-tenant' },
          'Tenant context set for queue service'
        );
      });

      it('should handle missing log object gracefully', async () => {
        mockRequest.log = undefined;

        await expect(
          setTenantContext(
            mockRequest as FastifyRequest,
            mockReply as FastifyReply
          )
        ).resolves.not.toThrow();
      });

      it('should handle log without debug method', async () => {
        mockRequest.log = {} as any;

        await expect(
          setTenantContext(
            mockRequest as FastifyRequest,
            mockReply as FastifyReply
          )
        ).resolves.not.toThrow();
      });
    });

    describe('error handling', () => {
      it('should throw error when database query fails', async () => {
        const dbError = new Error('Database connection failed');
        mockQuery.mockRejectedValue(dbError);

        await expect(
          setTenantContext(
            mockRequest as FastifyRequest,
            mockReply as FastifyReply
          )
        ).rejects.toThrow('Database connection failed');
      });

      it('should log error when database query fails', async () => {
        const dbError = new Error('Query timeout');
        mockQuery.mockRejectedValue(dbError);

        try {
          await setTenantContext(
            mockRequest as FastifyRequest,
            mockReply as FastifyReply
          );
        } catch {
          // Expected to throw
        }

        expect(mockRequest.log!.error).toHaveBeenCalledWith(
          { error: dbError, tenantId: DEFAULT_TENANT_ID },
          'Failed to set tenant context'
        );
      });

      it('should handle error logging when log is undefined', async () => {
        mockRequest.log = undefined;
        mockQuery.mockRejectedValue(new Error('DB error'));

        await expect(
          setTenantContext(
            mockRequest as FastifyRequest,
            mockReply as FastifyReply
          )
        ).rejects.toThrow('DB error');
      });
    });
  });
});
