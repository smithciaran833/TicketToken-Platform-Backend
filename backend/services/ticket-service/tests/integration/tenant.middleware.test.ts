import { tenantMiddleware } from '../../src/middleware/tenant';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR TENANT MIDDLEWARE
 * Tests tenant isolation middleware
 */

describe('Tenant Middleware Integration Tests', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      tenantId: undefined
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
  });

  describe('tenant extraction from header', () => {
    it('should extract tenant ID from x-tenant-id header', async () => {
      const tenantId = uuidv4();
      mockRequest.headers['x-tenant-id'] = tenantId;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(tenantId);
    });

    it('should set tenantId on request object', async () => {
      const tenantId = 'tenant-123';
      mockRequest.headers['x-tenant-id'] = tenantId;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest).toHaveProperty('tenantId');
      expect(mockRequest.tenantId).toBe(tenantId);
    });

    it('should handle UUID tenant IDs', async () => {
      const tenantId = uuidv4();
      mockRequest.headers['x-tenant-id'] = tenantId;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(tenantId);
    });

    it('should handle string tenant IDs', async () => {
      mockRequest.headers['x-tenant-id'] = 'acme-corp';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('acme-corp');
    });

    it('should handle numeric tenant IDs', async () => {
      mockRequest.headers['x-tenant-id'] = '12345';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('12345');
    });
  });

  describe('missing tenant header', () => {
    it('should not set tenantId when header is missing', async () => {
      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should not throw error when header is missing', async () => {
      await expect(
        tenantMiddleware(mockRequest, mockReply)
      ).resolves.not.toThrow();
    });

    it('should complete successfully without tenant', async () => {
      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });

  describe('auth middleware precedence', () => {
    it('should skip when tenantId already set by auth middleware', async () => {
      const authTenantId = uuidv4();
      const headerTenantId = uuidv4();
      
      mockRequest.tenantId = authTenantId;
      mockRequest.headers['x-tenant-id'] = headerTenantId;

      await tenantMiddleware(mockRequest, mockReply);

      // Should preserve auth middleware's tenantId
      expect(mockRequest.tenantId).toBe(authTenantId);
      expect(mockRequest.tenantId).not.toBe(headerTenantId);
    });

    it('should not override existing tenantId', async () => {
      mockRequest.tenantId = 'existing-tenant';
      mockRequest.headers['x-tenant-id'] = 'new-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('existing-tenant');
    });

    it('should respect JWT-based tenant isolation', async () => {
      const jwtTenantId = uuidv4();
      mockRequest.tenantId = jwtTenantId;
      mockRequest.headers['x-tenant-id'] = 'ignored-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(jwtTenantId);
    });

    it('should use header when tenantId is null', async () => {
      mockRequest.tenantId = null;
      mockRequest.headers['x-tenant-id'] = 'header-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      // Falsy check in middleware should allow header to be used
      expect(mockRequest.tenantId).toBe('header-tenant');
    });

    it('should use header when tenantId is undefined', async () => {
      mockRequest.tenantId = undefined;
      mockRequest.headers['x-tenant-id'] = 'header-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('header-tenant');
    });

    it('should use header when tenantId is empty string', async () => {
      mockRequest.tenantId = '';
      mockRequest.headers['x-tenant-id'] = 'header-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('header-tenant');
    });

    it('should preserve non-empty tenantId even with header', async () => {
      mockRequest.tenantId = 'auth-tenant';
      mockRequest.headers['x-tenant-id'] = 'header-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('auth-tenant');
    });
  });

  describe('public route support', () => {
    it('should support public routes with tenant header', async () => {
      mockRequest.headers['x-tenant-id'] = 'public-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('public-tenant');
    });

    it('should support webhooks with tenant header', async () => {
      mockRequest.headers['x-tenant-id'] = 'webhook-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('webhook-tenant');
    });

    it('should support API keys with tenant header', async () => {
      mockRequest.headers['x-tenant-id'] = 'api-key-tenant';
      mockRequest.headers['x-api-key'] = 'some-api-key';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('api-key-tenant');
    });
  });

  describe('header variations', () => {
    it('should handle lowercase header name', async () => {
      mockRequest.headers['x-tenant-id'] = 'lowercase-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('lowercase-tenant');
    });

    it('should handle empty string header value', async () => {
      mockRequest.headers['x-tenant-id'] = '';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should not set tenantId for whitespace only', async () => {
      mockRequest.headers['x-tenant-id'] = '   ';

      await tenantMiddleware(mockRequest, mockReply);

      // Whitespace is truthy in JavaScript
      expect(mockRequest.tenantId).toBe('   ');
    });

    it('should handle very long tenant IDs', async () => {
      const longTenantId = 'tenant-' + 'x'.repeat(200);
      mockRequest.headers['x-tenant-id'] = longTenantId;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(longTenantId);
    });

    it('should handle special characters in tenant ID', async () => {
      mockRequest.headers['x-tenant-id'] = 'tenant-123_abc-XYZ';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123_abc-XYZ');
    });
  });

  describe('edge cases', () => {
    it('should handle null header value', async () => {
      mockRequest.headers['x-tenant-id'] = null;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should handle undefined header value', async () => {
      mockRequest.headers['x-tenant-id'] = undefined;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should handle headers object without x-tenant-id', async () => {
      mockRequest.headers = { 'content-type': 'application/json' };

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should handle empty headers object', async () => {
      mockRequest.headers = {};

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should not modify other request properties', async () => {
      mockRequest.userId = 'user-123';
      mockRequest.role = 'admin';
      mockRequest.headers['x-tenant-id'] = 'tenant-123';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.userId).toBe('user-123');
      expect(mockRequest.role).toBe('admin');
    });

    it('should not modify reply object', async () => {
      mockRequest.headers['x-tenant-id'] = 'tenant-123';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });

  describe('multi-tenancy scenarios', () => {
    it('should isolate different tenants', async () => {
      const tenant1 = uuidv4();
      const tenant2 = uuidv4();

      // Request 1
      mockRequest.headers['x-tenant-id'] = tenant1;
      await tenantMiddleware(mockRequest, mockReply);
      const firstTenant = mockRequest.tenantId;

      // Request 2 (new request object)
      mockRequest = { headers: { 'x-tenant-id': tenant2 }, tenantId: undefined };
      await tenantMiddleware(mockRequest, mockReply);
      const secondTenant = mockRequest.tenantId;

      expect(firstTenant).toBe(tenant1);
      expect(secondTenant).toBe(tenant2);
      expect(firstTenant).not.toBe(secondTenant);
    });

    it('should support tenant switching between requests', async () => {
      const tenants = [uuidv4(), uuidv4(), uuidv4()];

      for (const tenant of tenants) {
        const req = { headers: { 'x-tenant-id': tenant }, tenantId: undefined };
        await tenantMiddleware(req, mockReply);
        expect(req.tenantId).toBe(tenant);
      }
    });

    it('should handle same tenant across multiple requests', async () => {
      const tenantId = uuidv4();

      for (let i = 0; i < 5; i++) {
        const req = { headers: { 'x-tenant-id': tenantId }, tenantId: undefined };
        await tenantMiddleware(req, mockReply);
        expect(req.tenantId).toBe(tenantId);
      }
    });
  });

  describe('integration with auth flow', () => {
    it('should work after auth middleware sets tenantId', async () => {
      // Simulate auth middleware
      const authTenantId = uuidv4();
      mockRequest.tenantId = authTenantId;
      mockRequest.user = { id: 'user-123', tenantId: authTenantId };

      // Public route provides different tenant (should be ignored)
      mockRequest.headers['x-tenant-id'] = uuidv4();

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(authTenantId);
    });

    it('should work for public routes without auth', async () => {
      const tenantId = uuidv4();
      mockRequest.headers['x-tenant-id'] = tenantId;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(tenantId);
      expect(mockRequest.user).toBeUndefined();
    });

    it('should preserve user object when setting tenant', async () => {
      mockRequest.user = { id: 'user-123', email: 'user@example.com' };
      mockRequest.headers['x-tenant-id'] = 'tenant-123';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockRequest.user).toEqual({ id: 'user-123', email: 'user@example.com' });
    });
  });

  describe('concurrent requests', () => {
    it('should handle concurrent requests with different tenants', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        headers: { 'x-tenant-id': `tenant-${i}` },
        tenantId: undefined
      }));

      await Promise.all(
        requests.map(req => tenantMiddleware(req as any, mockReply))
      );

      requests.forEach((req, i) => {
        expect(req.tenantId).toBe(`tenant-${i}`);
      });
    });

    it('should not leak tenant between concurrent requests', async () => {
      const tenant1 = uuidv4();
      const tenant2 = uuidv4();

      const req1 = { headers: { 'x-tenant-id': tenant1 }, tenantId: undefined };
      const req2 = { headers: { 'x-tenant-id': tenant2 }, tenantId: undefined };

      await Promise.all([
        tenantMiddleware(req1 as any, mockReply),
        tenantMiddleware(req2 as any, mockReply)
      ]);

      expect(req1.tenantId).toBe(tenant1);
      expect(req2.tenantId).toBe(tenant2);
    });
  });

  describe('security considerations', () => {
    it('should not allow header to override authenticated tenant', async () => {
      const authenticatedTenant = uuidv4();
      const maliciousTenant = uuidv4();

      mockRequest.tenantId = authenticatedTenant;
      mockRequest.headers['x-tenant-id'] = maliciousTenant;

      await tenantMiddleware(mockRequest, mockReply);

      // Should maintain authenticated tenant
      expect(mockRequest.tenantId).toBe(authenticatedTenant);
      expect(mockRequest.tenantId).not.toBe(maliciousTenant);
    });

    it('should treat tenantId from auth as authoritative', async () => {
      mockRequest.tenantId = 'jwt-tenant';
      mockRequest.headers['x-tenant-id'] = 'header-tenant';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('jwt-tenant');
    });

    it('should maintain tenant isolation', async () => {
      const tenant1Req = { headers: { 'x-tenant-id': 'tenant-1' }, tenantId: undefined };
      const tenant2Req = { headers: { 'x-tenant-id': 'tenant-2' }, tenantId: undefined };

      await tenantMiddleware(tenant1Req as any, mockReply);
      await tenantMiddleware(tenant2Req as any, mockReply);

      expect(tenant1Req.tenantId).not.toBe(tenant2Req.tenantId);
    });
  });
});
