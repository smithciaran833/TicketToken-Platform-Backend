import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import {
  setTenantContext,
  requireTenantContext,
  getCurrentTenantContext,
  getCurrentTenantId,
  getTenantCacheKey,
  runWithTenantContext,
  withTenantContext,
  tenantConfig
} from '../../../src/middleware/tenant-context';

// Mock dependencies
jest.mock('../../../src/utils/logger');

describe('Tenant Context Middleware - Unit Tests', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockPool: Partial<Pool>;
  let sendMock: jest.Mock;
  let statusMock: jest.Mock;
  let queryMock: jest.Mock;

  const validTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const validUserId = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    sendMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();
    queryMock = jest.fn().mockResolvedValue({ rows: [] });

    mockReply = {
      status: statusMock,
      send: sendMock
    };

    mockPool = {
      query: queryMock
    };

    mockRequest = {
      url: '/api/v1/transfers',
      method: 'GET',
      headers: {},
      query: {},
      id: 'request-123',
      ip: '127.0.0.1',
      log: {
        child: jest.fn().mockReturnThis()
      } as any,
      server: {} as any
    };
  });

  describe('Tenant ID Extraction', () => {
    it('should extract tenant ID from JWT user claims (tenantId)', async () => {
      mockRequest.user = { id: validUserId, tenantId: validTenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should extract tenant ID from JWT user claims (tenant_id)', async () => {
      mockRequest.user = { id: validUserId, tenant_id: validTenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should extract tenant ID from x-tenant-id header', async () => {
      mockRequest.headers = { 'x-tenant-id': validTenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should extract tenant ID from query parameter', async () => {
      mockRequest.query = { tenantId: validTenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should prioritize JWT over header', async () => {
      const jwtTenantId = '550e8400-e29b-41d4-a716-446655440001';
      const headerTenantId = '550e8400-e29b-41d4-a716-446655440002';

      mockRequest.user = { tenantId: jwtTenantId };
      mockRequest.headers = { 'x-tenant-id': headerTenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(jwtTenantId);
    });

    it('should prioritize header over query param', async () => {
      const headerTenantId = '550e8400-e29b-41d4-a716-446655440001';
      const queryTenantId = '550e8400-e29b-41d4-a716-446655440002';

      mockRequest.headers = { 'x-tenant-id': headerTenantId };
      mockRequest.query = { tenantId: queryTenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(headerTenantId);
    });
  });

  describe('Tenant ID Validation', () => {
    it('should reject request with missing tenant ID', async () => {
      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: expect.stringContaining('Tenant ID is required'),
          code: 'MISSING_TENANT_ID'
        })
      );
    });

    it('should reject invalid UUID format', async () => {
      mockRequest.headers = { 'x-tenant-id': 'not-a-uuid' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: expect.stringContaining('Invalid tenant ID format'),
          code: 'INVALID_TENANT_ID'
        })
      );
    });

    it('should accept valid UUID v4', async () => {
      const testCases = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      ];

      for (const uuid of testCases) {
        jest.clearAllMocks();
        mockRequest = {
          ...mockRequest,
          headers: { 'x-tenant-id': uuid },
          server: {} as any
        };

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(statusMock).not.toHaveBeenCalledWith(400);
        expect(mockRequest.tenantId).toBe(uuid);
      }
    });

    it('should reject empty string tenant ID', async () => {
      mockRequest.headers = { 'x-tenant-id': '' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MISSING_TENANT_ID'
        })
      );
    });

    it('should reject UUID v1', async () => {
      mockRequest.headers = { 'x-tenant-id': '6ba7b810-9dad-11d1-80b4-00c04fd430c8' };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should reject malformed UUIDs', async () => {
      const invalidUuids = [
        '550e8400-e29b-41d4-a716',
        '550e8400-e29b-41d4-a716-446655440000-extra',
        '550e8400e29b41d4a716446655440000',
        'ZZZZZZZZ-e29b-41d4-a716-446655440000'
      ];

      for (const uuid of invalidUuids) {
        jest.clearAllMocks();
        mockRequest = {
          ...mockRequest,
          headers: { 'x-tenant-id': uuid },
          server: {} as any
        };

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(statusMock).toHaveBeenCalledWith(400);
      }
    });
  });

  describe('Exempt Routes', () => {
    it('should allow health check routes without tenant ID', async () => {
      const exemptRoutes = [
        '/health',
        '/health/ready',
        '/health/live',
        '/health/db',
        '/metrics'
      ];

      for (const route of exemptRoutes) {
        jest.clearAllMocks();
        mockRequest.url = route;

        await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockRequest.tenantId).toBeUndefined();
      }
    });

    it('should allow internal API routes without tenant ID', async () => {
      mockRequest.url = '/api/v1/internal/something';

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle exempt routes with query strings', async () => {
      mockRequest.url = '/health?debug=true';

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should require tenant for non-exempt routes', async () => {
      mockRequest.url = '/api/v1/transfers';

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('Tenant Context Attachment', () => {
    beforeEach(() => {
      mockRequest.user = { id: validUserId, tenantId: validTenantId, role: 'admin' };
    });

    it('should attach tenantId to request', async () => {
      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should attach tenantContext with all fields', async () => {
      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext).toEqual({
        tenantId: validTenantId,
        userId: validUserId,
        userRole: 'admin',
        requestId: 'request-123'
      });
    });

    it('should handle missing user data gracefully', async () => {
      mockRequest.user = { tenantId: validTenantId };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext).toEqual({
        tenantId: validTenantId,
        userId: undefined,
        userRole: undefined,
        requestId: 'request-123'
      });
    });

    it('should enrich logger with tenant context', async () => {
      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.log.child).toHaveBeenCalledWith({ tenantId: validTenantId });
    });
  });

  describe('PostgreSQL RLS Context', () => {
    beforeEach(() => {
      mockRequest.user = { tenantId: validTenantId };
      (mockRequest as any).db = mockPool;
    });

    it('should set PostgreSQL session variable', async () => {
      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(queryMock).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = $1',
        [validTenantId]
      );
    });

    it('should not fail request if RLS context setting fails', async () => {
      queryMock.mockRejectedValue(new Error('DB error'));

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(statusMock).not.toHaveBeenCalledWith(400);
    });

    it('should skip RLS context if db not available', async () => {
      delete (mockRequest as any).db;
      mockRequest.server = {} as any;

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(queryMock).not.toHaveBeenCalled();
      expect(mockRequest.tenantId).toBe(validTenantId);
    });
  });

  describe('AsyncLocalStorage Functions', () => {
    const tenantContext = {
      tenantId: validTenantId,
      userId: validUserId,
      userRole: 'admin',
      requestId: 'test-request'
    };

    it('should get current tenant context within runWithTenantContext', () => {
      let contextInside: any;

      runWithTenantContext(tenantContext, () => {
        contextInside = getCurrentTenantContext();
      });

      expect(contextInside).toEqual(tenantContext);
    });

    it('should get current tenant ID within runWithTenantContext', () => {
      let tenantIdInside: any;

      runWithTenantContext(tenantContext, () => {
        tenantIdInside = getCurrentTenantId();
      });

      expect(tenantIdInside).toBe(validTenantId);
    });

    it('should return undefined outside of context', () => {
      const context = getCurrentTenantContext();
      const tenantId = getCurrentTenantId();

      expect(context).toBeUndefined();
      expect(tenantId).toBeUndefined();
    });

    it('should return value from function', () => {
      const result = runWithTenantContext(tenantContext, () => {
        return 'test-value';
      });

      expect(result).toBe('test-value');
    });

    it('should handle nested contexts', () => {
      const context1 = { ...tenantContext, tenantId: 'tenant-1' };
      const context2 = { ...tenantContext, tenantId: 'tenant-2' };

      runWithTenantContext(context1, () => {
        expect(getCurrentTenantId()).toBe('tenant-1');

        runWithTenantContext(context2, () => {
          expect(getCurrentTenantId()).toBe('tenant-2');
        });

        expect(getCurrentTenantId()).toBe('tenant-1');
      });
    });
  });

  describe('getTenantCacheKey', () => {
    it('should generate cache key with explicit tenant ID', () => {
      const key = getTenantCacheKey('user:123', validTenantId);

      expect(key).toBe(`tenant:${validTenantId}:user:123`);
    });

    it('should generate cache key from AsyncLocalStorage context', () => {
      const context = { tenantId: validTenantId };

      runWithTenantContext(context, () => {
        const key = getTenantCacheKey('session:abc');
        expect(key).toBe(`tenant:${validTenantId}:session:abc`);
      });
    });

    it('should throw error if no tenant context available', () => {
      expect(() => {
        getTenantCacheKey('user:123');
      }).toThrow('No tenant context available for cache key generation');
    });

    it('should handle complex cache keys', () => {
      const key = getTenantCacheKey('transfer:status:pending:page:1', validTenantId);

      expect(key).toBe(`tenant:${validTenantId}:transfer:status:pending:page:1`);
    });
  });

  describe('requireTenantContext', () => {
    it('should allow request with tenant context', async () => {
      mockRequest.tenantId = validTenantId;

      await requireTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject request without tenant context', async () => {
      await requireTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          code: 'TENANT_REQUIRED'
        })
      );
    });
  });

  describe('withTenantContext Wrapper', () => {
    it('should wrap handler with tenant context', async () => {
      let contextInHandler: any;

      const handler = async (req: FastifyRequest) => {
        contextInHandler = getCurrentTenantContext();
        return { success: true };
      };

      const wrappedHandler = withTenantContext(handler);

      mockRequest.tenantContext = {
        tenantId: validTenantId,
        userId: validUserId
      };

      await wrappedHandler(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(contextInHandler).toEqual(mockRequest.tenantContext);
    });

    it('should work without tenant context', async () => {
      let contextInHandler: any;

      const handler = async (req: FastifyRequest) => {
        contextInHandler = getCurrentTenantContext();
        return { success: true };
      };

      const wrappedHandler = withTenantContext(handler);

      await wrappedHandler(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(contextInHandler).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-insensitive UUID validation', async () => {
      const upperCaseUuid = '550E8400-E29B-41D4-A716-446655440000';
      mockRequest.headers = { 'x-tenant-id': upperCaseUuid };

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(upperCaseUuid);
      expect(statusMock).not.toHaveBeenCalledWith(400);
    });

    it('should handle URLs with trailing slashes', async () => {
      mockRequest.url = '/health/';

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle URL with fragments (requires tenant)', async () => {
      mockRequest.url = '/api/v1/transfers#section';

      await setTenantContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // This is not a health route, so it requires a tenant
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should handle concurrent requests with different tenants', async () => {
      const tenant1 = '550e8400-e29b-41d4-a716-446655440001';
      const tenant2 = '550e8400-e29b-41d4-a716-446655440002';

      const req1 = {
        ...mockRequest,
        headers: { 'x-tenant-id': tenant1 },
        server: {} as any
      };
      const req2 = {
        ...mockRequest,
        headers: { 'x-tenant-id': tenant2 },
        server: {} as any
      };

      await Promise.all([
        setTenantContext(req1 as FastifyRequest, mockReply as FastifyReply),
        setTenantContext(req2 as FastifyRequest, mockReply as FastifyReply)
      ]);

      expect(req1.tenantId).toBe(tenant1);
      expect(req2.tenantId).toBe(tenant2);
    });
  });

  describe('Configuration Export', () => {
    it('should export EXEMPT_ROUTES', () => {
      expect(tenantConfig.EXEMPT_ROUTES).toBeInstanceOf(Set);
      expect(tenantConfig.EXEMPT_ROUTES.has('/health')).toBe(true);
    });

    it('should export UUID_REGEX', () => {
      expect(tenantConfig.UUID_REGEX).toBeInstanceOf(RegExp);
      expect(tenantConfig.UUID_REGEX.test(validTenantId)).toBe(true);
    });
  });
});
