import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  setupAuthMiddleware,
  handleTokenRefresh,
} from '../../../src/middleware/auth.middleware';
import { AuthServiceClient } from '../../../src/clients/AuthServiceClient';
import { VenueServiceClient } from '../../../src/clients/VenueServiceClient';
import { createRequestLogger, logSecurityEvent } from '../../../src/utils/logger';
import {
  AuthenticationError,
  AuthorizationError,
} from '../../../src/types';
import { REDIS_KEYS } from '../../../src/config/redis';

jest.mock('../../../src/clients/AuthServiceClient');
jest.mock('../../../src/clients/VenueServiceClient');
jest.mock('../../../src/utils/logger');
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-nanoid-123'),
}));

describe('auth.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    (createRequestLogger as jest.Mock).mockReturnValue(mockLogger);
    (logSecurityEvent as jest.Mock).mockReturnValue(undefined);

    mockServer = {
      register: jest.fn().mockResolvedValue(undefined),
      decorate: jest.fn(),
      redis: {
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
      },
      jwt: {
        sign: jest.fn(),
        verify: jest.fn(),
      },
    };

    mockRequest = {
      id: 'test-request-id',
      ip: '127.0.0.1',
      url: '/test',
      headers: {
        authorization: 'Bearer valid-token',
        'user-agent': 'test-agent',
      },
      jwtVerify: jest.fn(),
      params: {},
      body: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('setupAuthMiddleware', () => {
    it('registers JWT plugin with correct configuration', async () => {
      await setupAuthMiddleware(mockServer);

      expect(mockServer.register).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          secret: expect.any(String),
          sign: expect.objectContaining({
            algorithm: 'HS256',
            issuer: expect.any(String),
          }),
          verify: expect.objectContaining({
            algorithms: ['HS256'],
            issuer: expect.any(String),
          }),
        })
      );
    });

    it('decorates server with authenticate method', async () => {
      await setupAuthMiddleware(mockServer);

      expect(mockServer.decorate).toHaveBeenCalledWith(
        'authenticate',
        expect.any(Function)
      );
    });

    it('assigns requirePermission function to server', async () => {
      await setupAuthMiddleware(mockServer);

      expect(mockServer.requirePermission).toBeDefined();
      expect(typeof mockServer.requirePermission).toBe('function');
    });
  });

  describe('authenticate', () => {
    let authenticateFn: Function;

    beforeEach(async () => {
      await setupAuthMiddleware(mockServer);
      authenticateFn = mockServer.decorate.mock.calls.find(
        (call: any[]) => call[0] === 'authenticate'
      )[1];

      // Mock getUserDetails
      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        getUserById: jest.fn().mockResolvedValue({
          id: 'user-123',
          email: 'test@example.com',
          role: 'customer',
          venueId: 'venue-123',
          metadata: {},
        }),
      }));
    });

    it('throws AuthenticationError when authorization header is missing', async () => {
      mockRequest.headers.authorization = undefined;

      await expect(authenticateFn(mockRequest)).rejects.toThrow(
        new AuthenticationError('Missing or invalid authorization header')
      );
    });

    it('throws AuthenticationError when authorization header does not start with Bearer', async () => {
      mockRequest.headers.authorization = 'Basic some-token';

      await expect(authenticateFn(mockRequest)).rejects.toThrow(
        new AuthenticationError('Missing or invalid authorization header')
      );
    });

    it('throws AuthenticationError when token is blacklisted', async () => {
      mockServer.redis.get.mockResolvedValue('true');

      await expect(authenticateFn(mockRequest)).rejects.toThrow(
        new AuthenticationError('Token has been revoked')
      );

      expect(logSecurityEvent).toHaveBeenCalledWith(
        'blacklisted_token_usage',
        expect.objectContaining({
          requestId: 'test-request-id',
          ip: '127.0.0.1',
          userAgent: 'test-agent',
        }),
        'high'
      );
    });

    it('throws AuthenticationError when token type is not access', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'refresh',
        tenant_id: 'tenant-123',
      });

      await expect(authenticateFn(mockRequest)).rejects.toThrow(
        new AuthenticationError('Invalid token type')
      );
    });

    it('throws AuthenticationError and logs security event when tenant_id is missing', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
      });

      await expect(authenticateFn(mockRequest)).rejects.toThrow(
        new AuthenticationError('Invalid token - missing tenant context')
      );

      expect(logSecurityEvent).toHaveBeenCalledWith(
        'token_missing_tenant',
        expect.objectContaining({
          userId: 'user-123',
          requestId: 'test-request-id',
          ip: '127.0.0.1',
        }),
        'high'
      );
    });

    it('throws AuthenticationError when user is not found', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-123',
      });

      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        getUserById: jest.fn().mockResolvedValue(null),
      }));

      await expect(authenticateFn(mockRequest)).rejects.toThrow(
        new AuthenticationError('User not found')
      );
    });

    it('attaches user to request with data from JWT and service', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
        permissions: ['tickets:purchase'],
      });

      await authenticateFn(mockRequest);

      expect(mockRequest.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'customer',
        tenant_id: 'tenant-456',
        permissions: ['tickets:purchase'],
        venueId: 'venue-123',
        metadata: {},
      });
    });

    it('uses role from JWT if user.role is not present', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
        role: 'admin',
      });

      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        getUserById: jest.fn().mockResolvedValue({
          id: 'user-123',
          email: 'test@example.com',
          venueId: 'venue-123',
          metadata: {},
        }),
      }));

      await authenticateFn(mockRequest);

      expect(mockRequest.user.role).toBe('admin');
    });

    it('gets user permissions from role when not in JWT', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      });

      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        getUserById: jest.fn().mockResolvedValue({
          id: 'user-123',
          email: 'test@example.com',
          role: 'door-staff',
          venueId: 'venue-123',
          metadata: {},
        }),
      }));

      await authenticateFn(mockRequest);

      expect(mockRequest.user.permissions).toEqual(['tickets:validate', 'tickets:view']);
    });

    it('uses cached user data when available', async () => {
      const cachedUser = {
        id: 'user-123',
        email: 'cached@example.com',
        role: 'customer',
        venueId: 'venue-123',
        metadata: {},
      };

      mockServer.redis.get
        .mockResolvedValueOnce(null) // blacklist check
        .mockResolvedValueOnce(JSON.stringify(cachedUser)); // cache check

      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      });

      const getUserByIdMock = jest.fn();
      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        getUserById: getUserByIdMock,
      }));

      await authenticateFn(mockRequest);

      expect(getUserByIdMock).not.toHaveBeenCalled();
      expect(mockRequest.user.email).toBe('cached@example.com');
    });

    it('caches user data after fetching from service', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      });

      await authenticateFn(mockRequest);

      expect(mockServer.redis.setex).toHaveBeenCalledWith(
        `${REDIS_KEYS.CACHE_VENUE}user:user-123`,
        300,
        expect.stringContaining('test@example.com')
      );
    });

    it('logs successful authentication', async () => {
      mockServer.redis.get.mockResolvedValue(null);
      mockRequest.jwtVerify.mockResolvedValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      });

      await authenticateFn(mockRequest);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-456',
          role: 'customer',
          venueId: 'venue-123',
        }),
        'User authenticated successfully'
      );
    });

    it('logs warning and throws on authentication failure', async () => {
      mockRequest.jwtVerify.mockRejectedValue(new Error('Invalid token'));

      await expect(authenticateFn(mockRequest)).rejects.toThrow(
        new AuthenticationError('Invalid or expired token')
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token',
          ip: '127.0.0.1',
          path: '/test',
        }),
        'Authentication failed'
      );
    });
  });

  describe('requirePermission', () => {
    let requirePermissionFn: Function;
    let authenticateFn: Function;

    beforeEach(async () => {
      await setupAuthMiddleware(mockServer);
      
      requirePermissionFn = mockServer.requirePermission;
      
      authenticateFn = mockServer.decorate.mock.calls.find(
        (call: any[]) => call[0] === 'authenticate'
      )[1];

      mockServer.authenticate = authenticateFn;

      // Setup default authenticated user
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'customer',
        tenant_id: 'tenant-123',
        permissions: ['tickets:purchase', 'tickets:view-own'],
        venueId: 'venue-123',
        metadata: {},
      };

      mockServer.authenticate = jest.fn().mockImplementation(async (req: any) => {
        req.user = mockRequest.user;
      });
    });

    it('returns an async function', () => {
      const middleware = requirePermissionFn('tickets:purchase');
      expect(typeof middleware).toBe('function');
    });

    it('calls authenticate first', async () => {
      const middleware = requirePermissionFn('tickets:purchase');
      await middleware(mockRequest, mockReply);

      expect(mockServer.authenticate).toHaveBeenCalledWith(mockRequest);
    });

    it('allows access when user has exact permission', async () => {
      const middleware = requirePermissionFn('tickets:purchase');
      
      await expect(middleware(mockRequest, mockReply)).resolves.toBeUndefined();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          permission: 'tickets:purchase',
        }),
        'Authorization successful'
      );
    });

    it('allows access when user has wildcard permission', async () => {
      mockRequest.user.permissions = ['*'];
      const middleware = requirePermissionFn('any:permission');

      await expect(middleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });

    it('allows access when user has resource wildcard permission', async () => {
      mockRequest.user.permissions = ['tickets:*'];
      const middleware = requirePermissionFn('tickets:validate');

      await expect(middleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });

    it('throws AuthorizationError when user lacks permission', async () => {
      const middleware = requirePermissionFn('events:create');

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
        new AuthorizationError('Insufficient permissions: events:create required')
      );
    });

    it('logs security event on unauthorized access attempt', async () => {
      mockRequest.params = { venueId: 'venue-456' };
      const middleware = requirePermissionFn('events:create');

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow();

      expect(logSecurityEvent).toHaveBeenCalledWith(
        'unauthorized_access_attempt',
        expect.objectContaining({
          userId: 'user-123',
          permission: 'events:create',
          path: '/test',
          venueId: 'venue-456',
        }),
        'medium'
      );
    });

    it('checks venue access for venue-scoped roles', async () => {
      mockRequest.user.role = 'venue-manager';
      mockRequest.user.permissions = ['events:create'];
      mockRequest.params = { venueId: 'venue-123' };

      (VenueServiceClient as jest.Mock).mockImplementation(() => ({
        checkUserVenueAccess: jest.fn().mockResolvedValue(true),
      }));

      mockServer.redis.get.mockResolvedValue(null);

      const middleware = requirePermissionFn('events:create');
      await middleware(mockRequest, mockReply);

      const venueClient = (VenueServiceClient as jest.Mock).mock.results[0].value;
      expect(venueClient.checkUserVenueAccess).toHaveBeenCalledWith(
        'user-123',
        'venue-123',
        'events:create'
      );
    });

    it('uses cached venue access when available', async () => {
      mockRequest.user.role = 'venue-manager';
      mockRequest.user.permissions = ['events:create'];
      mockRequest.params = { venueId: 'venue-123' };

      mockServer.redis.get.mockResolvedValue('true');

      const checkAccessMock = jest.fn();
      (VenueServiceClient as jest.Mock).mockImplementation(() => ({
        checkUserVenueAccess: checkAccessMock,
      }));

      const middleware = requirePermissionFn('events:create');
      await middleware(mockRequest, mockReply);

      expect(checkAccessMock).not.toHaveBeenCalled();
    });

    it('caches venue access result', async () => {
      mockRequest.user.role = 'venue-manager';
      mockRequest.user.permissions = ['events:create'];
      mockRequest.params = { venueId: 'venue-123' };

      (VenueServiceClient as jest.Mock).mockImplementation(() => ({
        checkUserVenueAccess: jest.fn().mockResolvedValue(true),
      }));

      mockServer.redis.get.mockResolvedValue(null);

      const middleware = requirePermissionFn('events:create');
      await middleware(mockRequest, mockReply);

      expect(mockServer.redis.setex).toHaveBeenCalledWith(
        `${REDIS_KEYS.CACHE_VENUE}access:user-123:venue-123:events:create`,
        600,
        'true'
      );
    });

    it('throws AuthorizationError when venue access is denied', async () => {
      mockRequest.user.role = 'venue-manager';
      mockRequest.user.permissions = ['events:create'];
      mockRequest.params = { venueId: 'venue-456' };

      (VenueServiceClient as jest.Mock).mockImplementation(() => ({
        checkUserVenueAccess: jest.fn().mockResolvedValue(false),
      }));

      mockServer.redis.get.mockResolvedValue(null);

      const middleware = requirePermissionFn('events:create');

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow(
        new AuthorizationError('Access denied to this venue')
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          venueId: 'venue-456',
          permission: 'events:create',
        }),
        'Venue access denied'
      );
    });

    it('allows ownership-based permissions when user owns resource', async () => {
      mockRequest.user.permissions = ['tickets:view-own'];
      mockRequest.params = { userId: 'user-123' };

      const middleware = requirePermissionFn('tickets:view-own');
      await expect(middleware(mockRequest, mockReply)).resolves.toBeUndefined();
    });

    it('denies ownership-based permissions when user does not own resource', async () => {
      mockRequest.user.permissions = ['tickets:view-own'];
      mockRequest.params = { userId: 'other-user' };

      const middleware = requirePermissionFn('tickets:view-own');
      await expect(middleware(mockRequest, mockReply)).rejects.toThrow(AuthorizationError);
    });

    it('uses venueId from user JWT when not in route params', async () => {
      mockRequest.user.role = 'door-staff';
      mockRequest.user.permissions = ['tickets:validate'];
      mockRequest.user.venueId = 'venue-999';

      (VenueServiceClient as jest.Mock).mockImplementation(() => ({
        checkUserVenueAccess: jest.fn().mockResolvedValue(true),
      }));

      mockServer.redis.get.mockResolvedValue(null);

      const middleware = requirePermissionFn('tickets:validate');
      await middleware(mockRequest, mockReply);

      const venueClient = (VenueServiceClient as jest.Mock).mock.results[0].value;
      expect(venueClient.checkUserVenueAccess).toHaveBeenCalledWith(
        'user-123',
        'venue-999',
        'tickets:validate'
      );
    });
  });

  describe('handleTokenRefresh', () => {
    beforeEach(() => {
      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        getUserById: jest.fn().mockResolvedValue({
          id: 'user-123',
          email: 'test@example.com',
          role: 'customer',
        }),
      }));
    });

    it('throws AuthenticationError when refresh token is missing', async () => {
      mockRequest.body = {};

      await expect(
        handleTokenRefresh(mockServer, mockRequest, mockReply)
      ).rejects.toThrow(AuthenticationError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Refresh token required',
          ip: '127.0.0.1',
        }),
        'Token refresh failed'
      );
    });

    it('throws AuthenticationError when refresh token verification fails', async () => {
      mockRequest.body = { refreshToken: 'invalid-token' };
      mockServer.jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        handleTokenRefresh(mockServer, mockRequest, mockReply)
      ).rejects.toThrow(new AuthenticationError('Invalid refresh token'));
    });

    it('throws AuthenticationError when token type is not refresh', async () => {
      mockRequest.body = { refreshToken: 'some-token' };
      mockServer.jwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-123',
      });

      await expect(
        handleTokenRefresh(mockServer, mockRequest, mockReply)
      ).rejects.toThrow(AuthenticationError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token type',
          ip: '127.0.0.1',
        }),
        'Token refresh failed'
      );
    });

    it('throws AuthenticationError and logs security event when refresh token is not in Redis', async () => {
      mockRequest.body = { refreshToken: 'some-token' };
      mockServer.jwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'refresh',
        tenant_id: 'tenant-123',
        jti: 'jti-123',
        family: 'family-123',
      });
      mockServer.redis.get.mockResolvedValue(null);

      await expect(
        handleTokenRefresh(mockServer, mockRequest, mockReply)
      ).rejects.toThrow(new AuthenticationError('Invalid refresh token'));

      expect(logSecurityEvent).toHaveBeenCalledWith(
        'refresh_token_reuse',
        expect.objectContaining({
          userId: 'user-123',
          family: 'family-123',
          ip: '127.0.0.1',
        }),
        'critical'
      );
    });

    it('generates new access and refresh tokens with preserved tenant_id', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      mockServer.jwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'refresh',
        tenant_id: 'tenant-456',
        jti: 'old-jti',
        family: 'family-123',
      });
      mockServer.redis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' })) // refresh token check
        .mockResolvedValueOnce(null); // user cache check

      mockServer.jwt.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      await handleTokenRefresh(mockServer, mockRequest, mockReply);

      expect(mockServer.jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-123',
          type: 'access',
          tenant_id: 'tenant-456',
          role: 'customer',
        })
      );

      expect(mockServer.jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-123',
          type: 'refresh',
          tenant_id: 'tenant-456',
          family: 'family-123',
          jti: 'mock-nanoid-123',
        }),
        expect.objectContaining({
          expiresIn: expect.any(String),
        })
      );
    });

    it('invalidates old refresh token', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      mockServer.jwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'refresh',
        tenant_id: 'tenant-456',
        jti: 'old-jti',
        family: 'family-123',
      });
      mockServer.redis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(null);

      mockServer.jwt.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      await handleTokenRefresh(mockServer, mockRequest, mockReply);

      expect(mockServer.redis.del).toHaveBeenCalledWith(
        `${REDIS_KEYS.REFRESH_TOKEN}old-jti`
      );
    });

    it('stores new refresh token in Redis with metadata', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      mockRequest.ip = '192.168.1.1';
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      mockServer.jwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'refresh',
        tenant_id: 'tenant-456',
        jti: 'old-jti',
        family: 'family-123',
      });
      mockServer.redis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(null);

      mockServer.jwt.sign.mockImplementation((payload: any) => {
        if (payload.type === 'refresh') {
          return 'new-refresh-token';
        }
        return 'new-access-token';
      });

      await handleTokenRefresh(mockServer, mockRequest, mockReply);

      const setexCall = mockServer.redis.setex.mock.calls.find(
        (call: any[]) => call[0].includes('refresh_token')
      );

      expect(setexCall).toBeDefined();
      expect(setexCall[0]).toContain('refresh_token');
      
      const storedData = JSON.parse(setexCall[2]);
      expect(storedData).toEqual(
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-456',
          family: 'family-123',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          createdAt: expect.any(Number),
        })
      );
    });

    it('returns new token pair with 200 status', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      mockServer.jwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'refresh',
        tenant_id: 'tenant-456',
        jti: 'old-jti',
        family: 'family-123',
      });
      mockServer.redis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(null);

      mockServer.jwt.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      await handleTokenRefresh(mockServer, mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('logs successful token refresh', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      mockServer.jwt.verify.mockReturnValue({
        sub: 'user-123',
        type: 'refresh',
        tenant_id: 'tenant-456',
        jti: 'old-jti',
        family: 'family-123',
      });
      mockServer.redis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(null);

      mockServer.jwt.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      await handleTokenRefresh(mockServer, mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-456',
          tokenFamily: 'family-123',
        }),
        'Token refreshed successfully'
      );
    });

    it('logs error details before re-throwing as generic error', async () => {
      mockRequest.body = { refreshToken: 'invalid-token' };
      mockServer.jwt.verify.mockImplementation(() => {
        throw new Error('Verification failed');
      });

      await expect(
        handleTokenRefresh(mockServer, mockRequest, mockReply)
      ).rejects.toThrow(AuthenticationError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Verification failed',
          ip: '127.0.0.1',
        }),
        'Token refresh failed'
      );
    });
  });
});
