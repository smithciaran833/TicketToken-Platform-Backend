import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { setupLoggingMiddleware } from '../../../src/middleware/logging.middleware';
import { logRequest, logResponse, performanceLogger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger');

describe('logging.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let onRequestHook: Function;
  let onResponseHook: Function;
  let onRouteHook: Function;
  let mockPerformanceLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPerformanceLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };

    (performanceLogger as any) = mockPerformanceLogger;

    mockServer = {
      addHook: jest.fn((event: string, handler: Function) => {
        if (event === 'onRequest') onRequestHook = handler;
        if (event === 'onResponse') onResponseHook = handler;
        if (event === 'onRoute') onRouteHook = handler;
      }),
      log: {
        debug: jest.fn(),
      },
    };

    mockRequest = {
      id: 'test-request-id',
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1',
      routeOptions: {
        url: '/api/test',
      },
    };

    mockReply = {
      elapsedTime: 100,
      statusCode: 200,
    };
  });

  describe('setupLoggingMiddleware', () => {
    it('registers onRequest hook', async () => {
      await setupLoggingMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    });

    it('registers onResponse hook', async () => {
      await setupLoggingMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
    });

    it('registers onRoute hook', async () => {
      await setupLoggingMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onRoute', expect.any(Function));
    });
  });

  describe('onRequest hook', () => {
    beforeEach(async () => {
      await setupLoggingMiddleware(mockServer);
    });

    it('logs incoming requests', async () => {
      await onRequestHook(mockRequest);

      expect(logRequest).toHaveBeenCalledWith(mockRequest);
    });

    it('skips logging for /health endpoint', async () => {
      mockRequest.url = '/health';

      await onRequestHook(mockRequest);

      expect(logRequest).not.toHaveBeenCalled();
    });

    it('skips logging for /health/* endpoints', async () => {
      mockRequest.url = '/health/liveness';

      await onRequestHook(mockRequest);

      expect(logRequest).not.toHaveBeenCalled();
    });

    it('skips logging for /ready endpoint', async () => {
      mockRequest.url = '/ready';

      await onRequestHook(mockRequest);

      expect(logRequest).not.toHaveBeenCalled();
    });

    it('skips logging for /metrics endpoint', async () => {
      mockRequest.url = '/metrics';

      await onRequestHook(mockRequest);

      expect(logRequest).not.toHaveBeenCalled();
    });

    it('logs requests to /api endpoints', async () => {
      mockRequest.url = '/api/users';

      await onRequestHook(mockRequest);

      expect(logRequest).toHaveBeenCalledWith(mockRequest);
    });

    it('logs requests to root endpoint', async () => {
      mockRequest.url = '/';

      await onRequestHook(mockRequest);

      expect(logRequest).toHaveBeenCalledWith(mockRequest);
    });
  });

  describe('onResponse hook', () => {
    beforeEach(async () => {
      await setupLoggingMiddleware(mockServer);
    });

    it('logs responses with response time', async () => {
      mockReply.elapsedTime = 250;

      await onResponseHook(mockRequest, mockReply);

      expect(logResponse).toHaveBeenCalledWith(mockRequest, mockReply, 250);
    });

    it('skips logging for /health endpoint', async () => {
      mockRequest.url = '/health';

      await onResponseHook(mockRequest, mockReply);

      expect(logResponse).not.toHaveBeenCalled();
    });

    it('skips logging for /ready endpoint', async () => {
      mockRequest.url = '/ready';

      await onResponseHook(mockRequest, mockReply);

      expect(logResponse).not.toHaveBeenCalled();
    });

    it('skips logging for /metrics endpoint', async () => {
      mockRequest.url = '/metrics';

      await onResponseHook(mockRequest, mockReply);

      expect(logResponse).not.toHaveBeenCalled();
    });

    it('does not log slow request warning for fast requests', async () => {
      mockReply.elapsedTime = 500;

      await onResponseHook(mockRequest, mockReply);

      expect(mockPerformanceLogger.warn).not.toHaveBeenCalled();
    });

    it('logs slow request warning for requests over 1000ms', async () => {
      mockReply.elapsedTime = 1500;

      await onResponseHook(mockRequest, mockReply);

      expect(mockPerformanceLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-request-id',
          correlationId: 'test-request-id',
          method: 'GET',
          url: '/api/test',
          responseTime: 1500,
          statusCode: 200,
        }),
        'Slow request detected: 1500ms'
      );
    });

    it('logs slow request with route from routeOptions', async () => {
      mockReply.elapsedTime = 2000;
      mockRequest.routeOptions = { url: '/api/users/:id' };

      await onResponseHook(mockRequest, mockReply);

      expect(mockPerformanceLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/users/:id',
        }),
        expect.any(String)
      );
    });

    it('uses request url as route when routeOptions not available', async () => {
      mockReply.elapsedTime = 2000;
      mockRequest.routeOptions = undefined;

      await onResponseHook(mockRequest, mockReply);

      expect(mockPerformanceLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/test',
        }),
        expect.any(String)
      );
    });

    it('logs slow request at exactly 1000ms threshold', async () => {
      mockReply.elapsedTime = 1000;

      await onResponseHook(mockRequest, mockReply);

      expect(mockPerformanceLogger.warn).not.toHaveBeenCalled();
    });

    it('logs slow request at 1001ms', async () => {
      mockReply.elapsedTime = 1001;

      await onResponseHook(mockRequest, mockReply);

      expect(mockPerformanceLogger.warn).toHaveBeenCalled();
    });

    it('includes status code in slow request log', async () => {
      mockReply.elapsedTime = 3000;
      mockReply.statusCode = 500;

      await onResponseHook(mockRequest, mockReply);

      expect(mockPerformanceLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        }),
        expect.any(String)
      );
    });
  });

  describe('onRoute hook', () => {
    beforeEach(async () => {
      await setupLoggingMiddleware(mockServer);
    });

    it('logs route registration with debug level', () => {
      const routeOptions = {
        method: 'GET',
        url: '/api/users',
        prefix: '/api',
        logLevel: 'info',
      };

      onRouteHook(routeOptions);

      expect(mockServer.log.debug).toHaveBeenCalledWith(
        {
          method: 'GET',
          url: '/api/users',
          prefix: '/api',
          logLevel: 'info',
        },
        'Route registered'
      );
    });

    it('logs POST route registration', () => {
      const routeOptions = {
        method: 'POST',
        url: '/api/users',
        prefix: '',
        logLevel: 'info',
      };

      onRouteHook(routeOptions);

      expect(mockServer.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/users',
        }),
        'Route registered'
      );
    });

    it('logs route with custom prefix', () => {
      const routeOptions = {
        method: 'GET',
        url: '/users',
        prefix: '/v1/api',
        logLevel: 'warn',
      };

      onRouteHook(routeOptions);

      expect(mockServer.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: '/v1/api',
        }),
        'Route registered'
      );
    });
  });
});
