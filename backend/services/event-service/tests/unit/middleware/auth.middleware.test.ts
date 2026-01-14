/**
 * Unit tests for auth middleware
 * 
 * Tests:
 * - JWT authentication (authenticateFastify)
 * - Admin role requirement (requireAdmin)
 * - Role-based authorization (requireRole)
 * - Helper functions (isAdmin, hasRole)
 * - Service request detection (isServiceRequest, isInternalRequest, getRequestSource)
 * - Multi-auth (authenticateUserOrService)
 * - Service-only auth (requireServiceAuth, requireInternalAuth)
 */

import { createMockRequest, createMockReply, createMockUser, createMockAdminUser } from '../../__mocks__/fastify.mock';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('mock-public-key'),
}));
jest.mock('../../../src/config/service-auth', () => ({
  verifyServiceToken: jest.fn(),
  verifyApiKey: jest.fn(),
  isTrustedService: jest.fn(),
}));

import * as jwt from 'jsonwebtoken';
import { verifyServiceToken, verifyApiKey, isTrustedService } from '../../../src/config/service-auth';

// Import after mocks
import {
  authenticateFastify,
  authenticate,
  requireAdmin,
  requireRole,
  isAdmin,
  hasRole,
  isServiceRequest,
  isInternalRequest,
  getRequestSource,
  authenticateUserOrService,
  requireServiceAuth,
  requireInternalAuth,
} from '../../../src/middleware/auth';

