/**
 * Unit Tests for Tenant Context Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock database pool
const mockPoolQuery = jest.fn<(query: string, params?: any[]) => Promise<any>>();
const mockClientQuery = jest.fn<(query: string, params?: any[]) => Promise<any>>();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn<() => Promise<any>>();

jest.mock('../../../src/config/database', () => ({
  getPool: jest.fn(() => ({
    query: mockPoolQuery,
    connect: mockPoolConnect
  }))
}));

// Mock errors
class MockForbiddenError extends Error {
  constructor(message: string, requestId?: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

jest.mock('../../../src/errors', () => ({
  ForbiddenError: MockForbiddenError
}));

describe('Tenant Context Middleware', () => {
  let tenantContext: any;
  let withTenantContext: any;
  let ensureTenantAccess: any;
  let requireTenantId: any;
  let logger: any;
  let getPool: any;

  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockResolvedValue({ rows: [] });
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease
    });

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const dbModule = await import('../../../src/config/database');
    getPool = dbModule.getPool;

    const module = await import('../../../src/middleware/tenant-context');
    tenantContext = module.tenantContext;
    withTenantContext = module.withTenantContext;
    ensureTenantAccess = module.ensureTenantAccess;
    requireTenantId = module.requireTenantId;

    mockReq = {
      headers: {},
      query: {},
      body: {},
      path: '/api/test',
      requestId: 'req-123',
      tenantId: undefined,
      userId: undefined,
      user: null
    };

    mockRes = {};

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tenantContext middleware', () => {
    it('should extract tenant ID from x-tenant-id header', async () => {
      mockReq.headers['x-tenant-id'] = 'tenant-123';

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('tenant-123');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should extract tenant ID from custom header', async () => {
      mockReq.headers['x-custom-tenant'] = 'custom-tenant';

      const middleware = tenantContext({ headerName: 'x-custom-tenant' });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('custom-tenant');
    });

    it('should extract tenant ID from query parameter', async () => {
      mockReq.query.tenantId = 'query-tenant';

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('query-tenant');
    });

    it('should extract tenant ID from body', async () => {
      mockReq.body = { tenantId: 'body-tenant' };

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('body-tenant');
    });

    it('should extract tenant ID from user object', async () => {
      mockReq.user = { tenantId: 'user-tenant' };

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('user-tenant');
    });

    it('should use default tenant when not provided', async () => {
      const middleware = tenantContext({ 
        required: false, 
        defaultTenant: 'default-tenant' 
      });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('default-tenant');
    });

    it('should throw ForbiddenError when required and missing', async () => {
      const middleware = tenantContext({ required: true });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(MockForbiddenError));
    });

    it('should not throw when not required and missing', async () => {
      const middleware = tenantContext({ required: false });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.tenantId).toBeUndefined();
    });

    it('should set database session variable', async () => {
      mockReq.headers['x-tenant-id'] = 'tenant-123';

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining(['tenant-123'])
      );
    });

    it('should sanitize tenant ID', async () => {
      mockReq.headers['x-tenant-id'] = 'tenant<script>alert(1)</script>123';

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('tenantscriptalert1script123');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ sanitized: 'tenantscriptalert1script123' }),
        'Tenant ID was sanitized'
      );
    });

    it('should allow alphanumeric, hyphens, and underscores', async () => {
      mockReq.headers['x-tenant-id'] = 'tenant_123-abc';

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('tenant_123-abc');
    });

    it('should truncate long tenant IDs', async () => {
      mockReq.headers['x-tenant-id'] = 'a'.repeat(150);

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId.length).toBe(100);
    });

    it('should prioritize header over query and body', async () => {
      mockReq.headers['x-tenant-id'] = 'header-tenant';
      mockReq.query.tenantId = 'query-tenant';
      mockReq.body = { tenantId: 'body-tenant' };

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.tenantId).toBe('header-tenant');
    });

    it('should log debug message on success', async () => {
      mockReq.headers['x-tenant-id'] = 'tenant-123';

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          path: '/api/test'
        }),
        'Tenant context set'
      );
    });

    it('should handle database error gracefully', async () => {
      mockReq.headers['x-tenant-id'] = 'tenant-123';
      mockPoolQuery.mockRejectedValue(new Error('DB connection failed'));

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'DB connection failed'
        }),
        'Failed to set tenant session variable'
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should pass userId to database session', async () => {
      mockReq.headers['x-tenant-id'] = 'tenant-123';
      mockReq.userId = 'user-456';

      const middleware = tenantContext();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining(['tenant-123', 'user-456'])
      );
    });
  });

  describe('withTenantContext', () => {
    it('should execute callback with tenant context', async () => {
      const callback = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      const result = await withTenantContext('tenant-123', callback);

      expect(result).toBe('result');
      expect(mockPoolConnect).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining(['tenant-123'])
      );
    });

    it('should release client after callback', async () => {
      const callback = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await withTenantContext('tenant-123', callback);

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should release client even on error', async () => {
      const callback = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Callback error'));

      await expect(withTenantContext('tenant-123', callback)).rejects.toThrow('Callback error');

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should pass userId when provided', async () => {
      const callback = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await withTenantContext('tenant-123', callback, 'user-456');

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        expect.arrayContaining(['tenant-123', 'user-456'])
      );
    });

    it('should use empty string for userId when not provided', async () => {
      const callback = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await withTenantContext('tenant-123', callback);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['tenant-123', ''])
      );
    });
  });

  describe('ensureTenantAccess', () => {
    it('should allow access when tenants match', () => {
      mockReq.tenantId = 'tenant-123';

      expect(() => ensureTenantAccess(mockReq, 'tenant-123')).not.toThrow();
    });

    it('should allow access when resource has no tenant', () => {
      mockReq.tenantId = 'tenant-123';

      expect(() => ensureTenantAccess(mockReq, undefined)).not.toThrow();
    });

    it('should throw when request has no tenant', () => {
      mockReq.tenantId = undefined;

      expect(() => ensureTenantAccess(mockReq, 'tenant-123')).toThrow(MockForbiddenError);
    });

    it('should throw when tenants do not match', () => {
      mockReq.tenantId = 'tenant-123';

      expect(() => ensureTenantAccess(mockReq, 'tenant-456')).toThrow(MockForbiddenError);
    });

    it('should log cross-tenant access attempt', () => {
      mockReq.tenantId = 'tenant-123';

      try {
        ensureTenantAccess(mockReq, 'tenant-456');
      } catch (e) {}

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestTenant: 'tenant-123',
          resourceTenant: 'tenant-456'
        }),
        'Cross-tenant access attempt blocked'
      );
    });
  });

  describe('requireTenantId', () => {
    it('should return tenant ID when present', () => {
      mockReq.tenantId = 'tenant-123';

      expect(requireTenantId(mockReq)).toBe('tenant-123');
    });

    it('should throw when tenant ID is missing', () => {
      mockReq.tenantId = undefined;

      expect(() => requireTenantId(mockReq)).toThrow(MockForbiddenError);
    });

    it('should throw when tenant ID is empty string', () => {
      mockReq.tenantId = '';

      expect(() => requireTenantId(mockReq)).toThrow(MockForbiddenError);
    });
  });

  describe('default export', () => {
    it('should export all functions', async () => {
      const module = await import('../../../src/middleware/tenant-context');

      expect(module.default).toHaveProperty('tenantContext');
      expect(module.default).toHaveProperty('withTenantContext');
      expect(module.default).toHaveProperty('ensureTenantAccess');
      expect(module.default).toHaveProperty('requireTenantId');
    });
  });
});
