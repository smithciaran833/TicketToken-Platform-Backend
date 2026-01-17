import {
  setTenantContext,
  requireTenantContext,
  runWithTenantContext,
  getCurrentTenantContext,
  getCurrentTenantId,
  getTenantCacheKey
} from '../../../src/middleware/tenant-context';
import { db } from '../../../src/config/database';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/config/logger');

describe('Tenant Context Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      url: '/api/v1/notifications',
      method: 'GET',
      headers: {},
      user: undefined,
      id: 'req-123',
      ip: '127.0.0.1',
      tenantId: undefined,
      tenantContext: undefined
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    (db.raw as jest.Mock).mockResolvedValue(undefined);
  });

  describe('setTenantContext', () => {
    describe('Exempt Routes', () => {
      it('should skip tenant check for /health', async () => {
        mockRequest.url = '/health';

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBeUndefined();
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should skip tenant check for /health/ready', async () => {
        mockRequest.url = '/health/ready';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should skip tenant check for /health/live', async () => {
        mockRequest.url = '/health/live';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should skip tenant check for /health/db', async () => {
        mockRequest.url = '/health/db';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should skip tenant check for /metrics', async () => {
        mockRequest.url = '/metrics';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should skip tenant check for /api/v1/internal routes', async () => {
        mockRequest.url = '/api/v1/internal/status';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should skip tenant check for /api/v1/webhooks', async () => {
        mockRequest.url = '/api/v1/webhooks/sendgrid';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should handle query parameters in exempt routes', async () => {
        mockRequest.url = '/health?check=db';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('Extract Tenant ID from JWT', () => {
      it('should extract tenant ID from user.tenantId', async () => {
        mockRequest.user = {
          id: 'user-123',
          tenantId: validTenantId
        };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should extract tenant ID from user.tenant_id (snake_case)', async () => {
        mockRequest.user = {
          id: 'user-123',
          tenant_id: validTenantId
        };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });

      it('should prefer tenantId over tenant_id', async () => {
        mockRequest.user = {
          tenantId: validTenantId,
          tenant_id: '00000000-0000-0000-0000-000000000000'
        };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });
    });

    describe('Extract Tenant ID from Header', () => {
      it('should extract tenant ID from x-tenant-id header', async () => {
        mockRequest.headers['x-tenant-id'] = validTenantId;

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });

      it('should prefer JWT over header', async () => {
        mockRequest.user = { tenantId: validTenantId };
        mockRequest.headers['x-tenant-id'] = '00000000-0000-0000-0000-000000000000';

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });

      it('should use header when JWT missing', async () => {
        mockRequest.headers['x-tenant-id'] = validTenantId;

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });

      it('should ignore empty string header', async () => {
        mockRequest.headers['x-tenant-id'] = '';

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'MISSING_TENANT_ID'
          })
        );
      });
    });

    describe('Extract Tenant ID from Query Parameter', () => {
      it('should extract tenant ID from query.tenantId', async () => {
        mockRequest.query = { tenantId: validTenantId };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });

      it('should prefer JWT over query', async () => {
        mockRequest.user = { tenantId: validTenantId };
        mockRequest.query = { tenantId: '00000000-0000-0000-0000-000000000000' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });

      it('should prefer header over query', async () => {
        mockRequest.headers['x-tenant-id'] = validTenantId;
        mockRequest.query = { tenantId: '00000000-0000-0000-0000-000000000000' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
      });
    });

    describe('AUDIT FIX MT-1, MT-2: No Default Fallback', () => {
      it('should reject request without tenant ID (AUDIT FIX)', async () => {
        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Bad Request',
          message: 'Tenant ID is required. Include tenant_id in JWT claims or x-tenant-id header.',
          code: 'MISSING_TENANT_ID'
        });
      });

      it('should log warning when tenant ID missing', async () => {
        await setTenantContext(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith('Request rejected: Missing tenant ID', {
          path: '/api/v1/notifications',
          method: 'GET',
          userId: undefined,
          ip: '127.0.0.1'
        });
      });

      it('should NOT use default tenant (security requirement)', async () => {
        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBeUndefined();
        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('UUID Format Validation (AUDIT FIX MT-2)', () => {
      it('should accept valid UUID v4', async () => {
        mockRequest.user = { tenantId: validTenantId };

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
        expect(mockRequest.tenantId).toBe(validTenantId);
      });

      it('should reject invalid UUID format', async () => {
        mockRequest.user = { tenantId: 'not-a-uuid' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Bad Request',
          message: 'Invalid tenant ID format. Must be a valid UUID v4.',
          code: 'INVALID_TENANT_ID'
        });
      });

      it('should reject UUID v1 format', async () => {
        mockRequest.user = { tenantId: 'a0eebc99-9c0b-1ef8-bb6d-6bb9bd380a11' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject UUID v3 format', async () => {
        mockRequest.user = { tenantId: 'a0eebc99-9c0b-3ef8-bb6d-6bb9bd380a11' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject malformed UUID', async () => {
        mockRequest.user = { tenantId: '550e8400-e29b-41d4-a716' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject numeric tenant ID', async () => {
        mockRequest.user = { tenantId: '12345' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should log warning for invalid format', async () => {
        mockRequest.user = { tenantId: 'invalid' };

        await setTenantContext(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith('Request rejected: Invalid tenant ID format', {
          tenantId: 'invalid',
          path: '/api/v1/notifications',
          method: 'GET'
        });
      });

      it('should accept uppercase UUID', async () => {
        mockRequest.user = { tenantId: '550E8400-E29B-41D4-A716-446655440000' };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe('550E8400-E29B-41D4-A716-446655440000');
        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('Tenant Context Creation', () => {
      it('should create tenant context with all fields', async () => {
        mockRequest.user = {
          id: 'user-123',
          tenantId: validTenantId,
          role: 'admin'
        };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantContext).toEqual({
          tenantId: validTenantId,
          userId: 'user-123',
          userRole: 'admin',
          requestId: 'req-123'
        });
      });

      it('should create context without userId', async () => {
        mockRequest.user = { tenantId: validTenantId };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantContext?.userId).toBeUndefined();
      });

      it('should create context without role', async () => {
        mockRequest.user = {
          id: 'user-123',
          tenantId: validTenantId
        };

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantContext?.userRole).toBeUndefined();
      });
    });

    describe('PostgreSQL RLS Context', () => {
      it('should set PostgreSQL session variable', async () => {
        mockRequest.user = { tenantId: validTenantId };

        await setTenantContext(mockRequest, mockReply);

        expect(db.raw).toHaveBeenCalledWith(
          'SET LOCAL app.current_tenant_id = ?',
          [validTenantId]
        );
      });

      it('should log error but continue on RLS failure', async () => {
        mockRequest.user = { tenantId: validTenantId };
        const error = new Error('Database error');
        (db.raw as jest.Mock).mockRejectedValue(error);

        await setTenantContext(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Failed to set RLS context', {
          error,
          tenantId: validTenantId
        });
        expect(mockRequest.tenantId).toBe(validTenantId);
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should not fail request when RLS setting fails', async () => {
        mockRequest.user = { tenantId: validTenantId };
        (db.raw as jest.Mock).mockRejectedValue(new Error('RLS error'));

        await setTenantContext(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(validTenantId);
        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('Debug Logging', () => {
      it('should log tenant context set successfully', async () => {
        mockRequest.user = { tenantId: validTenantId };

        await setTenantContext(mockRequest, mockReply);

        expect(logger.debug).toHaveBeenCalledWith('Tenant context set', {
          tenantId: validTenantId,
          path: '/api/v1/notifications'
        });
      });
    });
  });

  describe('requireTenantContext', () => {
    it('should pass when tenant ID present', async () => {
      mockRequest.tenantId = validTenantId;

      await requireTenantContext(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should return 401 when tenant ID missing', async () => {
      await requireTenantContext(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Tenant context required for this endpoint',
        code: 'TENANT_REQUIRED'
      });
    });

    it('should check for undefined tenant ID', async () => {
      mockRequest.tenantId = undefined;

      await requireTenantContext(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should accept empty string as falsy', async () => {
      mockRequest.tenantId = '';

      await requireTenantContext(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('AsyncLocalStorage - runWithTenantContext (AUDIT FIX MT-H3)', () => {
    it('should run function with tenant context', () => {
      const context = {
        tenantId: validTenantId,
        userId: 'user-123',
        userRole: 'admin',
        requestId: 'req-456'
      };

      const result = runWithTenantContext(context, () => {
        return getCurrentTenantContext();
      });

      expect(result).toEqual(context);
    });

    it('should return function result', () => {
      const context = { tenantId: validTenantId };

      const result = runWithTenantContext(context, () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should isolate context between calls', () => {
      const context1 = { tenantId: validTenantId };
      const context2 = { tenantId: '00000000-0000-0000-0000-000000000000' };

      const result1 = runWithTenantContext(context1, () => getCurrentTenantId());
      const result2 = runWithTenantContext(context2, () => getCurrentTenantId());

      expect(result1).toBe(validTenantId);
      expect(result2).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('should handle async functions', async () => {
      const context = { tenantId: validTenantId };

      const result = await runWithTenantContext(context, async () => {
        await new Promise(resolve => setImmediate(resolve));
        return getCurrentTenantId();
      });

      expect(result).toBe(validTenantId);
    });
  });

  describe('getCurrentTenantContext (AUDIT FIX MT-H3)', () => {
    it('should return undefined when not in context', () => {
      const result = getCurrentTenantContext();

      expect(result).toBeUndefined();
    });

    it('should return context when in AsyncLocalStorage', () => {
      const context = {
        tenantId: validTenantId,
        userId: 'user-123'
      };

      const result = runWithTenantContext(context, () => {
        return getCurrentTenantContext();
      });

      expect(result).toEqual(context);
    });
  });

  describe('getCurrentTenantId (AUDIT FIX MT-H3)', () => {
    it('should return undefined when not in context', () => {
      const result = getCurrentTenantId();

      expect(result).toBeUndefined();
    });

    it('should return tenant ID when in context', () => {
      const context = { tenantId: validTenantId };

      const result = runWithTenantContext(context, () => {
        return getCurrentTenantId();
      });

      expect(result).toBe(validTenantId);
    });
  });

  describe('getTenantCacheKey', () => {
    it('should generate cache key with explicit tenant ID', () => {
      const key = getTenantCacheKey('user:profile', validTenantId);

      expect(key).toBe(`tenant:${validTenantId}:user:profile`);
    });

    it('should generate cache key from context', () => {
      const context = { tenantId: validTenantId };

      const key = runWithTenantContext(context, () => {
        return getTenantCacheKey('notifications');
      });

      expect(key).toBe(`tenant:${validTenantId}:notifications`);
    });

    it('should throw when no tenant context available', () => {
      expect(() => {
        getTenantCacheKey('test');
      }).toThrow('No tenant context available for cache key generation');
    });

    it('should handle complex keys', () => {
      const key = getTenantCacheKey('user:123:settings:email', validTenantId);

      expect(key).toBe(`tenant:${validTenantId}:user:123:settings:email`);
    });

    it('should handle empty key', () => {
      const key = getTenantCacheKey('', validTenantId);

      expect(key).toBe(`tenant:${validTenantId}:`);
    });
  });

  describe('Security - Multi-Tenant Isolation', () => {
    it('should prevent cross-tenant access without tenant ID', async () => {
      await setTenantContext(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should enforce strict tenant validation', async () => {
      mockRequest.user = { tenantId: 'malicious-id' };

      await setTenantContext(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should set RLS for database-level isolation', async () => {
      mockRequest.user = { tenantId: validTenantId };

      await setTenantContext(mockRequest, mockReply);

      expect(db.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [validTenantId]
      );
    });
  });
});
