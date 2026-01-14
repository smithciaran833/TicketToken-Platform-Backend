import { authenticate, requireRole } from '../../src/middleware/auth';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR AUTH MIDDLEWARE
 * Tests authentication and authorization middleware
 */

describe('Auth Middleware Integration Tests', () => {
  let mockRequest: any;
  let mockReply: any;
  let sendSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    sendSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ send: sendSpy });
    
    mockRequest = {
      headers: {},
      user: undefined,
      userId: undefined,
      tenantId: undefined
    };

    mockReply = {
      status: statusSpy,
      send: sendSpy
    };
  });

  describe('authenticate', () => {
    describe('missing token', () => {
      it('should return 401 when no authorization header', async () => {
        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(sendSpy).toHaveBeenCalledWith({ error: 'No token provided' });
      });

      it('should return 401 when authorization header is empty', async () => {
        mockRequest.headers.authorization = '';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(sendSpy).toHaveBeenCalledWith({ error: 'No token provided' });
      });

      it('should return 401 when authorization header does not start with Bearer', async () => {
        mockRequest.headers.authorization = 'Basic sometoken';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(sendSpy).toHaveBeenCalledWith({ error: 'No token provided' });
      });

      it('should return 401 when Bearer prefix but no token', async () => {
        mockRequest.headers.authorization = 'Bearer ';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(401);
      });
    });

    describe('invalid token', () => {
      beforeEach(() => {
        jest.spyOn(jwt, 'verify').mockImplementation(() => {
          const error: any = new Error('Invalid token');
          error.name = 'JsonWebTokenError';
          throw error;
        });
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('should return 401 for invalid token', async () => {
        mockRequest.headers.authorization = 'Bearer invalid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(sendSpy).toHaveBeenCalledWith({ error: 'Invalid token' });
      });

      it('should return 401 for malformed token', async () => {
        mockRequest.headers.authorization = 'Bearer malformed';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(401);
      });
    });

    describe('expired token', () => {
      beforeEach(() => {
        jest.spyOn(jwt, 'verify').mockImplementation(() => {
          const error: any = new Error('Token expired');
          error.name = 'TokenExpiredError';
          throw error;
        });
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('should return 401 for expired token', async () => {
        mockRequest.headers.authorization = 'Bearer expired.token.here';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(401);
        expect(sendSpy).toHaveBeenCalledWith({ error: 'Token expired' });
      });
    });

    describe('valid token', () => {
      const testUserId = uuidv4();
      const testTenantId = uuidv4();

      beforeEach(() => {
        jest.spyOn(jwt, 'verify').mockReturnValue({
          userId: testUserId,
          tenantId: testTenantId,
          role: 'user',
          email: 'test@example.com'
        } as any);
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('should attach user to request for valid token', async () => {
        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user).toBeDefined();
        expect(mockRequest.userId).toBe(testUserId);
        expect(mockRequest.tenantId).toBe(testTenantId);
      });

      it('should extract userId from decoded token', async () => {
        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.userId).toBe(testUserId);
      });

      it('should extract tenantId from decoded token', async () => {
        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(testTenantId);
      });

      it('should handle token with id instead of userId', async () => {
        jest.spyOn(jwt, 'verify').mockReturnValue({
          id: testUserId,
          tenantId: testTenantId
        } as any);

        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.userId).toBe(testUserId);
      });

      it('should handle token with sub instead of userId', async () => {
        jest.spyOn(jwt, 'verify').mockReturnValue({
          sub: testUserId,
          tenantId: testTenantId
        } as any);

        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.userId).toBe(testUserId);
      });

      it('should handle token with tenant_id instead of tenantId', async () => {
        jest.spyOn(jwt, 'verify').mockReturnValue({
          userId: testUserId,
          tenant_id: testTenantId
        } as any);

        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.tenantId).toBe(testTenantId);
      });

      it('should not call reply.status for valid token', async () => {
        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
        expect(sendSpy).not.toHaveBeenCalled();
      });

      it('should preserve all token data in user object', async () => {
        const tokenData = {
          userId: testUserId,
          tenantId: testTenantId,
          role: 'admin',
          email: 'admin@example.com',
          permissions: ['read', 'write']
        };

        jest.spyOn(jwt, 'verify').mockReturnValue(tokenData as any);

        mockRequest.headers.authorization = 'Bearer valid.token.here';

        await authenticate(mockRequest, mockReply);

        expect(mockRequest.user).toEqual(tokenData);
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        jest.spyOn(jwt, 'verify').mockImplementation(() => {
          throw new Error('Unexpected error');
        });
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('should return 500 for unexpected errors', async () => {
        mockRequest.headers.authorization = 'Bearer token.with.error';

        await authenticate(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(500);
        expect(sendSpy).toHaveBeenCalledWith({ error: 'Authentication error' });
      });
    });
  });

  describe('requireRole', () => {
    beforeEach(() => {
      mockRequest.user = {
        userId: uuidv4(),
        role: 'user',
        permissions: []
      };
    });

    describe('no user', () => {
      it('should throw UnauthorizedError when no user', async () => {
        mockRequest.user = undefined;
        const middleware = requireRole(['admin']);

        await expect(middleware(mockRequest, mockReply)).rejects.toThrow('Unauthorized');
      });
    });

    describe('role-based access', () => {
      it('should allow access when user has required role', async () => {
        mockRequest.user.role = 'admin';
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should allow access when user role is in allowed roles list', async () => {
        mockRequest.user.role = 'moderator';
        const middleware = requireRole(['admin', 'moderator']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should return 403 when user does not have required role', async () => {
        mockRequest.user.role = 'user';
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
        expect(sendSpy).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      });

      it('should return 403 for empty role', async () => {
        mockRequest.user.role = '';
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });

      it('should return 403 for null role', async () => {
        mockRequest.user.role = null;
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });
    });

    describe('admin permissions', () => {
      it('should allow access for admin:all permission', async () => {
        mockRequest.user.role = 'user';
        mockRequest.user.permissions = ['admin:all'];
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should allow admin:all even without matching role', async () => {
        mockRequest.user.role = 'basic';
        mockRequest.user.permissions = ['admin:all', 'other:permission'];
        const middleware = requireRole(['superadmin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });
    });

    describe('venue manager permissions', () => {
      it('should allow venue_manager role with venue: permissions', async () => {
        mockRequest.user.role = 'organizer';
        mockRequest.user.permissions = ['venue:manage', 'venue:create'];
        const middleware = requireRole(['venue_manager']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should allow with single venue: permission', async () => {
        mockRequest.user.role = 'staff';
        mockRequest.user.permissions = ['venue:read'];
        const middleware = requireRole(['venue_manager']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should return 403 for venue_manager without venue: permissions', async () => {
        mockRequest.user.role = 'user';
        mockRequest.user.permissions = ['event:read', 'ticket:purchase'];
        const middleware = requireRole(['venue_manager']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });
    });

    describe('multiple roles', () => {
      it('should allow access with first matching role', async () => {
        mockRequest.user.role = 'moderator';
        const middleware = requireRole(['admin', 'moderator', 'staff']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should allow access with last matching role', async () => {
        mockRequest.user.role = 'staff';
        const middleware = requireRole(['admin', 'moderator', 'staff']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).not.toHaveBeenCalled();
      });

      it('should return 403 when role not in list', async () => {
        mockRequest.user.role = 'guest';
        const middleware = requireRole(['admin', 'moderator', 'staff']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });
    });

    describe('edge cases', () => {
      it('should handle empty roles array', async () => {
        mockRequest.user.role = 'admin';
        const middleware = requireRole([]);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });

      it('should handle undefined permissions', async () => {
        mockRequest.user.role = 'user';
        mockRequest.user.permissions = undefined;
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });

      it('should handle null permissions', async () => {
        mockRequest.user.role = 'user';
        mockRequest.user.permissions = null;
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });

      it('should handle empty permissions array', async () => {
        mockRequest.user.role = 'user';
        mockRequest.user.permissions = [];
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });

      it('should be case-sensitive for roles', async () => {
        mockRequest.user.role = 'Admin';
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });

      it('should be case-sensitive for permissions', async () => {
        mockRequest.user.role = 'user';
        mockRequest.user.permissions = ['Admin:All'];
        const middleware = requireRole(['admin']);

        await middleware(mockRequest, mockReply);

        expect(statusSpy).toHaveBeenCalledWith(403);
      });
    });
  });

  describe('integration scenarios', () => {
    const testUserId = uuidv4();
    const testTenantId = uuidv4();

    beforeEach(() => {
      jest.spyOn(jwt, 'verify').mockReturnValue({
        userId: testUserId,
        tenantId: testTenantId,
        role: 'admin',
        permissions: ['admin:all']
      } as any);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should authenticate and authorize in sequence', async () => {
      mockRequest.headers.authorization = 'Bearer valid.token.here';

      // First authenticate
      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.userId).toBe(testUserId);

      // Then authorize
      const middleware = requireRole(['admin']);
      await middleware(mockRequest, mockReply);

      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should fail authorization without authentication', async () => {
      // Skip authentication
      const middleware = requireRole(['admin']);

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow();
    });

    it('should handle multiple authorization checks', async () => {
      mockRequest.headers.authorization = 'Bearer valid.token.here';

      await authenticate(mockRequest, mockReply);

      // First check
      const middleware1 = requireRole(['admin']);
      await middleware1(mockRequest, mockReply);

      // Second check
      const middleware2 = requireRole(['admin', 'moderator']);
      await middleware2(mockRequest, mockReply);

      expect(statusSpy).not.toHaveBeenCalled();
    });
  });
});
