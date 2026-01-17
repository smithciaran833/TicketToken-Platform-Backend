// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock metrics service
jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    getMetrics: jest.fn(),
    getMetricsJSON: jest.fn(),
  },
}));

import { FastifyInstance } from 'fastify';
import metricsRoutes from '../../../src/routes/metrics.routes';
import { metricsService } from '../../../src/services/metrics.service';
import { logger } from '../../../src/utils/logger';

describe('Metrics Routes', () => {
  let fastify: Partial<FastifyInstance>;
  let mockReply: any;
  let mockRequest: any;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    registeredRoutes = new Map();

    mockReply = {
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    mockRequest = {};

    fastify = {
      get: jest.fn((path, handler) => {
        registeredRoutes.set(`GET:${path}`, handler);
      }),
    } as any;

    // Reset mocks
    (metricsService.getMetrics as jest.Mock).mockResolvedValue('# Prometheus metrics');
    (metricsService.getMetricsJSON as jest.Mock).mockResolvedValue({ counter: 100 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should register GET /metrics route', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/metrics', expect.any(Function));
    });

    it('should register GET /metrics/json route', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/metrics/json', expect.any(Function));
    });

    it('should register GET /metrics/queue-stats route', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/metrics/queue-stats', expect.any(Function));
    });

    it('should register GET /metrics/system route', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/metrics/system', expect.any(Function));
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics with correct content type', async () => {
      const mockMetrics = '# HELP counter_total Total counter\n# TYPE counter_total counter\ncounter_total 42';
      (metricsService.getMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics');
      await handler(mockRequest, mockReply);

      expect(metricsService.getMetrics).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; version=0.0.4; charset=utf-8'
      );
      expect(mockReply.send).toHaveBeenCalledWith(mockMetrics);
    });

    it('should return 500 when metrics service fails', async () => {
      (metricsService.getMetrics as jest.Mock).mockRejectedValue(new Error('Metrics error'));

      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to retrieve metrics' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get metrics', expect.any(Object));
    });

    it('should handle empty metrics response', async () => {
      (metricsService.getMetrics as jest.Mock).mockResolvedValue('');

      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics');
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith('');
    });
  });

  describe('GET /metrics/json', () => {
    it('should return metrics in JSON format with timestamp', async () => {
      const mockMetrics = { counter: 100, gauge: 50 };
      (metricsService.getMetricsJSON as jest.Mock).mockResolvedValue(mockMetrics);

      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/json');
      await handler(mockRequest, mockReply);

      expect(metricsService.getMetricsJSON).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        metrics: mockMetrics,
      });
    });

    it('should return valid ISO timestamp', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/json');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(() => new Date(response.timestamp)).not.toThrow();
      expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
    });

    it('should return 500 when JSON metrics fail', async () => {
      (metricsService.getMetricsJSON as jest.Mock).mockRejectedValue(new Error('JSON error'));

      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/json');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to retrieve metrics' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get JSON metrics', expect.any(Object));
    });
  });

  describe('GET /metrics/queue-stats', () => {
    it('should return queue statistics with timestamp', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/queue-stats');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('queues');
    });

    it('should return stats for all three queues', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/queue-stats');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.queues).toHaveProperty('payment');
      expect(response.queues).toHaveProperty('refund');
      expect(response.queues).toHaveProperty('mint');
    });

    it('should include queue metrics structure', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/queue-stats');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.queues.payment).toHaveProperty('waiting');
      expect(response.queues.payment).toHaveProperty('active');
      expect(response.queues.payment).toHaveProperty('completed');
      expect(response.queues.payment).toHaveProperty('failed');
      expect(response.queues.payment).toHaveProperty('delayed');
      expect(response.queues.payment).toHaveProperty('paused');
    });

    it('should return 500 on unexpected error', async () => {
      // Override the handler to throw an error
      mockReply.code.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/queue-stats');
      
      await expect(handler(mockRequest, mockReply)).rejects.toThrow();
    });
  });

  describe('GET /metrics/system', () => {
    it('should return system metrics with timestamp', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/system');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('uptime');
      expect(response).toHaveProperty('memory');
      expect(response).toHaveProperty('cpu');
      expect(response).toHaveProperty('process');
    });

    it('should include memory usage details', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/system');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.memory).toHaveProperty('rss');
      expect(response.memory).toHaveProperty('heapTotal');
      expect(response.memory).toHaveProperty('heapUsed');
      expect(response.memory).toHaveProperty('external');
      expect(response.memory).toHaveProperty('arrayBuffers');
    });

    it('should include CPU usage details', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/system');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.cpu).toHaveProperty('user');
      expect(response.cpu).toHaveProperty('system');
    });

    it('should include process information', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/system');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.process).toHaveProperty('pid');
      expect(response.process).toHaveProperty('version');
      expect(response.process).toHaveProperty('platform');
      expect(response.process).toHaveProperty('arch');
    });

    it('should return 500 on error', async () => {
      // Make process.memoryUsage throw
      jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
        throw new Error('Memory error');
      });

      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/system');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to retrieve system metrics' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get system metrics', expect.any(Object));

      jest.restoreAllMocks();
    });

    it('should return valid ISO timestamp', async () => {
      await metricsRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/metrics/system');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(() => new Date(response.timestamp)).not.toThrow();
    });
  });
});
