import { createAuthMiddleware } from '../../../src/middleware/auth.middleware';
import { AuthenticationError, AuthorizationError } from '../../../src/errors';
import { JWTService } from '../../../src/services/jwt.service';
import { RBACService } from '../../../src/services/rbac.service';

describe('Auth Middleware', () => {
  let jwtService: jest.Mocked<JWTService>;
  let rbacService: jest.Mocked<RBACService>;
  let middleware: any;

  beforeEach(() => {
    jwtService = {
      verifyAccessToken: jest.fn(),
    } as any;

    rbacService = {
      getUserPermissions: jest.fn(),
      checkPermission: jest.fn(),
      getUserVenueRoles: jest.fn(),
    } as any;

    middleware = createAuthMiddleware(jwtService, rbacService);
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate valid token', async () => {
      const request: any = {
        headers: { authorization: 'Bearer valid-token' },
      };
      const reply = {};

      jwtService.verifyAccessToken.mockResolvedValue({ sub: 'user-123' } as any);
      rbacService.getUserPermissions.mockResolvedValue(['read', 'write']);

      await middleware.authenticate(request, reply);

      expect(request.user).toEqual({
        id: 'user-123',
        permissions: ['read', 'write'],
      });
      expect(jwtService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    });

    it('should throw error when authorization header missing', async () => {
      const request: any = { headers: {} };
      const reply = {};

      await expect(middleware.authenticate(request, reply))
        .rejects.toThrow('Missing or invalid authorization header');
    });

    it('should throw error when authorization header invalid format', async () => {
      const request: any = { headers: { authorization: 'InvalidFormat' } };
      const reply = {};

      await expect(middleware.authenticate(request, reply))
        .rejects.toThrow('Missing or invalid authorization header');
    });

    it('should throw error when token verification fails', async () => {
      const request: any = { headers: { authorization: 'Bearer invalid-token' } };
      const reply = {};

      jwtService.verifyAccessToken.mockRejectedValue(new Error('Invalid token'));

      await expect(middleware.authenticate(request, reply))
        .rejects.toThrow('Invalid token');
    });

    it('should propagate AuthenticationError', async () => {
      const request: any = { headers: { authorization: 'Bearer expired-token' } };
      const reply = {};

      jwtService.verifyAccessToken.mockRejectedValue(
        new AuthenticationError('Token expired')
      );

      await expect(middleware.authenticate(request, reply))
        .rejects.toThrow(AuthenticationError);
    });
  });

  describe('requirePermission', () => {
    it('should allow access when user has permission', async () => {
      const request: any = {
        user: { id: 'user-123' },
        params: { venueId: 'venue-456' },
      };
      const reply = {};

      rbacService.checkPermission.mockResolvedValue(true);

      const handler = middleware.requirePermission('events:create');
      await expect(handler(request, reply)).resolves.not.toThrow();

      expect(rbacService.checkPermission).toHaveBeenCalledWith(
        'user-123',
        'events:create',
        'venue-456'
      );
    });

    it('should throw error when user not authenticated', async () => {
      const request: any = { params: {} };
      const reply = {};

      const handler = middleware.requirePermission('events:create');

      await expect(handler(request, reply))
        .rejects.toThrow('Authentication required');
    });

    it('should throw error when user lacks permission', async () => {
      const request: any = {
        user: { id: 'user-123' },
        params: {},
      };
      const reply = {};

      rbacService.checkPermission.mockResolvedValue(false);

      const handler = middleware.requirePermission('events:delete');

      await expect(handler(request, reply))
        .rejects.toThrow(AuthorizationError);
    });

    it('should check permission with venue from body', async () => {
      const request: any = {
        user: { id: 'user-123' },
        params: {},
        body: { venueId: 'venue-789' },
      };
      const reply = {};

      rbacService.checkPermission.mockResolvedValue(true);

      const handler = middleware.requirePermission('tickets:sell');
      await handler(request, reply);

      expect(rbacService.checkPermission).toHaveBeenCalledWith(
        'user-123',
        'tickets:sell',
        'venue-789'
      );
    });
  });

  describe('requireVenueAccess', () => {
    it('should allow access when user has venue role', async () => {
      const request: any = {
        user: { id: 'user-123' },
        params: { venueId: 'venue-456' },
      };
      const reply = {};

      rbacService.getUserVenueRoles.mockResolvedValue([
        { venue_id: 'venue-456', role: 'manager' },
      ]);

      await expect(middleware.requireVenueAccess(request, reply))
        .resolves.not.toThrow();
    });

    it('should throw error when user not authenticated', async () => {
      const request: any = { params: { venueId: 'venue-456' } };
      const reply = {};

      await expect(middleware.requireVenueAccess(request, reply))
        .rejects.toThrow('Authentication required');
    });

    it('should throw error when venue ID missing', async () => {
      const request: any = {
        user: { id: 'user-123' },
        params: {},
      };
      const reply = {};

      await expect(middleware.requireVenueAccess(request, reply))
        .rejects.toThrow('Venue ID required');
    });

    it('should throw error when user has no access to venue', async () => {
      const request: any = {
        user: { id: 'user-123' },
        params: { venueId: 'venue-456' },
      };
      const reply = {};

      rbacService.getUserVenueRoles.mockResolvedValue([
        { venue_id: 'venue-789', role: 'manager' },
      ]);

      await expect(middleware.requireVenueAccess(request, reply))
        .rejects.toThrow('No access to this venue');
    });
  });
});
