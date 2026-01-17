// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/auth.middleware.ts
 */

jest.mock('jsonwebtoken');

describe('src/middleware/auth.middleware.ts - Comprehensive Unit Tests', () => {
  let jwt: any;
  let mockRequest: any;
  let mockReply: any;
  const originalEnv = process.env;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    console.warn = jest.fn();

    // Mock JWT
    jwt = require('jsonwebtoken');
    jwt.verify = jest.fn();

    // Mock request and reply
    mockRequest = {
      headers: {},
      user: undefined
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    console.warn = originalConsoleWarn;
  });

  // =============================================================================
  // authenticate() - Success Cases
  // =============================================================================

  describe('authenticate() - Success Cases', () => {
    it('should authenticate valid token', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      process.env.JWT_SECRET = 'test-secret';
      jwt.verify.mockReturnValue({
        userId: 'user-123',
        venueId: 'venue-1',
        role: 'admin',
        permissions: ['read', 'write']
      });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user.id).toBe('user-123');
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should extract token from Bearer header', async () => {
      mockRequest.headers.authorization = 'Bearer my-token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalledWith('my-token', 'secret');
    });

    it('should set user id from userId field', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-123' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.id).toBe('user-123');
    });

    it('should fallback to id field if userId not present', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'user-456' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.id).toBe('user-456');
    });

    it('should set venueId from decoded token', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1', venueId: 'venue-abc' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.venueId).toBe('venue-abc');
    });

    it('should set tenant_id from decoded token', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1', tenant_id: 'tenant-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.tenant_id).toBe('tenant-1');
    });

    it('should fallback tenant_id to venueId if not present', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1', venueId: 'venue-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.tenant_id).toBe('venue-1');
    });

    it('should set role from decoded token', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1', role: 'admin' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.role).toBe('admin');
    });

    it('should default role to user if not present', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.role).toBe('user');
    });

    it('should set permissions from decoded token', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1', permissions: ['read', 'write'] });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.permissions).toEqual(['read', 'write']);
    });

    it('should default permissions to empty array if not present', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ userId: 'user-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.permissions).toEqual([]);
    });
  });

  // =============================================================================
  // authenticate() - JWT_SECRET Handling
  // =============================================================================

  describe('authenticate() - JWT_SECRET Handling', () => {
    it('should use JWT_SECRET from environment', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'my-secret-key';
      jwt.verify.mockReturnValue({ userId: 'user-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalledWith('token', 'my-secret-key');
    });

    it('should throw in production without JWT_SECRET', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';

      const { authenticate } = require('../../../src/middleware/auth.middleware');

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should warn and use default in development', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';
      jwt.verify.mockReturnValue({ userId: 'user-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(console.warn).toHaveBeenCalledWith('WARNING: Using default JWT secret in development mode');
    });

    it('should use fallback secret in development', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';
      jwt.verify.mockReturnValue({ userId: 'user-1' });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalledWith('token', 'dev-secret-key-change-in-production');
    });
  });

  // =============================================================================
  // authenticate() - Error Cases
  // =============================================================================

  describe('authenticate() - Error Cases', () => {
    it('should return 401 when no token provided', async () => {
      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should return 401 when authorization header is empty', async () => {
      mockRequest.headers.authorization = '';

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle TokenExpiredError', async () => {
      mockRequest.headers.authorization = 'Bearer expired-token';
      process.env.JWT_SECRET = 'secret';
      
      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => { throw expiredError; });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Token expired'
      });
    });

    it('should return 401 for invalid token', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockImplementation(() => { throw new Error('Invalid'); });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
    });

    it('should handle malformed tokens', async () => {
      mockRequest.headers.authorization = 'Bearer malformed';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockImplementation(() => { throw new Error('Malformed JWT'); });

      const { authenticate } = require('../../../src/middleware/auth.middleware');
      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  // =============================================================================
  // authorize() - Success Cases
  // =============================================================================

  describe('authorize() - Success Cases', () => {
    it('should allow user with correct role', async () => {
      mockRequest.user = { id: 'user-1', role: 'admin' };

      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow user with one of multiple roles', async () => {
      mockRequest.user = { id: 'user-1', role: 'editor' };

      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin', 'editor', 'viewer');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should return a function', () => {
      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin');

      expect(typeof middleware).toBe('function');
    });

    it('should accept multiple role arguments', () => {
      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin', 'superadmin', 'moderator');

      expect(typeof middleware).toBe('function');
    });
  });

  // =============================================================================
  // authorize() - Error Cases
  // =============================================================================

  describe('authorize() - Error Cases', () => {
    it('should return 401 when user not authenticated', async () => {
      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should return 403 when user lacks required role', async () => {
      mockRequest.user = { id: 'user-1', role: 'user' };

      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Insufficient permissions'
      });
    });

    it('should return 403 when role not in allowed list', async () => {
      mockRequest.user = { id: 'user-1', role: 'guest' };

      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin', 'moderator', 'editor');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle missing role field', async () => {
      mockRequest.user = { id: 'user-1' };

      const { authorize } = require('../../../src/middleware/auth.middleware');
      const middleware = authorize('admin');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  // =============================================================================
  // requireTenant() - Success Cases
  // =============================================================================

  describe('requireTenant() - Success Cases', () => {
    it('should allow request with venueId', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'venue-123' };

      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow request with tenant_id', async () => {
      mockRequest.user = { id: 'user-1', tenant_id: 'tenant-123' };

      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow request with both venueId and tenant_id', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'venue-1', tenant_id: 'tenant-1' };

      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // requireTenant() - Error Cases
  // =============================================================================

  describe('requireTenant() - Error Cases', () => {
    it('should return 403 when no tenant context', async () => {
      mockRequest.user = { id: 'user-1', role: 'admin' };

      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Tenant context required'
      });
    });

    it('should return 403 when user not present', async () => {
      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when venueId and tenant_id are undefined', async () => {
      mockRequest.user = { id: 'user-1', venueId: undefined, tenant_id: undefined };

      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when venueId and tenant_id are null', async () => {
      mockRequest.user = { id: 'user-1', venueId: null, tenant_id: null };

      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when venueId and tenant_id are empty strings', async () => {
      mockRequest.user = { id: 'user-1', venueId: '', tenant_id: '' };

      const { requireTenant } = require('../../../src/middleware/auth.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export authenticate function', () => {
      const module = require('../../../src/middleware/auth.middleware');

      expect(module.authenticate).toBeDefined();
      expect(typeof module.authenticate).toBe('function');
    });

    it('should export authorize function', () => {
      const module = require('../../../src/middleware/auth.middleware');

      expect(module.authorize).toBeDefined();
      expect(typeof module.authorize).toBe('function');
    });

    it('should export requireTenant function', () => {
      const module = require('../../../src/middleware/auth.middleware');

      expect(module.requireTenant).toBeDefined();
      expect(typeof module.requireTenant).toBe('function');
    });
  });
});
