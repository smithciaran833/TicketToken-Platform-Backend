import { FastifyRequest, FastifyReply } from 'fastify';
import { metricsMiddleware, getMetrics } from '../../../src/middleware/metrics.middleware';

describe('Metrics Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let finishHandler: () => void;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/api/queues',
      routeOptions: {
        url: '/api/queues',
      } as any,
    };

    finishHandler = jest.fn();
    mockReply = {
      statusCode: 200,
      raw: {
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'finish') {
            finishHandler = handler;
          }
        }),
      } as any,
    };
  });

  describe('metricsMiddleware', () => {
    it('should register finish event handler', async () => {
      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.raw!.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should increment total requests on finish', async () => {
      const initialTotal = getMetrics().totalRequests;

      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      expect(getMetrics().totalRequests).toBe(initialTotal + 1);
    });

    it('should track requests by endpoint', async () => {
      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      const endpoint = 'GET /api/queues';
      expect(getMetrics().requestsByEndpoint.get(endpoint)).toBeGreaterThanOrEqual(1);
    });

    it('should track different endpoints separately', async () => {
      // First request
      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      // Second request to different endpoint
      mockRequest.method = 'POST';
      mockRequest.url = '/api/jobs';
      mockRequest.routeOptions = { url: '/api/jobs' } as any;

      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      expect(getMetrics().requestsByEndpoint.has('GET /api/queues')).toBe(true);
      expect(getMetrics().requestsByEndpoint.has('POST /api/jobs')).toBe(true);
    });

    it('should track requests by status code', async () => {
      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      expect(getMetrics().requestsByStatus.get(200)).toBeGreaterThanOrEqual(1);
    });

    it('should track different status codes separately', async () => {
      // 200 response
      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      // 404 response
      mockReply.statusCode = 404;
      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      expect(getMetrics().requestsByStatus.has(200)).toBe(true);
      expect(getMetrics().requestsByStatus.has(404)).toBe(true);
    });

    it('should calculate average response time', async () => {
      jest.useFakeTimers();

      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      jest.advanceTimersByTime(100);
      finishHandler();

      expect(getMetrics().averageResponseTime).toBeGreaterThanOrEqual(0);

      jest.useRealTimers();
    });

    it('should use request.url when routeOptions.url is undefined', async () => {
      mockRequest.routeOptions = { url: undefined } as any;
      mockRequest.url = '/api/fallback';

      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      expect(getMetrics().requestsByEndpoint.has('GET /api/fallback')).toBe(true);
    });

    it('should increment endpoint count on multiple requests', async () => {
      const endpoint = 'GET /api/queues';
      const initialCount = getMetrics().requestsByEndpoint.get(endpoint) || 0;

      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      await metricsMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      finishHandler();

      expect(getMetrics().requestsByEndpoint.get(endpoint)).toBe(initialCount + 2);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics object with all properties', () => {
      const metrics = getMetrics();

      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('requestsByEndpoint');
      expect(metrics).toHaveProperty('requestsByStatus');
      expect(metrics).toHaveProperty('averageResponseTime');
    });

    it('should return requestsByEndpoint as a Map', () => {
      const metrics = getMetrics();

      expect(metrics.requestsByEndpoint).toBeInstanceOf(Map);
    });

    it('should return requestsByStatus as a Map', () => {
      const metrics = getMetrics();

      expect(metrics.requestsByStatus).toBeInstanceOf(Map);
    });
  });
});
