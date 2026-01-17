import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { setupMetricsMiddleware, metrics } from '../../../src/middleware/metrics.middleware';
import { register } from 'prom-client';

jest.mock('prom-client', () => {
  const mockRegister = {
    metrics: jest.fn().mockResolvedValue('# HELP metrics'),
  };

  return {
    register: mockRegister,
    collectDefaultMetrics: jest.fn(),
    Counter: jest.fn().mockImplementation(() => ({
      inc: jest.fn(),
    })),
    Histogram: jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
    })),
    Gauge: jest.fn().mockImplementation(() => ({
      inc: jest.fn(),
      dec: jest.fn(),
      set: jest.fn(),
    })),
  };
});

describe('metrics.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let onRequestHook: Function;
  let onResponseHook: Function;
  let metricsRouteHandler: Function;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServer = {
      get: jest.fn((route: string, handler: Function) => {
        if (route === '/metrics') {
          metricsRouteHandler = handler;
        }
      }),
      addHook: jest.fn((event: string, handler: Function) => {
        if (event === 'onRequest') onRequestHook = handler;
        if (event === 'onResponse') onResponseHook = handler;
      }),
      services: {
        circuitBreakerService: {
          getAllStats: jest.fn().mockReturnValue({}),
        },
      },
      log: {
        info: jest.fn(),
      },
    };

    mockRequest = {
      id: 'test-request-id',
      method: 'GET',
      url: '/api/test',
      headers: {},
      routeOptions: {
        url: '/api/test',
      },
    };

    mockReply = {
      statusCode: 200,
      elapsedTime: 150,
      getHeader: jest.fn(),
      type: jest.fn(),
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('setupMetricsMiddleware', () => {
    it('collects default metrics', async () => {
      const { collectDefaultMetrics } = require('prom-client');

      await setupMetricsMiddleware(mockServer);

      expect(collectDefaultMetrics).toHaveBeenCalledWith({
        prefix: 'api_gateway_',
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      });
    });

    it('registers /metrics endpoint', async () => {
      await setupMetricsMiddleware(mockServer);

      expect(mockServer.get).toHaveBeenCalledWith('/metrics', expect.any(Function));
    });

    it('registers onRequest hook', async () => {
      await setupMetricsMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    });

    it('registers onResponse hook', async () => {
      await setupMetricsMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
    });

    it('logs configuration message', async () => {
      await setupMetricsMiddleware(mockServer);

      expect(mockServer.log.info).toHaveBeenCalledWith('Metrics middleware configured');
    });
  });

  describe('/metrics endpoint', () => {
    beforeEach(async () => {
      await setupMetricsMiddleware(mockServer);
    });

    it('returns metrics in text/plain format', async () => {
      await metricsRouteHandler(mockRequest, mockReply);

      expect(mockReply.type).toHaveBeenCalledWith('text/plain');
    });

    it('returns metrics from register', async () => {
      const result = await metricsRouteHandler(mockRequest, mockReply);

      expect(register.metrics).toHaveBeenCalled();
      expect(result).toBe('# HELP metrics');
    });
  });

  describe('onRequest hook', () => {
    beforeEach(async () => {
      await setupMetricsMiddleware(mockServer);
    });

    it('increments requests in progress gauge', async () => {
      await onRequestHook(mockRequest, mockReply);

      expect(metrics.httpRequestsInProgress.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/test',
      });
    });

    it('uses url when routeOptions not available', async () => {
      mockRequest.routeOptions = undefined;

      await onRequestHook(mockRequest, mockReply);

      expect(metrics.httpRequestsInProgress.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/test',
      });
    });

    it('observes request size when content-length header present', async () => {
      mockRequest.headers['content-length'] = '1024';

      await onRequestHook(mockRequest, mockReply);

      expect(metrics.httpRequestSize.observe).toHaveBeenCalledWith(
        {
          method: 'GET',
          route: '/api/test',
        },
        1024
      );
    });

    it('does not observe request size when content-length missing', async () => {
      await onRequestHook(mockRequest, mockReply);

      expect(metrics.httpRequestSize.observe).not.toHaveBeenCalled();
    });
  });

  describe('onResponse hook', () => {
    beforeEach(async () => {
      await setupMetricsMiddleware(mockServer);
    });

    it('observes request duration in seconds', async () => {
      mockReply.elapsedTime = 250;

      await onResponseHook(mockRequest, mockReply);

      expect(metrics.httpRequestDuration.observe).toHaveBeenCalledWith(
        {
          method: 'GET',
          route: '/api/test',
          status_code: '200',
        },
        0.25
      );
    });

    it('increments total requests counter', async () => {
      await onResponseHook(mockRequest, mockReply);

      expect(metrics.httpRequestTotal.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/test',
        status_code: '200',
      });
    });

    it('decrements requests in progress gauge', async () => {
      await onResponseHook(mockRequest, mockReply);

      expect(metrics.httpRequestsInProgress.dec).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/test',
      });
    });

    it('observes response size when content-length header present', async () => {
      mockReply.getHeader.mockReturnValue('2048');

      await onResponseHook(mockRequest, mockReply);

      expect(metrics.httpResponseSize.observe).toHaveBeenCalledWith(
        {
          method: 'GET',
          route: '/api/test',
        },
        2048
      );
    });

    it('does not observe response size when content-length missing', async () => {
      mockReply.getHeader.mockReturnValue(undefined);

      await onResponseHook(mockRequest, mockReply);

      expect(metrics.httpResponseSize.observe).not.toHaveBeenCalled();
    });

    it('tracks successful authentication attempts', async () => {
      mockRequest.url = '/api/v1/auth/login';
      mockReply.statusCode = 200;

      await onResponseHook(mockRequest, mockReply);

      expect(metrics.authenticationAttempts.inc).toHaveBeenCalledWith({
        status: 'success',
      });
    });

    it('tracks failed authentication attempts', async () => {
      mockRequest.url = '/api/v1/auth/login';
      mockReply.statusCode = 401;

      await onResponseHook(mockRequest, mockReply);

      expect(metrics.authenticationAttempts.inc).toHaveBeenCalledWith({
        status: 'failure',
      });
    });

    it('does not track authentication for non-login routes', async () => {
      mockRequest.url = '/api/v1/users';
      mockReply.statusCode = 200;

      await onResponseHook(mockRequest, mockReply);

      expect(metrics.authenticationAttempts.inc).not.toHaveBeenCalled();
    });

    it('uses url when routeOptions not available', async () => {
      mockRequest.routeOptions = undefined;

      await onResponseHook(mockRequest, mockReply);

      expect(metrics.httpRequestDuration.observe).toHaveBeenCalledWith(
        expect.objectContaining({
          route: '/api/test',
        }),
        expect.any(Number)
      );
    });
  });

  describe('circuit breaker monitoring', () => {
    beforeEach(async () => {
      await setupMetricsMiddleware(mockServer);
    });

    it('sets gauge to 0 for CLOSED circuit breakers', () => {
      mockServer.services.circuitBreakerService.getAllStats.mockReturnValue({
        'venue-service': { state: 'CLOSED' },
      });

      jest.advanceTimersByTime(5000);

      expect(metrics.circuitBreakerState.set).toHaveBeenCalledWith(
        { service: 'venue-service' },
        0
      );
    });

    it('sets gauge to 1 for OPEN circuit breakers', () => {
      mockServer.services.circuitBreakerService.getAllStats.mockReturnValue({
        'auth-service': { state: 'OPEN' },
      });

      jest.advanceTimersByTime(5000);

      expect(metrics.circuitBreakerState.set).toHaveBeenCalledWith(
        { service: 'auth-service' },
        1
      );
    });

    it('sets gauge to 2 for HALF_OPEN circuit breakers', () => {
      mockServer.services.circuitBreakerService.getAllStats.mockReturnValue({
        'payment-service': { state: 'HALF_OPEN' },
      });

      jest.advanceTimersByTime(5000);

      expect(metrics.circuitBreakerState.set).toHaveBeenCalledWith(
        { service: 'payment-service' },
        2
      );
    });

    it('monitors multiple circuit breakers', () => {
      mockServer.services.circuitBreakerService.getAllStats.mockReturnValue({
        'venue-service': { state: 'CLOSED' },
        'auth-service': { state: 'OPEN' },
        'payment-service': { state: 'HALF_OPEN' },
      });

      jest.advanceTimersByTime(5000);

      expect(metrics.circuitBreakerState.set).toHaveBeenCalledTimes(3);
    });

    it('runs monitoring every 5 seconds', () => {
      const getAllStats = mockServer.services.circuitBreakerService.getAllStats;
      getAllStats.mockReturnValue({});

      jest.advanceTimersByTime(5000);
      expect(getAllStats).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5000);
      expect(getAllStats).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(5000);
      expect(getAllStats).toHaveBeenCalledTimes(3);
    });
  });

  describe('exported metrics', () => {
    it('exports httpRequestDuration histogram', () => {
      expect(metrics.httpRequestDuration).toBeDefined();
    });

    it('exports httpRequestTotal counter', () => {
      expect(metrics.httpRequestTotal).toBeDefined();
    });

    it('exports httpRequestsInProgress gauge', () => {
      expect(metrics.httpRequestsInProgress).toBeDefined();
    });

    it('exports httpRequestSize histogram', () => {
      expect(metrics.httpRequestSize).toBeDefined();
    });

    it('exports httpResponseSize histogram', () => {
      expect(metrics.httpResponseSize).toBeDefined();
    });

    it('exports authenticationAttempts counter', () => {
      expect(metrics.authenticationAttempts).toBeDefined();
    });

    it('exports circuitBreakerState gauge', () => {
      expect(metrics.circuitBreakerState).toBeDefined();
    });
  });
});
