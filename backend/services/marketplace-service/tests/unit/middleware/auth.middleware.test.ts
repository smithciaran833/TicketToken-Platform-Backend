/**
 * Unit Tests for Auth Middleware
 * Tests JWT authentication and authorization
 */

import jwt from 'jsonwebtoken';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock listing model
const mockListingModel = {
  findById: jest.fn()
};

jest.mock('../../../src/models/listing.model', () => ({
  listingModel: mockListingModel
}));

// Helper to create mock request
const createMockRequest = (options: {
  authorization?: string;
  user?: any;
  params?: any;
  id?: string;
  ip?: string;
}) => ({
  headers: {
    authorization: options.authorization
  },
  user: options.user,
  params: options.params || {},
  id: options.id || 'test-request-id',
  ip: options.ip || '127.0.0.1'
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

describe('Auth Middleware', () => {
  const TEST_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long';
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('validateAuthConfig', () => {
    it('should pass with valid JWT_SECRET', () => {
      process.env.JWT_SECRET = TEST_SECRET;
      
      const { validateAuthConfig } = require('../../../src/middleware/auth.middleware');
      
      expect(() => validateAuthConfig()).not.toThrow();
    });

    it('should throw if JWT_SECRET is missing', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      jest.resetModules();
      const { validateAuthConfig } = require('../../../src/middleware/auth.middleware');
      
      expect(() => validateAuthConfig()).toThrow('JWT_SECRET environment variable is required');
      
      process.env.JWT_SECRET = originalSecret;
    });

    it('should throw if JWT_SECRET is too short', () => {
      process.env.JWT_SECRET = 'short';
      
      jest.resetModules();
      const { validateAuthConfig } = require('../../../src/middleware/auth.middleware');
      
      expect(() => validateAuthConfig()).toThrow('JWT_SECRET must be at least 32 characters');
      
      process.env.JWT_SECRET = TEST_SECRET;
    });
  });

  describe('authMiddleware', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
    });

    it('should reject if JWT_SECRET not configured', async () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({ authorization: 'Bearer token' });
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.body.code).toBe('AUTH_CONFIG_ERROR');
      
      process.env.JWT_SECRET = originalSecret;
    });

    it('should reject request without authorization header', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({});
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('NO_TOKEN');
    });

    it('should reject request without Bearer prefix', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({ authorization: 'Basic token123' });
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('NO_TOKEN');
    });

    it('should reject empty token', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({ authorization: 'Bearer ' });
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('EMPTY_TOKEN');
    });

    it('should accept valid token and set user on request', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const payload = { id: 'user-123', tenant_id: 'tenant-456', roles: ['user'] };
      const token = jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256' });
      
      const request = createMockRequest({ authorization: `Bearer ${token}` }) as any;
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).not.toHaveBeenCalled();
      expect(request.user).toBeDefined();
      expect(request.user.id).toBe('user-123');
      expect(request.tenantId).toBe('tenant-456');
    });

    it('should extract tenant_id from token', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const payload = { id: 'user-123', tenant_id: 'my-tenant' };
      const token = jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256' });
      
      const request = createMockRequest({ authorization: `Bearer ${token}` }) as any;
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(request.tenantId).toBe('my-tenant');
    });

    it('should extract tenantId (camelCase) from token', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const payload = { id: 'user-123', tenantId: 'camel-tenant' };
      const token = jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256' });
      
      const request = createMockRequest({ authorization: `Bearer ${token}` }) as any;
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(request.tenantId).toBe('camel-tenant');
    });

    it('should reject expired token', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const payload = { id: 'user-123' };
      const token = jwt.sign(payload, TEST_SECRET, { 
        algorithm: 'HS256',
        expiresIn: '-1h'
      });
      
      const request = createMockRequest({ authorization: `Bearer ${token}` });
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject invalid token', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({ authorization: 'Bearer invalid-token' });
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.body.code).toBe('INVALID_TOKEN');
    });

    it('should reject token with wrong secret', async () => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      const { authMiddleware } = require('../../../src/middleware/auth.middleware');
      
      const payload = { id: 'user-123' };
      const token = jwt.sign(payload, 'wrong-secret-that-is-long-enough');
      
      const request = createMockRequest({ authorization: `Bearer ${token}` });
      const reply = createMockReply();
      
      await authMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('requireAdmin', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
    });

    it('should allow admin users', async () => {
      const { requireAdmin } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123', roles: ['admin'] }
      });
      const reply = createMockReply();
      
      await requireAdmin(request, reply);
      
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should reject non-admin users', async () => {
      const { requireAdmin } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123', roles: ['user'] }
      });
      const reply = createMockReply();
      
      await requireAdmin(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.body.error).toContain('Admin access required');
    });

    it('should reject users without roles', async () => {
      const { requireAdmin } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123' }
      });
      const reply = createMockReply();
      
      await requireAdmin(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireVenueOwner', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
    });

    it('should allow admin', async () => {
      const { requireVenueOwner } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { roles: ['admin'] }
      });
      const reply = createMockReply();
      
      await requireVenueOwner(request, reply);
      
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should allow venue_owner', async () => {
      const { requireVenueOwner } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { roles: ['venue_owner'] }
      });
      const reply = createMockReply();
      
      await requireVenueOwner(request, reply);
      
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should allow venue_manager', async () => {
      const { requireVenueOwner } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { roles: ['venue_manager'] }
      });
      const reply = createMockReply();
      
      await requireVenueOwner(request, reply);
      
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should reject regular users', async () => {
      const { requireVenueOwner } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { roles: ['user'] }
      });
      const reply = createMockReply();
      
      await requireVenueOwner(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.body.error).toContain('Venue owner access required');
    });
  });

  describe('verifyListingOwnership', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = TEST_SECRET;
      jest.resetModules();
      jest.clearAllMocks();
    });

    it('should reject missing listing ID', async () => {
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123' },
        params: {}
      });
      const reply = createMockReply();
      
      await verifyListingOwnership(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.body.error).toContain('Missing listing ID');
    });

    it('should reject missing user ID', async () => {
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        params: { id: 'listing-123' }
      });
      const reply = createMockReply();
      
      await verifyListingOwnership(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if listing not found', async () => {
      mockListingModel.findById.mockResolvedValue(null);
      
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123' },
        params: { id: 'listing-123' }
      });
      const reply = createMockReply();
      
      await verifyListingOwnership(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.body.error).toContain('Listing not found');
    });

    it('should reject if user does not own listing', async () => {
      mockListingModel.findById.mockResolvedValue({
        id: 'listing-123',
        sellerId: 'other-user'
      });
      
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123' },
        params: { id: 'listing-123' }
      });
      const reply = createMockReply();
      
      await verifyListingOwnership(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.body.error).toContain('Unauthorized');
    });

    it('should allow if user owns listing', async () => {
      mockListingModel.findById.mockResolvedValue({
        id: 'listing-123',
        sellerId: 'user-123'
      });
      
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123' },
        params: { id: 'listing-123' }
      });
      const reply = createMockReply();
      
      await verifyListingOwnership(request, reply);
      
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockListingModel.findById.mockRejectedValue(new Error('DB error'));
      
      const { verifyListingOwnership } = require('../../../src/middleware/auth.middleware');
      
      const request = createMockRequest({
        user: { id: 'user-123' },
        params: { id: 'listing-123' }
      });
      const reply = createMockReply();
      
      await verifyListingOwnership(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(500);
    });
  });
});