const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockVerifyServiceToken = verifyServiceToken as jest.MockedFunction<typeof verifyServiceToken>;
const mockVerifyApiKey = verifyApiKey as jest.MockedFunction<typeof verifyApiKey>;
const mockIsTrustedService = isTrustedService as jest.MockedFunction<typeof isTrustedService>;

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTrustedService.mockReturnValue(false);
  });

  describe('authenticateFastify', () => {
    it('should return 401 if no Authorization header', async () => {
      const request = createMockRequest({
        headers: {},
      });
      const reply = createMockReply();

      await authenticateFastify(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 401 if Authorization header does not start with Bearer', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Basic token123' },
      });
      const reply = createMockReply();

      await authenticateFastify(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 401 for expired token', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer expired-token' },
      });
      const reply = createMockReply();

      mockJwt.verify.mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      await authenticateFastify(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should return 401 for invalid token', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const reply = createMockReply();

      mockJwt.verify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
      });

      await authenticateFastify(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 401 for non-access token type', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer refresh-token' },
      });
      const reply = createMockReply();

      mockJwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'refresh', // Not 'access'
        tenant_id: 'tenant-123',
      });

      await authenticateFastify(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid token type' });
    });

    it('should return 401 for token missing tenant_id', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const reply = createMockReply();

      mockJwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'access',
        // Missing tenant_id
      });

      await authenticateFastify(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid token - missing tenant context' });
    });

    it('should set user on request for valid token', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const reply = createMockReply();

      mockJwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
        email: 'user@example.com',
        permissions: ['read', 'write'],
        role: 'admin',
      });

      await authenticateFastify(request as any, reply as any);

      expect((request as any).user).toEqual({
        id: 'user-123',
        sub: 'user-123',
        tenant_id: 'tenant-456',
        email: 'user@example.com',
        permissions: ['read', 'write'],
        role: 'admin',
      });
    });

    it('should default role to user if not provided', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const reply = createMockReply();

      mockJwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      });

      await authenticateFastify(request as any, reply as any);

      expect((request as any).user.role).toBe('user');
      expect((request as any).user.permissions).toEqual([]);
    });

    it('should handle generic authentication errors', async () => {
      const request = createMockRequest({
        headers: { authorization: 'Bearer token' },
      });
      const reply = createMockReply();

      mockJwt.verify.mockImplementation(() => {
        throw new Error('Unknown error');
      });

      await authenticateFastify(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication failed' });
    });
  });

  describe('authenticate (alias)', () => {
    it('should be the same as authenticateFastify', () => {
      expect(authenticate).toBe(authenticateFastify);
    });
  });

  describe('requireAdmin', () => {
    it('should return 401 if no user', async () => {
      const request = createMockRequest({ user: null });
      const reply = createMockReply();

      await requireAdmin(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      }));
    });

    it('should return 403 if user is not admin', async () => {
      const request = createMockRequest({
        user: createMockUser({ role: 'user' }),
      });
      const reply = createMockReply();

      await requireAdmin(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Admin access required',
        code: 'FORBIDDEN',
      }));
    });

    it('should pass for admin user', async () => {
      const request = createMockRequest({
        user: createMockAdminUser(),
      });
      const reply = createMockReply();

      await requireAdmin(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should return 401 if no user', async () => {
      const middleware = requireRole(['admin', 'manager']);
      const request = createMockRequest({ user: null });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if user role not in allowed list', async () => {
      const middleware = requireRole(['admin', 'manager']);
      const request = createMockRequest({
        user: createMockUser({ role: 'user' }),
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
      }));
    });

    it('should pass if user role is in allowed list', async () => {
      const middleware = requireRole(['admin', 'manager', 'user']);
      const request = createMockRequest({
        user: createMockUser({ role: 'user' }),
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should pass for admin in multi-role list', async () => {
      const middleware = requireRole(['admin', 'editor']);
      const request = createMockRequest({
        user: createMockAdminUser(),
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin user', () => {
      const user = createMockAdminUser();
      expect(isAdmin(user)).toBe(true);
    });

    it('should return false for non-admin user', () => {
      const user = createMockUser({ role: 'user' });
      expect(isAdmin(user)).toBe(false);
    });

    it('should return false for null user', () => {
      expect(isAdmin(null)).toBe(false);
    });

    it('should return false for undefined user', () => {
      expect(isAdmin(undefined)).toBe(false);
    });

    it('should return false for user without role', () => {
      expect(isAdmin({ id: '123' })).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true if user has one of the roles', () => {
      const user = createMockUser({ role: 'editor' });
      expect(hasRole(user, ['admin', 'editor', 'viewer'])).toBe(true);
    });

    it('should return false if user does not have any of the roles', () => {
      const user = createMockUser({ role: 'viewer' });
      expect(hasRole(user, ['admin', 'editor'])).toBe(false);
    });

    it('should return false for null user', () => {
      expect(hasRole(null, ['admin'])).toBe(false);
    });

    it('should return false for empty roles array', () => {
      const user = createMockUser({ role: 'admin' });
      expect(hasRole(user, [])).toBe(false);
    });
  });

  describe('isServiceRequest', () => {
    it('should return true for service request', () => {
      const request = createMockRequest();
      (request as any).user = {
        source: 'service',
      };

      expect(isServiceRequest(request as any)).toBe(true);
    });

    it('should return false for user request', () => {
      const request = createMockRequest();
      (request as any).user = {
        source: 'user',
      };

      expect(isServiceRequest(request as any)).toBe(false);
    });

    it('should return false if no user', () => {
      const request = createMockRequest({ user: null });
      expect(isServiceRequest(request as any)).toBe(false);
    });
  });

  describe('isInternalRequest', () => {
    it('should return true for internal request', () => {
      const request = createMockRequest();
      (request as any).user = {
        isInternalRequest: true,
      };

      expect(isInternalRequest(request as any)).toBe(true);
    });

    it('should return false for external request', () => {
      const request = createMockRequest();
      (request as any).user = {
        isInternalRequest: false,
      };

      expect(isInternalRequest(request as any)).toBe(false);
    });

    it('should return false if no user', () => {
      const request = createMockRequest({ user: null });
      expect(isInternalRequest(request as any)).toBe(false);
    });
  });

  describe('getRequestSource', () => {
    it('should return service for service request', () => {
      const request = createMockRequest();
      (request as any).user = { source: 'service' };

      expect(getRequestSource(request as any)).toBe('service');
    });

    it('should return user for user request', () => {
      const request = createMockRequest();
      (request as any).user = { source: 'user' };

      expect(getRequestSource(request as any)).toBe('user');
    });

    it('should return user as default if no source', () => {
      const request = createMockRequest();
      (request as any).user = {};

      expect(getRequestSource(request as any)).toBe('user');
    });

    it('should return user if no user', () => {
      const request = createMockRequest({ user: null });
      expect(getRequestSource(request as any)).toBe('user');
    });
  });

  describe('authenticateUserOrService', () => {
    it('should authenticate via service token', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'valid-service-token',
          'x-tenant-id': 'tenant-123',
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'venue-service',
      });

      await authenticateUserOrService(request as any, reply as any);

      expect((request as any).user).toMatchObject({
        id: 'venue-service',
        source: 'service',
        serviceId: 'venue-service',
        role: 'service',
      });
    });

    it('should set isInternalRequest for trusted services', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'valid-service-token',
          'x-tenant-id': 'tenant-123',
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'auth-service',
      });
      mockIsTrustedService.mockReturnValue(true);

      await authenticateUserOrService(request as any, reply as any);

      expect((request as any).user.isInternalRequest).toBe(true);
    });

    it('should authenticate via API key', async () => {
      const request = createMockRequest({
        headers: {
          'x-api-key': 'valid-api-key',
          'x-tenant-id': 'tenant-123',
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({
        valid: true,
        serviceId: 'ticket-service',
      });

      await authenticateUserOrService(request as any, reply as any);

      expect((request as any).user).toMatchObject({
        id: 'ticket-service',
        source: 'service',
        serviceId: 'ticket-service',
      });
    });

    it('should fall back to JWT for user auth', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer user-jwt-token',
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({ valid: false });
      mockJwt.verify.mockReturnValue({
        sub: 'user-456',
        type: 'access',
        tenant_id: 'tenant-789',
        email: 'user@test.com',
        role: 'user',
      });

      await authenticateUserOrService(request as any, reply as any);

      expect((request as any).user).toMatchObject({
        id: 'user-456',
        source: 'user',
        isInternalRequest: false,
      });
    });

    it('should return 401 if no auth provided', async () => {
      const request = createMockRequest({
        headers: {},
      });
      const reply = createMockReply();

      await authenticateUserOrService(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      }));
    });

    it('should handle JWT token expiration', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer expired-token',
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({ valid: false });
      mockJwt.verify.mockImplementation(() => {
        throw new jwt.TokenExpiredError('expired', new Date());
      });

      await authenticateUserOrService(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should use system tenant for service without x-tenant-id', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'valid-service-token',
          // No x-tenant-id
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'venue-service',
      });

      await authenticateUserOrService(request as any, reply as any);

      expect((request as any).user.tenant_id).toBe('system');
    });
  });

  describe('requireServiceAuth', () => {
    it('should pass for valid service request', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'valid-token',
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'venue-service',
      });

      await requireServiceAuth(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalledWith(403);
    });

    it('should return 403 for user request', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer user-token',
        },
      });
      const reply = createMockReply();
      reply.sent = false;

      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({ valid: false });
      mockJwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      });

      await requireServiceAuth(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Service authentication required',
        code: 'FORBIDDEN',
      }));
    });
  });

  describe('requireInternalAuth', () => {
    it('should pass for trusted internal service', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'internal-token',
        },
      });
      const reply = createMockReply();

      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'auth-service',
      });
      mockIsTrustedService.mockReturnValue(true);

      await requireInternalAuth(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalledWith(403);
    });

    it('should return 403 for untrusted service', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'external-token',
        },
      });
      const reply = createMockReply();
      reply.sent = false;

      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'external-service',
      });
      mockIsTrustedService.mockReturnValue(false);

      await requireInternalAuth(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal service authentication required',
        code: 'FORBIDDEN',
      }));
    });
  });
});
