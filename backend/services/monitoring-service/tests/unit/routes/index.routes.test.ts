// Mock all route modules BEFORE imports
const mockHealthRoutes = jest.fn();
const mockStatusRoutes = jest.fn();
const mockMetricsRoutes = jest.fn();
const mockAlertRoutes = jest.fn();
const mockDashboardRoutes = jest.fn();

jest.mock('../../../src/routes/health.routes', () => ({
  __esModule: true,
  default: mockHealthRoutes,
}));

jest.mock('../../../src/routes/status.routes', () => ({
  __esModule: true,
  default: mockStatusRoutes,
}));

jest.mock('../../../src/routes/metrics.routes', () => ({
  __esModule: true,
  default: mockMetricsRoutes,
}));

jest.mock('../../../src/routes/alert.routes', () => ({
  __esModule: true,
  default: mockAlertRoutes,
}));

jest.mock('../../../src/routes/dashboard.routes', () => ({
  __esModule: true,
  default: mockDashboardRoutes,
}));

// Mock cache service
const mockGetStats = jest.fn();
const mockFlush = jest.fn();

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    getStats: mockGetStats,
    flush: mockFlush,
  },
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerRoutes } from '../../../src/routes/index';

describe('registerRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, any>;
  let registerSpy: jest.Mock;
  let getSpy: jest.Mock;
  let deleteSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();

    registerSpy = jest.fn(async (handler, options) => {
      registeredRoutes.set(options.prefix, handler);
    });

    getSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`GET ${path}`, handler);
    });

    deleteSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`DELETE ${path}`, handler);
    });

    mockServer = {
      register: registerSpy,
      get: getSpy,
      delete: deleteSpy,
    };
  });

  describe('route registration', () => {
    it('should register health routes with /health prefix', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(registerSpy).toHaveBeenCalledWith(mockHealthRoutes, { prefix: '/health' });
    });

    it('should register status routes with /status prefix', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(registerSpy).toHaveBeenCalledWith(mockStatusRoutes, { prefix: '/status' });
    });

    it('should register metrics routes with API versioning', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(registerSpy).toHaveBeenCalledWith(mockMetricsRoutes, {
        prefix: '/api/v1/monitoring/metrics',
      });
    });

    it('should register alert routes with API versioning', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(registerSpy).toHaveBeenCalledWith(mockAlertRoutes, {
        prefix: '/api/v1/monitoring/alerts',
      });
    });

    it('should register dashboard routes with API versioning', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(registerSpy).toHaveBeenCalledWith(mockDashboardRoutes, {
        prefix: '/api/v1/monitoring/dashboard',
      });
    });

    it('should register all 5 main route modules', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(registerSpy).toHaveBeenCalledTimes(5);
    });

    it('should register routes in correct order', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(registerSpy).toHaveBeenNthCalledWith(1, mockHealthRoutes, { prefix: '/health' });
      expect(registerSpy).toHaveBeenNthCalledWith(2, mockStatusRoutes, { prefix: '/status' });
      expect(registerSpy).toHaveBeenNthCalledWith(3, mockMetricsRoutes, {
        prefix: '/api/v1/monitoring/metrics',
      });
      expect(registerSpy).toHaveBeenNthCalledWith(4, mockAlertRoutes, {
        prefix: '/api/v1/monitoring/alerts',
      });
      expect(registerSpy).toHaveBeenNthCalledWith(5, mockDashboardRoutes, {
        prefix: '/api/v1/monitoring/dashboard',
      });
    });
  });

  describe('cache management routes', () => {
    it('should register GET /cache/stats', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/cache/stats', expect.any(Function));
      expect(registeredRoutes.has('GET /cache/stats')).toBe(true);
    });

    it('should register DELETE /cache/flush', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      expect(deleteSpy).toHaveBeenCalledWith('/cache/flush', expect.any(Function));
      expect(registeredRoutes.has('DELETE /cache/flush')).toBe(true);
    });
  });

  describe('GET /cache/stats handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(async () => {
      await registerRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('GET /cache/stats')!;

      mockRequest = {};
      mockReply = {};
    });

    it('should call serviceCache.getStats', async () => {
      const stats = {
        hits: 150,
        misses: 50,
        size: 1024,
        keys: 100,
      };
      mockGetStats.mockReturnValue(stats);

      const result = await handler(mockRequest, mockReply);

      expect(mockGetStats).toHaveBeenCalled();
      expect(result).toEqual(stats);
    });

    it('should return cache statistics', async () => {
      const stats = {
        hits: 500,
        misses: 100,
        hitRate: 0.833,
        size: 2048,
      };
      mockGetStats.mockReturnValue(stats);

      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('hits', 500);
      expect(result).toHaveProperty('misses', 100);
      expect(result).toHaveProperty('hitRate', 0.833);
      expect(result).toHaveProperty('size', 2048);
    });
  });

  describe('DELETE /cache/flush handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(async () => {
      await registerRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('DELETE /cache/flush')!;

      mockRequest = {};
      mockReply = {};
    });

    it('should call serviceCache.flush', async () => {
      mockFlush.mockResolvedValue(undefined);

      const result = await handler(mockRequest, mockReply);

      expect(mockFlush).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Cache flushed',
      });
    });

    it('should return success response', async () => {
      mockFlush.mockResolvedValue(undefined);

      const result = await handler(mockRequest, mockReply);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Cache flushed');
    });

    it('should propagate errors from cache flush', async () => {
      const error = new Error('Cache flush failed');
      mockFlush.mockRejectedValue(error);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Cache flush failed');
    });
  });

  describe('prefix configuration', () => {
    it('should use versioned API prefix for monitoring routes', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      const metricsPrefixCall = registerSpy.mock.calls.find(
        (call) => call[0] === mockMetricsRoutes
      );
      const alertsPrefixCall = registerSpy.mock.calls.find((call) => call[0] === mockAlertRoutes);
      const dashboardPrefixCall = registerSpy.mock.calls.find(
        (call) => call[0] === mockDashboardRoutes
      );

      expect(metricsPrefixCall[1].prefix).toContain('/api/v1/monitoring');
      expect(alertsPrefixCall[1].prefix).toContain('/api/v1/monitoring');
      expect(dashboardPrefixCall[1].prefix).toContain('/api/v1/monitoring');
    });

    it('should use simple prefix for health and status', async () => {
      await registerRoutes(mockServer as FastifyInstance);

      const healthPrefixCall = registerSpy.mock.calls.find(
        (call) => call[0] === mockHealthRoutes
      );
      const statusPrefixCall = registerSpy.mock.calls.find(
        (call) => call[0] === mockStatusRoutes
      );

      expect(healthPrefixCall[1].prefix).toBe('/health');
      expect(statusPrefixCall[1].prefix).toBe('/status');
    });
  });
});
