import { AuthenticationError, AuthorizationError } from '../../../src/errors';

// Mock auditLogger
const mockAuditLogger = {
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/config/logger', () => ({
  auditLogger: mockAuditLogger,
}));

// Import after mocks
import { createAuthMiddleware } from '../../../src/middleware/auth.middleware';

describe('auth.middleware', () => {
  // Mock services
  const mockJwtService = {
    verifyAccessToken: jest.fn(),
  };

  const mockRbacService = {
    getUserPermissions: jest.fn(),
    checkPermission: jest.fn(),
    getUserVenueRoles: jest.fn(),
  };

  let middleware: ReturnType<typeof createAuthMiddleware>;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = createAuthMiddleware(mockJwtService as any, mockRbacService as any);
  });

  describe('authenticate', () => {
    const createRequest = (authHeader?: string) => ({
      headers: {
        authorization: authHeader,
      },
      user: undefined as any,
    });

    const mockReply = {};

    it('extracts Bearer token and verifies', async () => {
      const request = createRequest('Bearer valid-token');
      mockJwtService.verifyAccessToken.mockResolvedValue({
        sub: 'user-123',
        tenant_id: 'tenant-456',
        email: 'test@example.com',
        role: 'customer',
      });
      mockRbacService.getUserPermissions.mockResolvedValue(['read', 'write']);

      await middleware.authenticate(request, mockReply);

      expect(mockJwtService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    });

    it('attaches user to request with permissions', async () => {
      const request = createRequest('Bearer valid-token');
      mockJwtService.verifyAccessToken.mockResolvedValue({
        sub: 'user-123',
        tenant_id: 'tenant-456',
        email: 'test@example.com',
        role: 'admin',
      });
      mockRbacService.getUserPermissions.mockResolvedValue(['read', 'write', 'delete']);

      await middleware.authenticate(request, mockReply);

      expect(request.user).toEqual({
        id: 'user-123',
        tenant_id: 'tenant-456',
        email: 'test@example.com',
        role: 'admin',
        permissions: ['read', 'write', 'delete'],
      });
    });

    it('throws AuthenticationError on missing header', async () => {
      const request = createRequest(undefined);

      await expect(middleware.authenticate(request, mockReply))
        .rejects.toThrow(AuthenticationError);
      await expect(middleware.authenticate(request, mockReply))
        .rejects.toThrow('Missing or invalid authorization header');
    });

    it('throws AuthenticationError on non-Bearer header', async () => {
      const request = createRequest('Basic abc123');

      await expect(middleware.authenticate(request, mockReply))
        .rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError on empty Bearer token', async () => {
      const request = createRequest('Bearer ');
      mockJwtService.verifyAccessToken.mockRejectedValue(new Error('invalid'));

      await expect(middleware.authenticate(request, mockReply))
        .rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError on invalid token', async () => {
      const request = createRequest('Bearer invalid-token');
      mockJwtService.verifyAccessToken.mockRejectedValue(new Error('Invalid token'));

      await expect(middleware.authenticate(request, mockReply))
        .rejects.toThrow(AuthenticationError);
      await expect(middleware.authenticate(request, mockReply))
        .rejects.toThrow('Invalid token');
    });

    it('re-throws AuthenticationError from jwtService', async () => {
      const request = createRequest('Bearer expired-token');
      mockJwtService.verifyAccessToken.mockRejectedValue(
        new AuthenticationError('Token expired', 'TOKEN_EXPIRED')
      );

      await expect(middleware.authenticate(request, mockReply))
        .rejects.toThrow('Token expired');
    });

    it('fetches permissions from rbacService', async () => {
      const request = createRequest('Bearer valid-token');
      mockJwtService.verifyAccessToken.mockResolvedValue({
        sub: 'user-123',
        tenant_id: 'tenant-456',
      });
      mockRbacService.getUserPermissions.mockResolvedValue(['perm1']);

      await middleware.authenticate(request, mockReply);

      expect(mockRbacService.getUserPermissions).toHaveBeenCalledWith('user-123');
    });
  });

  describe('requirePermission', () => {
    const createAuthenticatedRequest = (overrides: any = {}) => ({
      user: {
        id: 'user-123',
        tenant_id: 'tenant-456',
        email: 'test@example.com',
        role: 'customer',
        permissions: ['read'],
      },
      params: {},
      body: {},
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
      ...overrides,
    });

    const mockReply = {};

    it('allows request with permission', async () => {
      const request = createAuthenticatedRequest();
      mockRbacService.checkPermission.mockResolvedValue(true);

      const permissionMiddleware = middleware.requirePermission('read');
      await expect(permissionMiddleware(request, mockReply)).resolves.toBeUndefined();
    });

    it('throws AuthorizationError without permission', async () => {
      const request = createAuthenticatedRequest();
      mockRbacService.checkPermission.mockResolvedValue(false);

      const permissionMiddleware = middleware.requirePermission('admin:delete');
      await expect(permissionMiddleware(request, mockReply))
        .rejects.toThrow(AuthorizationError);
    });

    it('throws AuthenticationError if user not authenticated', async () => {
      const request = { user: undefined, params: {}, body: {} };

      const permissionMiddleware = middleware.requirePermission('read');
      await expect(permissionMiddleware(request, mockReply))
        .rejects.toThrow(AuthenticationError);
      await expect(permissionMiddleware(request, mockReply))
        .rejects.toThrow('Authentication required');
    });

    it('checks permission with venueId from params', async () => {
      const request = createAuthenticatedRequest({
        params: { venueId: 'venue-789' },
      });
      mockRbacService.checkPermission.mockResolvedValue(true);

      const permissionMiddleware = middleware.requirePermission('manage:events');
      await permissionMiddleware(request, mockReply);

      expect(mockRbacService.checkPermission).toHaveBeenCalledWith(
        'user-123',
        'manage:events',
        'venue-789'
      );
    });

    it('checks permission with venueId from body', async () => {
      const request = createAuthenticatedRequest({
        body: { venueId: 'venue-from-body' },
      });
      mockRbacService.checkPermission.mockResolvedValue(true);

      const permissionMiddleware = middleware.requirePermission('create:event');
      await permissionMiddleware(request, mockReply);

      expect(mockRbacService.checkPermission).toHaveBeenCalledWith(
        'user-123',
        'create:event',
        'venue-from-body'
      );
    });

    it('prefers venueId from params over body', async () => {
      const request = createAuthenticatedRequest({
        params: { venueId: 'params-venue' },
        body: { venueId: 'body-venue' },
      });
      mockRbacService.checkPermission.mockResolvedValue(true);

      const permissionMiddleware = middleware.requirePermission('read');
      await permissionMiddleware(request, mockReply);

      expect(mockRbacService.checkPermission).toHaveBeenCalledWith(
        'user-123',
        'read',
        'params-venue'
      );
    });

    it('logs denial to auditLogger', async () => {
      const request = createAuthenticatedRequest({
        params: { venueId: 'venue-123' },
      });
      mockRbacService.checkPermission.mockResolvedValue(false);

      const permissionMiddleware = middleware.requirePermission('admin:delete');
      
      try {
        await permissionMiddleware(request, mockReply);
      } catch (e) {
        // Expected
      }

      expect(mockAuditLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-456',
          permission: 'admin:delete',
          resource: 'venue-123',
        }),
        expect.stringContaining('Authorization denied')
      );
    });
  });

  describe('requireVenueAccess', () => {
    const createAuthenticatedRequest = (venueId?: string) => ({
      user: {
        id: 'user-123',
        tenant_id: 'tenant-456',
        email: 'test@example.com',
      },
      params: { venueId },
      url: '/venue/test',
      method: 'GET',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    });

    const mockReply = {};

    it('allows access when user has venue role', async () => {
      const request = createAuthenticatedRequest('venue-789');
      mockRbacService.getUserVenueRoles.mockResolvedValue([
        { venue_id: 'venue-789', role: 'manager' },
      ]);

      await expect(middleware.requireVenueAccess(request, mockReply))
        .resolves.toBeUndefined();
    });

    it('throws AuthorizationError without venue role', async () => {
      const request = createAuthenticatedRequest('venue-789');
      mockRbacService.getUserVenueRoles.mockResolvedValue([
        { venue_id: 'other-venue', role: 'manager' },
      ]);

      await expect(middleware.requireVenueAccess(request, mockReply))
        .rejects.toThrow(AuthorizationError);
      await expect(middleware.requireVenueAccess(request, mockReply))
        .rejects.toThrow('No access to this venue');
    });

    it('throws AuthenticationError if user not authenticated', async () => {
      const request = { user: undefined, params: { venueId: 'venue-123' } };

      await expect(middleware.requireVenueAccess(request, mockReply))
        .rejects.toThrow(AuthenticationError);
    });

    it('throws Error if venueId not provided', async () => {
      const request = createAuthenticatedRequest(undefined);

      await expect(middleware.requireVenueAccess(request, mockReply))
        .rejects.toThrow('Venue ID required');
    });

    it('logs denial to auditLogger', async () => {
      const request = createAuthenticatedRequest('venue-789');
      mockRbacService.getUserVenueRoles.mockResolvedValue([]);

      try {
        await middleware.requireVenueAccess(request, mockReply);
      } catch (e) {
        // Expected
      }

      expect(mockAuditLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          venueId: 'venue-789',
        }),
        expect.stringContaining('No access to venue')
      );
    });

    it('checks all venue roles for access', async () => {
      const request = createAuthenticatedRequest('venue-c');
      mockRbacService.getUserVenueRoles.mockResolvedValue([
        { venue_id: 'venue-a', role: 'staff' },
        { venue_id: 'venue-b', role: 'manager' },
        { venue_id: 'venue-c', role: 'owner' },
      ]);

      await expect(middleware.requireVenueAccess(request, mockReply))
        .resolves.toBeUndefined();
    });
  });
});
