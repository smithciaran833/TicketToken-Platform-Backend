// Mock ALL services and dependencies BEFORE any imports
jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn().mockReturnValue({
    query: jest.fn(),
  }),
}));

jest.mock('../../../src/services/rate-limiter.service', () => ({
  RateLimiterService: {
    getInstance: jest.fn().mockReturnValue({
      checkLimit: jest.fn(),
      resetLimit: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    incrementCounter: jest.fn(),
    recordHistogram: jest.fn(),
    getMetrics: jest.fn(),
  },
}));

// Mock cache integration before imports
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    getStats: jest.fn(),
    flush: jest.fn(),
  },
}));

// Mock all route modules to prevent their initialization
jest.mock('../../../src/routes/job.routes', () => jest.fn());
jest.mock('../../../src/routes/queue.routes', () => jest.fn());
jest.mock('../../../src/routes/health.routes', () => jest.fn());
jest.mock('../../../src/routes/metrics.routes', () => jest.fn());
jest.mock('../../../src/routes/alerts.routes', () => jest.fn());
jest.mock('../../../src/routes/rate-limit.routes', () => jest.fn());

import { FastifyInstance } from 'fastify';
import routes from '../../../src/routes/index';
import { serviceCache } from '../../../src/services/cache-integration';

describe('Index Routes', () => {
  let fastify: Partial<FastifyInstance>;
  let mockReply: any;
  let mockRequest: any;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    registeredRoutes = new Map();

    mockReply = {
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      headers: {},
    };

    fastify = {
      register: jest.fn(async (plugin, opts) => {
        const prefix = opts?.prefix || '';
        registeredRoutes.set(prefix, plugin);
      }),
      get: jest.fn((path, handler) => {
        registeredRoutes.set(`GET:${path}`, handler);
      }),
      delete: jest.fn((path, handler) => {
        registeredRoutes.set(`DELETE:${path}`, handler);
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should register all route modules', async () => {
      await routes(fastify as FastifyInstance);

      expect(fastify.register).toHaveBeenCalledTimes(6);
      expect(fastify.register).toHaveBeenCalledWith(expect.any(Function), { prefix: '/jobs' });
      expect(fastify.register).toHaveBeenCalledWith(expect.any(Function), { prefix: '/queues' });
      expect(fastify.register).toHaveBeenCalledWith(expect.any(Function), { prefix: '/health' });
      expect(fastify.register).toHaveBeenCalledWith(expect.any(Function), { prefix: '/metrics' });
      expect(fastify.register).toHaveBeenCalledWith(expect.any(Function), { prefix: '/alerts' });
      expect(fastify.register).toHaveBeenCalledWith(expect.any(Function), { prefix: '/rate-limits' });
    });

    it('should register API info endpoint', async () => {
      await routes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/', expect.any(Function));
    });

    it('should register cache stats endpoint', async () => {
      await routes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/cache/stats', expect.any(Function));
    });

    it('should register cache flush endpoint', async () => {
      await routes(fastify as FastifyInstance);

      expect(fastify.delete).toHaveBeenCalledWith('/cache/flush', expect.any(Function));
    });
  });

  describe('GET /', () => {
    it('should return API information', async () => {
      await routes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/');
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'Queue Service API',
        version: '1.0.0',
        endpoints: {
          jobs: '/api/v1/queue/jobs',
          queues: '/api/v1/queue/queues',
          health: '/api/v1/queue/health',
          metrics: '/api/v1/queue/metrics',
          alerts: '/api/v1/queue/alerts',
          rateLimits: '/api/v1/queue/rate-limits'
        }
      });
    });

    it('should return valid endpoint structure', async () => {
      await routes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response).toHaveProperty('service');
      expect(response).toHaveProperty('version');
      expect(response).toHaveProperty('endpoints');
      expect(response.endpoints).toHaveProperty('jobs');
      expect(response.endpoints).toHaveProperty('queues');
      expect(response.endpoints).toHaveProperty('health');
      expect(response.endpoints).toHaveProperty('metrics');
      expect(response.endpoints).toHaveProperty('alerts');
      expect(response.endpoints).toHaveProperty('rateLimits');
    });
  });

  describe('GET /cache/stats', () => {
    it('should return cache statistics', async () => {
      const mockStats = {
        hits: 100,
        misses: 20,
        keys: 50,
        hitRate: 0.83
      };
      (serviceCache.getStats as jest.Mock).mockReturnValue(mockStats);

      await routes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/cache/stats');
      await handler(mockRequest, mockReply);

      expect(serviceCache.getStats).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(mockStats);
    });

    it('should handle empty cache stats', async () => {
      (serviceCache.getStats as jest.Mock).mockReturnValue({});

      await routes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/cache/stats');
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({});
    });
  });

  describe('DELETE /cache/flush', () => {
    it('should flush cache successfully', async () => {
      (serviceCache.flush as jest.Mock).mockResolvedValue(undefined);

      await routes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('DELETE:/cache/flush');
      await handler(mockRequest, mockReply);

      expect(serviceCache.flush).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Cache flushed'
      });
    });

    it('should handle flush errors gracefully', async () => {
      (serviceCache.flush as jest.Mock).mockRejectedValue(new Error('Flush failed'));

      await routes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('DELETE:/cache/flush');

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Flush failed');
      expect(serviceCache.flush).toHaveBeenCalled();
    });
  });
});
