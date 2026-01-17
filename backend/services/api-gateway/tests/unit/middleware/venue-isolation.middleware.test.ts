import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  setupVenueIsolationMiddleware,
  checkVenuePermission,
  getUserVenues,
  checkVenueTierAccess,
  getVenueRateLimit,
} from '../../../src/middleware/venue-isolation.middleware';
import { NotFoundError, AuthorizationError } from '../../../src/types';

jest.mock('../../../src/config', () => ({
  config: {
    rateLimit: {
      global: {
        max: 100,
      },
    },
  },
}));

jest.mock('../../../src/config/redis', () => ({
  REDIS_KEYS: {
    CACHE_VENUE: 'cache:venue:',
    SESSION: 'session:',
  },
  REDIS_TTL: {
    CACHE_MEDIUM: 300,
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  logSecurityEvent: jest.fn(),
}));

describe('venue-isolation.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let preHandlerHooks: Function[];

  beforeEach(() => {
    jest.clearAllMocks();
    preHandlerHooks = [];

    mockServer = {
      addHook: jest.fn((event: string, handler: Function) => {
        if (event === 'preHandler') {
          preHandlerHooks.push(handler);
        }
      }),
      redis: {
        get: jest.fn(),
        setex: jest.fn(),
      },
    };

    mockRequest = {
      id: 'req-123',
      url: '/api/venues/venue-123/events',
      method: 'GET',
      ip: '127.0.0.1',
      headers: {},
      params: {},
      query: {},
      user: undefined,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('setupVenueIsolationMiddleware', () => {
    it('registers two preHandler hooks', async () => {
      await setupVenueIsolationMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledTimes(2);
      expect(mockServer.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    describe('venue isolation preHandler', () => {
      beforeEach(async () => {
        await setupVenueIsolationMiddleware(mockServer);
      });

      it('skips public routes', async () => {
        mockRequest.url = '/health';

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockServer.redis.get).not.toHaveBeenCalled();
      });

      it('skips health check routes', async () => {
        mockRequest.url = '/ready';

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockServer.redis.get).not.toHaveBeenCalled();
      });

      it('skips metrics routes', async () => {
        mockRequest.url = '/metrics';

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockServer.redis.get).not.toHaveBeenCalled();
      });

      it('skips auth routes', async () => {
        mockRequest.url = '/api/v1/auth/login';

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockServer.redis.get).not.toHaveBeenCalled();
      });

      it('skips when no venue ID in request', async () => {
        mockRequest.url = '/api/general';
        mockRequest.params = {};

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockServer.redis.get).not.toHaveBeenCalled();
      });

      it('skips when user not authenticated', async () => {
        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.user = undefined;

        await preHandlerHooks[0](mockRequest, mockReply);

        // Should still check for venue but not fail
        expect(mockServer.redis.get).not.toHaveBeenCalled();
      });

      it('grants access when user has venue access (cached)', async () => {
        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.user = { id: 'user-123', venueId: 'venue-123', role: 'user' };

        mockServer.redis.get.mockResolvedValue('true');

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext).toEqual({
          venueId: 'venue-123',
          userId: 'user-123',
          role: 'user',
          permissions: [],
        });
      });

      it('grants admin access with bypass logging', async () => {
        const { logSecurityEvent } = require('../../../src/utils/logger');
        mockRequest.params = { venueId: 'venue-456' };
        mockRequest.user = { id: 'user-admin', venueId: 'venue-123', role: 'admin' };

        mockServer.redis.get.mockResolvedValueOnce('admin');

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(logSecurityEvent).toHaveBeenCalledWith(
          'admin_venue_bypass',
          expect.objectContaining({
            userId: 'user-admin',
            venueId: 'venue-456',
          }),
          'medium'
        );
      });

      it('throws NotFoundError for unauthorized venue access', async () => {
        mockRequest.params = { venueId: 'venue-456' };
        mockRequest.user = { id: 'user-123', venueId: 'venue-123', role: 'user' };

        mockServer.redis.get.mockResolvedValue('false');

        await expect(preHandlerHooks[0](mockRequest, mockReply)).rejects.toThrow(NotFoundError);
      });

      it('logs security violation on unauthorized access attempt', async () => {
        const { logSecurityEvent } = require('../../../src/utils/logger');
        mockRequest.params = { venueId: 'venue-456' };
        mockRequest.user = { id: 'user-123', venueId: 'venue-123', role: 'user' };

        mockServer.redis.get.mockResolvedValue('false');

        try {
          await preHandlerHooks[0](mockRequest, mockReply);
        } catch (error) {
          // Expected
        }

        expect(logSecurityEvent).toHaveBeenCalledWith(
          'venue_access_violation',
          expect.objectContaining({
            userId: 'user-123',
            attemptedVenueId: 'venue-456',
          }),
          'high'
        );
      });

      it('checks user session when cache miss', async () => {
        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.user = { id: 'user-123', venueId: 'venue-123', role: 'user' };

        mockServer.redis.get
          .mockResolvedValueOnce(null) // Cache miss
          .mockResolvedValueOnce(JSON.stringify({ venueId: 'venue-123', role: 'user' })); // User data

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockServer.redis.setex).toHaveBeenCalledWith(
          'cache:venue:access:user-123:venue-123',
          300,
          'true'
        );
      });

      it('extracts venue ID from route params', async () => {
        mockRequest.params = { venueId: 'venue-from-params' };
        mockRequest.user = { id: 'user-123', role: 'admin' };

        mockServer.redis.get.mockResolvedValue('admin');

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext.venueId).toBe('venue-from-params');
      });

      it('extracts venue ID from query params', async () => {
        mockRequest.query = { venueId: 'venue-from-query' };
        mockRequest.user = { id: 'user-123', role: 'admin' };

        mockServer.redis.get.mockResolvedValue('admin');

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext.venueId).toBe('venue-from-query');
      });

      it('extracts venue ID from user JWT', async () => {
        mockRequest.user = { id: 'user-123', venueId: 'venue-from-jwt', role: 'user' };

        mockServer.redis.get.mockResolvedValue('true');

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext.venueId).toBe('venue-from-jwt');
      });

      it('never extracts venue ID from request body (security)', async () => {
        mockRequest.body = { venueId: 'venue-from-body-attack' };
        mockRequest.user = { id: 'user-123', role: 'user' };

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext).toBeUndefined();
      });

      it('never extracts venue ID from headers (security)', async () => {
        mockRequest.headers = { 'x-venue-id': 'venue-from-header-attack' };
        mockRequest.user = { id: 'user-123', role: 'user' };

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext).toBeUndefined();
      });

      it('prioritizes route params over query params', async () => {
        mockRequest.params = { venueId: 'venue-params' };
        mockRequest.query = { venueId: 'venue-query' };
        mockRequest.user = { id: 'user-123', role: 'admin' };

        mockServer.redis.get.mockResolvedValue('admin');

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext.venueId).toBe('venue-params');
      });

      it('includes user permissions in venue context', async () => {
        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.user = {
          id: 'user-123',
          venueId: 'venue-123',
          role: 'manager',
          permissions: ['events:*', 'tickets:view'],
        };

        mockServer.redis.get.mockResolvedValue('true');

        await preHandlerHooks[0](mockRequest, mockReply);

        expect(mockRequest.venueContext.permissions).toEqual(['events:*', 'tickets:view']);
      });
    });

    describe('API key venue validation preHandler', () => {
      beforeEach(async () => {
        await setupVenueIsolationMiddleware(mockServer);
      });

      it('skips validation when no API key present', async () => {
        await preHandlerHooks[1](mockRequest, mockReply);

        expect(mockServer.redis.get).not.toHaveBeenCalled();
      });

      it('validates API key venue access successfully', async () => {
        mockRequest.headers['x-api-key'] = 'test-api-key';
        mockRequest.url = '/api/venues/venue-123/events';

        mockServer.redis.get.mockResolvedValue(
          JSON.stringify({ venueId: 'venue-123' })
        );

        await preHandlerHooks[1](mockRequest, mockReply);

        expect(mockServer.redis.get).toHaveBeenCalledWith('api:key:test-api-key');
      });

      it('throws AuthorizationError for cross-venue API access attempt', async () => {
        mockRequest.headers['x-api-key'] = 'test-api-key';
        mockRequest.url = '/api/venues/venue-456/events';

        mockServer.redis.get.mockResolvedValue(
          JSON.stringify({ venueId: 'venue-123' })
        );

        await expect(preHandlerHooks[1](mockRequest, mockReply)).rejects.toThrow(
          AuthorizationError
        );
      });

      it('logs critical security event for cross-venue attempt', async () => {
        const { logSecurityEvent } = require('../../../src/utils/logger');
        mockRequest.headers['x-api-key'] = 'test-api-key-12345';
        mockRequest.url = '/api/venues/venue-456/events';

        mockServer.redis.get.mockResolvedValue(
          JSON.stringify({ venueId: 'venue-123' })
        );

        try {
          await preHandlerHooks[1](mockRequest, mockReply);
        } catch (error) {
          // Expected
        }

        expect(logSecurityEvent).toHaveBeenCalledWith(
          'cross_venue_api_attempt',
          expect.objectContaining({
            authorizedVenue: 'venue-123',
            attemptedVenue: 'venue-456',
          }),
          'critical'
        );
      });

      it('allows API key for non-venue-specific resources', async () => {
        mockRequest.headers['x-api-key'] = 'test-api-key';
        mockRequest.url = '/api/health';

        mockServer.redis.get.mockResolvedValue(
          JSON.stringify({ venueId: 'venue-123' })
        );

        await expect(preHandlerHooks[1](mockRequest, mockReply)).resolves.not.toThrow();
      });

      it('throws AuthorizationError for invalid API key', async () => {
        mockRequest.headers['x-api-key'] = 'invalid-key';
        mockRequest.url = '/api/venues/venue-123/events';

        mockServer.redis.get.mockResolvedValue(null);

        await expect(preHandlerHooks[1](mockRequest, mockReply)).rejects.toThrow(
          AuthorizationError
        );
      });
    });
  });

  describe('checkVenuePermission', () => {
    it('returns true for admin with any permission', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'admin', venueId: 'venue-123' })
      );

      const result = await checkVenuePermission(mockServer, 'user-admin', 'venue-456', 'events:delete');

      expect(result).toBe(true);
    });

    it('returns false when user not found', async () => {
      mockServer.redis.get.mockResolvedValue(null);

      const result = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'events:view');

      expect(result).toBe(false);
    });

    it('returns false when user not member of venue', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'venue-manager', venueId: 'venue-123' })
      );

      const result = await checkVenuePermission(mockServer, 'user-123', 'venue-456', 'events:view');

      expect(result).toBe(false);
    });

    it('grants venue-owner all permissions', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'venue-owner', venueId: 'venue-123' })
      );

      const result = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'anything:delete');

      expect(result).toBe(true);
    });

    it('grants venue-manager specific permissions', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'venue-manager', venueId: 'venue-123' })
      );

      const result = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'events:create');

      expect(result).toBe(true);
    });

    it('denies venue-manager unauthorized permissions', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'venue-manager', venueId: 'venue-123' })
      );

      const result = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'payments:refund');

      expect(result).toBe(false);
    });

    it('handles wildcard permissions correctly', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'venue-manager', venueId: 'venue-123' })
      );

      const result = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'events:update');

      expect(result).toBe(true);
    });

    it('grants box-office specific permissions', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'box-office', venueId: 'venue-123' })
      );

      const result = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'tickets:sell');

      expect(result).toBe(true);
    });

    it('grants door-staff ticket validation only', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ role: 'door-staff', venueId: 'venue-123' })
      );

      const resultValid = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'tickets:validate');
      const resultDenied = await checkVenuePermission(mockServer, 'user-123', 'venue-123', 'tickets:sell');

      expect(resultValid).toBe(true);
      expect(resultDenied).toBe(false);
    });
  });

  describe('getUserVenues', () => {
    it('returns user venues from session', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ venueId: 'venue-123' })
      );

      const result = await getUserVenues(mockServer, 'user-123');

      expect(result).toEqual(['venue-123']);
    });

    it('returns empty array when user not found', async () => {
      mockServer.redis.get.mockResolvedValue(null);

      const result = await getUserVenues(mockServer, 'user-123');

      expect(result).toEqual([]);
    });

    it('returns empty array when user has no venue', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ venueId: null })
      );

      const result = await getUserVenues(mockServer, 'user-123');

      expect(result).toEqual([]);
    });
  });

  describe('checkVenueTierAccess', () => {
    it('allows same tier access', () => {
      expect(checkVenueTierAccess('standard', 'standard')).toBe(true);
    });

    it('allows higher tier to access lower tier features', () => {
      expect(checkVenueTierAccess('premium', 'standard')).toBe(true);
      expect(checkVenueTierAccess('premium', 'free')).toBe(true);
      expect(checkVenueTierAccess('standard', 'free')).toBe(true);
    });

    it('denies lower tier from accessing higher tier features', () => {
      expect(checkVenueTierAccess('free', 'standard')).toBe(false);
      expect(checkVenueTierAccess('free', 'premium')).toBe(false);
      expect(checkVenueTierAccess('standard', 'premium')).toBe(false);
    });
  });

  describe('getVenueRateLimit', () => {
    it('returns premium tier multiplied rate limit', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ tier: 'premium' })
      );

      const result = await getVenueRateLimit(mockServer, 'venue-123');

      expect(result).toBe(1000); // 100 * 10
    });

    it('returns standard tier multiplied rate limit', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ tier: 'standard' })
      );

      const result = await getVenueRateLimit(mockServer, 'venue-123');

      expect(result).toBe(500); // 100 * 5
    });

    it('returns free tier rate limit', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ tier: 'free' })
      );

      const result = await getVenueRateLimit(mockServer, 'venue-123');

      expect(result).toBe(100); // 100 * 1
    });

    it('returns default rate limit when venue not found', async () => {
      mockServer.redis.get.mockResolvedValue(null);

      const result = await getVenueRateLimit(mockServer, 'venue-123');

      expect(result).toBe(100);
    });

    it('returns default rate limit for unknown tier', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ tier: 'unknown' })
      );

      const result = await getVenueRateLimit(mockServer, 'venue-123');

      expect(result).toBe(100);
    });
  });
});
