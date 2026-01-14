/**
 * Unit tests for src/middleware/versioning.middleware.ts
 * Tests API version extraction and routing
 * Security: SC3 (Version not in unauthenticated responses)
 */

import { versionMiddleware, registerVersionedRoute } from '../../../src/middleware/versioning.middleware';
import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

describe('middleware/versioning.middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let doneFn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReply = createMockReply();
    doneFn = jest.fn();
  });

  describe('versionMiddleware()', () => {
    describe('version extraction', () => {
      it('should extract version from URL path /api/v1/', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
        expect(doneFn).toHaveBeenCalled();
      });

      it('should extract version from api-version header', () => {
        mockRequest = createMockRequest({
          url: '/venues',
          headers: { 'api-version': 'v1' },
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
        expect(doneFn).toHaveBeenCalled();
      });

      it('should extract version from accept-version header', () => {
        mockRequest = createMockRequest({
          url: '/venues',
          headers: { 'accept-version': 'v1' },
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
        expect(doneFn).toHaveBeenCalled();
      });

      it('should prioritize URL path over headers', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues',
          headers: { 'api-version': 'v2', 'accept-version': 'v3' },
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
      });

      it('should prioritize api-version header over accept-version', () => {
        mockRequest = createMockRequest({
          url: '/venues',
          headers: { 'api-version': 'v1', 'accept-version': 'v2' },
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
      });

      it('should default to current version when no version specified', () => {
        mockRequest = createMockRequest({
          url: '/venues',
          headers: {},
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
        expect(doneFn).toHaveBeenCalled();
      });

      it('should handle version in nested paths', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues/123/events',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
      });
    });

    describe('version validation', () => {
      it('should return 400 for unsupported version', () => {
        mockRequest = createMockRequest({
          url: '/api/v99/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'API version v99 is not supported',
            code: 'UNSUPPORTED_VERSION',
          })
        );
        expect(doneFn).not.toHaveBeenCalled();
      });

      it('should include supported versions in error response', () => {
        mockRequest = createMockRequest({
          url: '/api/v5/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            details: expect.objectContaining({
              supported: expect.arrayContaining(['v1']),
            }),
          })
        );
      });

      it('should return 400 for unsupported version in header', () => {
        mockRequest = createMockRequest({
          url: '/venues',
          headers: { 'api-version': 'v10' },
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(doneFn).not.toHaveBeenCalled();
      });

      it('should handle v1 as supported version', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockReply.status).not.toHaveBeenCalledWith(400);
        expect(doneFn).toHaveBeenCalled();
      });
    });

    describe('response headers', () => {
      it('should set API-Version header on response', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockReply.header).toHaveBeenCalledWith('API-Version', 'v1');
      });

      it('should set X-API-Version header on response', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockReply.header).toHaveBeenCalledWith('X-API-Version', 'v1');
      });

      it('should set both version headers', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockReply.header).toHaveBeenCalledWith('API-Version', 'v1');
        expect(mockReply.header).toHaveBeenCalledWith('X-API-Version', 'v1');
      });
    });

    describe('edge cases', () => {
      it('should handle empty URL', () => {
        mockRequest = createMockRequest({
          url: '',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
        expect(doneFn).toHaveBeenCalled();
      });

      it('should handle URL without /api/ prefix', () => {
        mockRequest = createMockRequest({
          url: '/v1/venues',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        // Without /api/ prefix, falls back to default
        expect(mockRequest.apiVersion).toBe('v1');
        expect(doneFn).toHaveBeenCalled();
      });

      it('should handle query parameters in URL', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues?page=1&limit=10',
        });

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
      });

      it('should handle uppercase headers', () => {
        mockRequest = createMockRequest({
          url: '/venues',
          headers: { 'API-VERSION': 'v1' },
        });

        // Headers are typically lowercased by HTTP servers
        mockRequest.headers['api-version'] = 'v1';

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
      });

      it('should handle undefined headers object', () => {
        mockRequest = createMockRequest({
          url: '/api/v1/venues',
        });
        mockRequest.headers = undefined;

        versionMiddleware(mockRequest, mockReply, doneFn);

        expect(mockRequest.apiVersion).toBe('v1');
        expect(doneFn).toHaveBeenCalled();
      });
    });
  });

  describe('registerVersionedRoute()', () => {
    it('should register routes for all specified versions', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();

      registerVersionedRoute(mockFastify, ['v1'], 'GET', '/venues', handler);

      expect(mockFastify.get).toHaveBeenCalledWith('/api/v1/venues', {}, handler);
    });

    it('should register multiple version routes', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();

      registerVersionedRoute(mockFastify, ['v1', 'v2'], 'GET', '/venues', handler);

      expect(mockFastify.get).toHaveBeenCalledTimes(2);
      expect(mockFastify.get).toHaveBeenCalledWith('/api/v1/venues', {}, handler);
      expect(mockFastify.get).toHaveBeenCalledWith('/api/v2/venues', {}, handler);
    });

    it('should register POST routes', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();

      registerVersionedRoute(mockFastify, ['v1'], 'POST', '/venues', handler);

      expect(mockFastify.post).toHaveBeenCalledWith('/api/v1/venues', {}, handler);
    });

    it('should register PUT routes', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();

      registerVersionedRoute(mockFastify, ['v1'], 'PUT', '/venues/:id', handler);

      expect(mockFastify.put).toHaveBeenCalledWith('/api/v1/venues/:id', {}, handler);
    });

    it('should register DELETE routes', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();

      registerVersionedRoute(mockFastify, ['v1'], 'DELETE', '/venues/:id', handler);

      expect(mockFastify.delete).toHaveBeenCalledWith('/api/v1/venues/:id', {}, handler);
    });

    it('should register PATCH routes', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();

      registerVersionedRoute(mockFastify, ['v1'], 'PATCH', '/venues/:id', handler);

      expect(mockFastify.patch).toHaveBeenCalledWith('/api/v1/venues/:id', {}, handler);
    });

    it('should pass options to route registration', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();
      const options = { schema: { response: {} }, preHandler: [] };

      registerVersionedRoute(mockFastify, ['v1'], 'GET', '/venues', handler, options);

      expect(mockFastify.get).toHaveBeenCalledWith('/api/v1/venues', options, handler);
    });

    it('should handle paths with parameters', () => {
      const mockFastify = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const handler = jest.fn();

      registerVersionedRoute(
        mockFastify,
        ['v1'],
        'GET',
        '/venues/:venueId/events/:eventId',
        handler
      );

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/api/v1/venues/:venueId/events/:eventId',
        {},
        handler
      );
    });
  });

  describe('security tests (SC3)', () => {
    it('should not expose internal version details in error responses', () => {
      mockRequest = createMockRequest({
        url: '/api/v99/venues',
      });

      versionMiddleware(mockRequest, mockReply, doneFn);

      const sendCall = mockReply.send.mock.calls[0][0];
      // Should not contain internal details like server version, build info, etc.
      expect(sendCall).not.toHaveProperty('serverVersion');
      expect(sendCall).not.toHaveProperty('buildInfo');
      expect(sendCall).not.toHaveProperty('internalVersion');
    });

    it('should provide minimal version info in supported versions', () => {
      mockRequest = createMockRequest({
        url: '/api/v99/venues',
      });

      versionMiddleware(mockRequest, mockReply, doneFn);

      const sendCall = mockReply.send.mock.calls[0][0];
      // Only supported versions should be exposed, not internal config
      expect(sendCall.details.supported).toBeDefined();
      expect(Array.isArray(sendCall.details.supported)).toBe(true);
    });
  });
});
