/**
 * Unit Tests for middleware/admin-auth.ts
 * 
 * Tests JWT authentication middleware, admin role checks, and permission validation.
 * Priority: 🔴 Critical (Security-related)
 */

import jwt from 'jsonwebtoken';
import { authMiddleware, requireAdmin, requirePermission } from '../../../src/middleware/admin-auth';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock request and reply
const createMockRequest = (overrides: any = {}) => ({
  headers: {},
  ip: '127.0.0.1',
  url: '/test',
  user: undefined,
  ...overrides
});

const createMockReply = () => {
  const reply: any = {
    statusCode: 200,
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
  return reply;
};

// Test constants
const TEST_JWT_SECRET = 'test-secret-minimum-32-characters-long';
const validUUID = '123e4567-e89b-12d3-a456-426614174000';

// Helper to create valid JWT
const createValidToken = (payload: any = {}) => {
  const defaultPayload = {
    sub: validUUID,
    tenant_id: validUUID,
    email: 'test@example.com',
    role: 'user',
    permissions: ['read'],
    ...payload
  };
  return jwt.sign(defaultPayload, TEST_JWT_SECRET, { expiresIn: '1h' });
};

// =============================================================================
// authMiddleware Tests
// =============================================================================

describe('authMiddleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, JWT_SECRET: TEST_JWT_SECRET };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Authorization header validation', () => {
    it('should return 401 when no Authorization header', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'UNAUTHORIZED' })
      );
    });

    it('should return 401 for non-Bearer token format', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Basic abc123' }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid authorization header format' })
      );
    });

    it('should return 401 for malformed Bearer header', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer' }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('should return 401 for invalid JWT token', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'INVALID_TOKEN' })
      );
    });

    it('should return 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { sub: validUUID, tenant_id: validUUID, email: 'test@test.com', role: 'user' },
        TEST_JWT_SECRET,
        { expiresIn: '-1h' }
      );
      const request = createMockRequest({
        headers: { authorization: `Bearer ${expiredToken}` }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'TOKEN_EXPIRED' })
      );
    });
  });

  describe('JWT_SECRET configuration', () => {
    it('should return 500 when JWT_SECRET not configured', async () => {
      delete process.env.JWT_SECRET;
      
      const request = createMockRequest({
        headers: { authorization: 'Bearer some-token' }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'CONFIGURATION_ERROR' })
      );
    });
  });

  describe('successful authentication', () => {
    it('should attach user to request on success', async () => {
      const token = createValidToken();
      const request = createMockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(request.user).toBeDefined();
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should extract id from token sub claim', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      const token = createValidToken({ sub: userId });
      const request = createMockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(request.user?.id).toBe(userId);
    });

    it('should extract tenant_id from token', async () => {
      const tenantId = '22222222-2222-2222-2222-222222222222';
      const token = createValidToken({ tenant_id: tenantId });
      const request = createMockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(request.user?.tenant_id).toBe(tenantId);
    });

    it('should extract email from token', async () => {
      const token = createValidToken({ email: 'admin@company.com' });
      const request = createMockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(request.user?.email).toBe('admin@company.com');
    });

    it('should extract role from token', async () => {
      const token = createValidToken({ role: 'admin' });
      const request = createMockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(request.user?.role).toBe('admin');
    });

    it('should extract permissions from token', async () => {
      const token = createValidToken({ permissions: ['read', 'write', 'delete'] });
      const request = createMockRequest({
        headers: { authorization: `Bearer ${token}` }
      });
      const reply = createMockReply();

      await authMiddleware(request as any, reply as any);

      expect(request.user?.permissions).toEqual(['read', 'write', 'delete']);
    });
  });
});

// =============================================================================
// requireAdmin Tests
// =============================================================================

describe('requireAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 500 without user context', async () => {
    const request = createMockRequest({ user: undefined });
    const reply = createMockReply();

    await requireAdmin(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'CONFIGURATION_ERROR' })
    );
  });

  it('should return 403 for non-admin role', async () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, email: 'user@test.com', role: 'user' }
    });
    const reply = createMockReply();

    await requireAdmin(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' })
    );
  });

  it('should allow admin role', async () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, email: 'admin@test.com', role: 'admin' }
    });
    const reply = createMockReply();

    await requireAdmin(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should allow super_admin role', async () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, email: 'super@test.com', role: 'super_admin' }
    });
    const reply = createMockReply();

    await requireAdmin(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should allow platform_admin role', async () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, email: 'platform@test.com', role: 'platform_admin' }
    });
    const reply = createMockReply();

    await requireAdmin(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
  });
});

// =============================================================================
// requirePermission Tests
// =============================================================================

describe('requirePermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 500 without user context', async () => {
    const request = createMockRequest({ user: undefined });
    const reply = createMockReply();

    const middleware = requirePermission('mint:create');
    await middleware(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(500);
  });

  it('should return 403 without required permission', async () => {
    const request = createMockRequest({
      user: { 
        id: validUUID, 
        tenant_id: validUUID, 
        email: 'user@test.com', 
        role: 'user',
        permissions: ['read']
      }
    });
    const reply = createMockReply();

    const middleware = requirePermission('mint:create');
    await middleware(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' })
    );
  });

  it('should allow when permission present', async () => {
    const request = createMockRequest({
      user: { 
        id: validUUID, 
        tenant_id: validUUID, 
        email: 'user@test.com', 
        role: 'user',
        permissions: ['read', 'mint:create']
      }
    });
    const reply = createMockReply();

    const middleware = requirePermission('mint:create');
    await middleware(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should allow admins all permissions', async () => {
    const request = createMockRequest({
      user: { 
        id: validUUID, 
        tenant_id: validUUID, 
        email: 'admin@test.com', 
        role: 'admin',
        permissions: [] // No explicit permissions
      }
    });
    const reply = createMockReply();

    const middleware = requirePermission('any:permission');
    await middleware(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should allow super_admin all permissions', async () => {
    const request = createMockRequest({
      user: { 
        id: validUUID, 
        tenant_id: validUUID, 
        email: 'super@test.com', 
        role: 'super_admin',
        permissions: []
      }
    });
    const reply = createMockReply();

    const middleware = requirePermission('any:permission');
    await middleware(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should allow platform_admin all permissions', async () => {
    const request = createMockRequest({
      user: { 
        id: validUUID, 
        tenant_id: validUUID, 
        email: 'platform@test.com', 
        role: 'platform_admin',
        permissions: []
      }
    });
    const reply = createMockReply();

    const middleware = requirePermission('any:permission');
    await middleware(request as any, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should handle missing permissions array', async () => {
    const request = createMockRequest({
      user: { 
        id: validUUID, 
        tenant_id: validUUID, 
        email: 'user@test.com', 
        role: 'user'
        // permissions is undefined
      }
    });
    const reply = createMockReply();

    const middleware = requirePermission('mint:create');
    await middleware(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
