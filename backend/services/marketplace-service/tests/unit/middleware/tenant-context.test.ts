/**
 * Unit Tests for Tenant Context Middleware
 * Tests tenant ID extraction, validation, and context propagation
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => mockRedis
}));

// Mock database
const mockDbQuery = {
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  insert: jest.fn()
};

jest.mock('../../../src/config/database', () => {
  const mockKnex = jest.fn(() => mockDbQuery);
  return mockKnex;
});

// Helper to create mock request
const createMockRequest = (options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  user?: any;
  log?: any;
}) => ({
  url: options.url || '/api/v1/listings',
  method: options.method || 'GET',
  headers: options.headers || {},
  query: options.query || {},
  user: options.user,
  log: options.log || {
    child: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
});

// Helper to create mock reply
const createMockReply = () => {
  const reply: any = {
    statusCode: 200,
    body: null
  };
  reply.status = jest.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = jest.fn((body: any) => {
    reply.body = body;
    return reply;
  });
  return reply;
};

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('Tenant Context Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockDbQuery.first.mockResolvedValue({ id: VALID_UUID, status: 'active', name: 'Test Tenant' });
  });

  describe('tenantContextMiddleware', () => {
    it('should allow exempt routes without tenant ID', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({ url: '/health' });
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should allow /metrics route', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({ url: '/metrics' });
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
    });

    it('should allow internal routes', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({ url: '/api/v1/internal/test' });
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
    });

    it('should reject request without tenant ID', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({ url: '/api/v1/listings' });
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.body.code).toBe('MISSING_TENANT_ID');
    });

    it('should extract tenant ID from JWT user.tenantId', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        user: { id: 'user-123', tenantId: VALID_UUID }
      }) as any;
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
      expect(request.tenantId).toBe(VALID_UUID);
    });

    it('should extract tenant ID from JWT user.tenant_id', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        user: { id: 'user-123', tenant_id: VALID_UUID }
      }) as any;
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
      expect(request.tenantId).toBe(VALID_UUID);
    });

    it('should extract tenant ID from x-tenant-id header', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        headers: { 'x-tenant-id': VALID_UUID }
      }) as any;
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
      expect(request.tenantId).toBe(VALID_UUID);
    });

    it('should extract tenant ID from query parameter', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings?tenantId=' + VALID_UUID,
        query: { tenantId: VALID_UUID }
      }) as any;
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
      expect(request.tenantId).toBe(VALID_UUID);
    });

    it('should reject invalid UUID format', async () => {
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        headers: { 'x-tenant-id': 'invalid-uuid' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.body.code).toBe('INVALID_TENANT_ID');
    });

    it('should use cache for tenant validation', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ id: VALID_UUID, status: 'active' }));
      
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        headers: { 'x-tenant-id': VALID_UUID }
      }) as any;
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockDbQuery.first).not.toHaveBeenCalled();
      expect(done).toHaveBeenCalled();
    });

    it('should cache tenant after database lookup', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDbQuery.first.mockResolvedValue({ id: VALID_UUID, status: 'active', name: 'Test' });
      
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        headers: { 'x-tenant-id': VALID_UUID }
      }) as any;
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should reject inactive tenant', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ id: VALID_UUID, status: 'inactive' }));
      
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        headers: { 'x-tenant-id': VALID_UUID }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.body.code).toBe('INVALID_TENANT');
    });

    it('should reject non-existent tenant', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDbQuery.first.mockResolvedValue(null);
      
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        headers: { 'x-tenant-id': VALID_UUID }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should set tenant context on request', async () => {
      mockDbQuery.first.mockResolvedValue({
        id: VALID_UUID,
        status: 'active',
        name: 'Test Tenant',
        settings: { feature: true }
      });
      
      const { tenantContextMiddleware } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        user: { id: 'user-123', tenantId: VALID_UUID, role: 'admin' }
      }) as any;
      const reply = createMockReply();
      const done = jest.fn();
      
      await tenantContextMiddleware(request, reply, done);
      
      expect(request.tenantContext).toBeDefined();
      expect(request.tenantContext.tenantId).toBe(VALID_UUID);
      expect(request.tenantContext.tenantName).toBe('Test Tenant');
      expect(request.tenantContext.userId).toBe('user-123');
    });
  });

  describe('runWithTenantContext', () => {
    it('should run function with tenant context', () => {
      const { runWithTenantContext, getCurrentTenantId } = require('../../../src/middleware/tenant-context');
      
      const context = { tenantId: VALID_UUID };
      let capturedTenantId: string | undefined;
      
      runWithTenantContext(context, () => {
        capturedTenantId = getCurrentTenantId();
      });
      
      expect(capturedTenantId).toBe(VALID_UUID);
    });

    it('should return undefined outside context', () => {
      const { getCurrentTenantId } = require('../../../src/middleware/tenant-context');
      
      const result = getCurrentTenantId();
      
      expect(result).toBeUndefined();
    });
  });

  describe('getCurrentTenantContext', () => {
    it('should return full context', () => {
      const { runWithTenantContext, getCurrentTenantContext } = require('../../../src/middleware/tenant-context');
      
      const context = {
        tenantId: VALID_UUID,
        tenantName: 'Test',
        userId: 'user-123'
      };
      let capturedContext: any;
      
      runWithTenantContext(context, () => {
        capturedContext = getCurrentTenantContext();
      });
      
      expect(capturedContext.tenantId).toBe(VALID_UUID);
      expect(capturedContext.tenantName).toBe('Test');
      expect(capturedContext.userId).toBe('user-123');
    });
  });

  describe('tenantScopedQuery', () => {
    it('should throw without tenant context', () => {
      const { tenantScopedQuery } = require('../../../src/middleware/tenant-context');
      
      expect(() => tenantScopedQuery('listings'))
        .toThrow('No tenant context available');
    });
  });

  describe('insertWithTenant', () => {
    it('should throw without tenant context', () => {
      const { insertWithTenant } = require('../../../src/middleware/tenant-context');
      
      expect(() => insertWithTenant('listings', { name: 'test' }))
        .toThrow('No tenant context available');
    });
  });

  describe('ensureTenantOwnership', () => {
    it('should throw without tenant context', async () => {
      const { ensureTenantOwnership } = require('../../../src/middleware/tenant-context');
      
      await expect(ensureTenantOwnership('listings', 'record-123'))
        .rejects.toThrow('No tenant context available');
    });
  });

  describe('clearTenantCache', () => {
    it('should clear specific tenant cache', async () => {
      const { clearTenantCache } = require('../../../src/middleware/tenant-context');
      
      await clearTenantCache(VALID_UUID);
      
      expect(mockRedis.del).toHaveBeenCalledWith(`tenant:valid:${VALID_UUID}`);
    });

    it('should clear all tenant cache', async () => {
      mockRedis.keys.mockResolvedValue(['tenant:valid:a', 'tenant:valid:b']);
      
      const { clearTenantCache } = require('../../../src/middleware/tenant-context');
      
      await clearTenantCache();
      
      expect(mockRedis.keys).toHaveBeenCalledWith('tenant:valid:*');
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle empty cache', async () => {
      mockRedis.keys.mockResolvedValue([]);
      
      const { clearTenantCache } = require('../../../src/middleware/tenant-context');
      
      await clearTenantCache();
      
      // Should not throw
    });
  });

  describe('tenantConfig', () => {
    it('should export configuration', () => {
      const { tenantConfig } = require('../../../src/middleware/tenant-context');
      
      expect(tenantConfig.TENANT_CACHE_TTL).toBe(300);
      expect(tenantConfig.EXEMPT_ROUTES).toBeDefined();
      expect(tenantConfig.EXEMPT_ROUTES.has('/health')).toBe(true);
    });
  });

  describe('setTenantContext', () => {
    it('should work as async wrapper', async () => {
      mockDbQuery.first.mockResolvedValue({ id: VALID_UUID, status: 'active' });
      
      const { setTenantContext } = require('../../../src/middleware/tenant-context');
      
      const request = createMockRequest({
        url: '/api/v1/listings',
        headers: { 'x-tenant-id': VALID_UUID }
      }) as any;
      const reply = createMockReply();
      
      await setTenantContext(request, reply);
      
      expect(request.tenantId).toBe(VALID_UUID);
    });
  });
});
