import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Create a singleton mock cache manager that will be reused
const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
};

// Mock MUST return the same object instance every time
jest.mock('@tickettoken/shared', () => ({
  getCacheManager: jest.fn(() => mockCacheManager),
}));

import { responseCachePlugin, cacheInvalidationRoutes } from '../../../src/middleware/response-cache';

describe('response-cache middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let onRequestHook: Function;
  let onSendHook: Function;

  beforeEach(() => {
    jest.clearAllMocks();

    onRequestHook = jest.fn();
    onSendHook = jest.fn();

    mockServer = {
      addHook: jest.fn((event: string, handler: Function) => {
        if (event === 'onRequest') onRequestHook = handler;
        if (event === 'onSend') onSendHook = handler;
      }),
      post: jest.fn(),
      get: jest.fn(),
    };

    mockRequest = {
      method: 'GET',
      url: '/api/events?page=1',
      query: {},
      headers: {},
      id: 'req-123',
    };

    mockReply = {
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
      statusCode: 200,
      sent: false,
    };
  });

  describe('responseCachePlugin', () => {
    it('registers onRequest and onSend hooks', () => {
      responseCachePlugin(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(mockServer.addHook).toHaveBeenCalledWith('onSend', expect.any(Function));
    });

    describe('onRequest hook - cache lookup', () => {
      beforeEach(() => {
        responseCachePlugin(mockServer);
      });

      it('skips caching for POST requests', async () => {
        mockRequest.method = 'POST';
        mockRequest.url = '/api/events';

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('skips caching for PUT requests', async () => {
        mockRequest.method = 'PUT';
        mockRequest.url = '/api/events';

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).not.toHaveBeenCalled();
      });

      it('skips caching for DELETE requests', async () => {
        mockRequest.method = 'DELETE';
        mockRequest.url = '/api/events';

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).not.toHaveBeenCalled();
      });

      it('allows HEAD requests to be cached', async () => {
        mockRequest.method = 'HEAD';
        mockRequest.url = '/api/events';

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).toHaveBeenCalled();
      });

      it('skips caching for unconfigured routes', async () => {
        mockRequest.url = '/api/uncached-route';

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).not.toHaveBeenCalled();
      });

      it('returns cached response on cache hit', async () => {
        mockRequest.url = '/api/events';
        const cachedData = { events: [{ id: 1, name: 'Event 1' }] };
        mockCacheManager.get.mockResolvedValue(cachedData);

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).toHaveBeenCalledWith('gateway:response:GET:/api/events');
        expect(mockReply.header).toHaveBeenCalledWith('X-Cache', 'HIT');
        expect(mockReply.header).toHaveBeenCalledWith('X-Cache-TTL', '600');
        expect(mockReply.send).toHaveBeenCalledWith(cachedData);
      });

      it('sets cache MISS header on cache miss', async () => {
        mockRequest.url = '/api/events';
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-Cache', 'MISS');
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('generates cache key with query params when varyBy is configured', async () => {
        mockRequest.url = '/api/search?q=concert&category=music';
        mockRequest.query = { q: 'concert', category: 'music' };
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).toHaveBeenCalledWith(
          'gateway:response:GET:/api/search:q:concert:category:music'
        );
      });

      it('handles missing query params in varyBy with empty string', async () => {
        mockRequest.url = '/api/search?q=concert';
        mockRequest.query = { q: 'concert' };
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).toHaveBeenCalledWith(
          'gateway:response:GET:/api/search:q:concert:category:'
        );
      });

      it('includes venue ID in cache key for multi-tenant isolation', async () => {
        mockRequest.url = '/api/events';
        mockRequest.venueContext = { venueId: 'venue-123' };
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).toHaveBeenCalledWith(
          'gateway:response:GET:/api/events:venue:venue-123'
        );
      });

      it('strips query string from path when generating cache key', async () => {
        mockRequest.url = '/api/venues?page=2&limit=10';
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockCacheManager.get).toHaveBeenCalledWith(
          'gateway:response:GET:/api/venues'
        );
      });

      it('includes truncated cache key in header for debugging', async () => {
        mockRequest.url = '/api/search?q=verylongquerystring&category=music';
        mockRequest.query = { q: 'verylongquerystring', category: 'music' };
        const cachedData = { results: [] };
        mockCacheManager.get.mockResolvedValue(cachedData);

        await onRequestHook(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith(
          'X-Cache-Key',
          expect.stringContaining('...')
        );
      });

      it('stores cache config on request for onSend hook', async () => {
        mockRequest.url = '/api/events';
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.cacheConfig).toEqual({
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        });
      });

      it('uses default TTL when not specified in config', async () => {
        mockRequest.url = '/api/events';
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.cacheConfig.ttl).toBe(600);
      });
    });

    describe('onSend hook - cache storage', () => {
      beforeEach(() => {
        responseCachePlugin(mockServer);
      });

      it('caches response with 200 status code', async () => {
        mockRequest.cacheConfig = {
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        };
        mockReply.statusCode = 200;
        const payload = JSON.stringify({ events: [{ id: 1 }] });

        await onSendHook(mockRequest, mockReply, payload);

        expect(mockCacheManager.set).toHaveBeenCalledWith(
          'gateway:response:GET:/api/events',
          { events: [{ id: 1 }] },
          600
        );
      });

      it('does not cache non-200 responses', async () => {
        mockRequest.cacheConfig = {
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        };
        mockReply.statusCode = 404;
        const payload = JSON.stringify({ error: 'Not found' });

        await onSendHook(mockRequest, mockReply, payload);

        expect(mockCacheManager.set).not.toHaveBeenCalled();
      });

      it('does not cache when cacheConfig is missing', async () => {
        mockReply.statusCode = 200;
        const payload = JSON.stringify({ data: 'test' });

        await onSendHook(mockRequest, mockReply, payload);

        expect(mockCacheManager.set).not.toHaveBeenCalled();
      });

      it('does not cache when payload is empty', async () => {
        mockRequest.cacheConfig = {
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        };
        mockReply.statusCode = 200;

        await onSendHook(mockRequest, mockReply, null);

        expect(mockCacheManager.set).not.toHaveBeenCalled();
      });

      it('handles object payloads without parsing', async () => {
        mockRequest.cacheConfig = {
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        };
        mockReply.statusCode = 200;
        const payload = { events: [{ id: 1 }] };

        await onSendHook(mockRequest, mockReply, payload);

        expect(mockCacheManager.set).toHaveBeenCalledWith(
          'gateway:response:GET:/api/events',
          payload,
          600
        );
      });

      it('handles cache set errors gracefully without failing request', async () => {
        mockRequest.cacheConfig = {
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        };
        mockReply.statusCode = 200;
        const payload = JSON.stringify({ data: 'test' });
        mockCacheManager.set.mockRejectedValue(new Error('Redis error'));

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const result = await onSendHook(mockRequest, mockReply, payload);

        expect(result).toBe(payload);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Cache set error:', expect.any(Error));

        consoleErrorSpy.mockRestore();
      });

      it('handles invalid JSON gracefully', async () => {
        mockRequest.cacheConfig = {
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        };
        mockReply.statusCode = 200;
        const payload = 'invalid json{';

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        await onSendHook(mockRequest, mockReply, payload);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Cache set error:', expect.any(Error));

        consoleErrorSpy.mockRestore();
      });

      it('returns original payload unchanged', async () => {
        mockRequest.cacheConfig = {
          cacheKey: 'gateway:response:GET:/api/events',
          ttl: 600,
        };
        mockReply.statusCode = 200;
        const payload = JSON.stringify({ data: 'test' });

        const result = await onSendHook(mockRequest, mockReply, payload);

        expect(result).toBe(payload);
      });
    });

    describe('route-specific configurations', () => {
      beforeEach(() => {
        responseCachePlugin(mockServer);
      });

      it('caches /api/events with 10 minute TTL', async () => {
        mockRequest.url = '/api/events';
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.cacheConfig.ttl).toBe(600);
      });

      it('caches /api/venues with 30 minute TTL', async () => {
        mockRequest.url = '/api/venues';
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.cacheConfig.ttl).toBe(1800);
      });

      it('caches /api/tickets/availability with 30 second TTL', async () => {
        mockRequest.url = '/api/tickets/availability';
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.cacheConfig.ttl).toBe(30);
      });

      it('caches /api/search with query param variations', async () => {
        mockRequest.url = '/api/search?q=test&category=music';
        mockRequest.query = { q: 'test', category: 'music' };
        mockCacheManager.get.mockResolvedValue(null);

        await onRequestHook(mockRequest, mockReply);

        expect(mockRequest.cacheConfig.cacheKey).toContain('q:test');
        expect(mockRequest.cacheConfig.cacheKey).toContain('category:music');
        expect(mockRequest.cacheConfig.ttl).toBe(300);
      });
    });
  });

  describe('cacheInvalidationRoutes', () => {
    beforeEach(() => {
      cacheInvalidationRoutes(mockServer);
    });

    it('registers POST /admin/cache/invalidate endpoint', () => {
      expect(mockServer.post).toHaveBeenCalledWith(
        '/admin/cache/invalidate',
        expect.any(Function)
      );
    });

    it('registers GET /admin/cache/stats endpoint', () => {
      expect(mockServer.get).toHaveBeenCalledWith(
        '/admin/cache/stats',
        expect.any(Function)
      );
    });

    describe('POST /admin/cache/invalidate', () => {
      let invalidateHandler: Function;

      beforeEach(() => {
        const postCall = mockServer.post.mock.calls.find(
          (call: any) => call[0] === '/admin/cache/invalidate'
        );
        invalidateHandler = postCall[1];
      });

      it('invalidates cache with single pattern', async () => {
        mockRequest.body = { patterns: ['gateway:response:GET:/api/events*'] };
        mockCacheManager.invalidate.mockResolvedValue(5);

        await invalidateHandler(mockRequest, mockReply);

        expect(mockCacheManager.invalidate).toHaveBeenCalledWith(
          'gateway:response:GET:/api/events*'
        );
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          invalidated: 1,
        });
      });

      it('invalidates cache with multiple patterns', async () => {
        mockRequest.body = {
          patterns: [
            'gateway:response:GET:/api/events*',
            'gateway:response:GET:/api/venues*',
            'gateway:response:GET:/api/search*',
          ],
        };

        await invalidateHandler(mockRequest, mockReply);

        expect(mockCacheManager.invalidate).toHaveBeenCalledTimes(3);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          invalidated: 3,
        });
      });

      it('returns 400 when patterns is not an array', async () => {
        mockRequest.body = { patterns: 'not-an-array' };

        await invalidateHandler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'patterns array required',
        });
      });

      it('returns 400 when patterns is missing', async () => {
        mockRequest.body = {};

        await invalidateHandler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'patterns array required',
        });
      });

      it('invalidates empty patterns array successfully', async () => {
        mockRequest.body = { patterns: [] };

        await invalidateHandler(mockRequest, mockReply);

        expect(mockCacheManager.invalidate).not.toHaveBeenCalled();
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          invalidated: 0,
        });
      });
    });

    describe('GET /admin/cache/stats', () => {
      let statsHandler: Function;

      beforeEach(() => {
        const getCall = mockServer.get.mock.calls.find(
          (call: any) => call[0] === '/admin/cache/stats'
        );
        statsHandler = getCall[1];
      });

      it('returns cache stats information', async () => {
        await statsHandler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          message: 'Cache stats available via Redis monitoring',
          backend: 'Redis via @tickettoken/shared',
        });
      });
    });
  });
});
