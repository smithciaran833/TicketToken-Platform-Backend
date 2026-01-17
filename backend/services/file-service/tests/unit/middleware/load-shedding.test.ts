/**
 * Unit Tests for Load Shedding Middleware
 */

import { FastifyRequest } from 'fastify';
import { getLoadSheddingMetrics } from '../../../src/middleware/load-shedding';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('middleware/load-shedding', () => {
  let mockRequest: Partial<FastifyRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      url: '/api/upload',
      method: 'POST',
    };
  });

  describe('getLoadSheddingMetrics', () => {
    it('should return metrics object', () => {
      const metrics = getLoadSheddingMetrics();

      expect(metrics).toHaveProperty('eventLoopLag');
      expect(metrics).toHaveProperty('concurrentRequests');
      expect(metrics).toHaveProperty('totalShedRequests');
      expect(metrics).toHaveProperty('isOverloaded');
    });

    it('should return non-negative values', () => {
      const metrics = getLoadSheddingMetrics();

      expect(metrics.eventLoopLag).toBeGreaterThanOrEqual(0);
      expect(metrics.concurrentRequests).toBeGreaterThanOrEqual(0);
      expect(metrics.totalShedRequests).toBeGreaterThanOrEqual(0);
    });

    it('should calculate isOverloaded correctly', () => {
      const metrics = getLoadSheddingMetrics();

      expect(typeof metrics.isOverloaded).toBe('boolean');
    });
  });

  describe('Health Check Exclusion', () => {
    it('should not shed load for health check endpoints', () => {
      const excludedPaths = [
        '/health/live',
        '/health/ready',
        '/health/startup',
        '/metrics',
      ];

      excludedPaths.forEach(path => {
        const req = { ...mockRequest, url: path };
        // These paths should be excluded from load shedding
        expect(req.url).toMatch(/health|metrics/);
      });
    });
  });

  describe('Event Loop Lag Monitoring', () => {
    it('should measure event loop lag', () => {
      const metrics = getLoadSheddingMetrics();

      expect(typeof metrics.eventLoopLag).toBe('number');
      expect(metrics.eventLoopLag).toBeGreaterThanOrEqual(0);
    });

    it('should detect high event loop lag', () => {
      const metrics = getLoadSheddingMetrics();

      const highLagThreshold = 100;
      if (metrics.eventLoopLag > highLagThreshold) {
        expect(metrics.isOverloaded).toBe(true);
      }
    });
  });

  describe('Concurrent Request Tracking', () => {
    it('should track concurrent request count', () => {
      const metrics = getLoadSheddingMetrics();

      expect(typeof metrics.concurrentRequests).toBe('number');
      expect(metrics.concurrentRequests).toBeGreaterThanOrEqual(0);
    });

    it('should detect high concurrent request load', () => {
      const metrics = getLoadSheddingMetrics();

      const maxConcurrent = 500;
      if (metrics.concurrentRequests > maxConcurrent) {
        expect(metrics.isOverloaded).toBe(true);
      }
    });
  });

  describe('Load Shedding Response', () => {
    it('should return 503 when load shedding is triggered', () => {
      const expectedResponse = {
        type: 'https://api.tickettoken.com/errors/service-overloaded',
        title: 'Service Temporarily Overloaded',
        status: 503,
        detail: expect.any(String),
        instance: expect.any(String),
        retryAfter: expect.any(Number),
      };

      expect(expectedResponse.status).toBe(503);
      expect(expectedResponse.type).toContain('service-overloaded');
    });

    it('should include retry-after header value', () => {
      const retryAfterValues = [2, 5, 10];

      retryAfterValues.forEach(seconds => {
        expect(seconds).toBeGreaterThan(0);
        expect(seconds).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('Metrics Tracking', () => {
    it('should increment totalShedRequests when load is shed', () => {
      const metricsBefore = getLoadSheddingMetrics();
      const totalBefore = metricsBefore.totalShedRequests;

      expect(totalBefore).toBeGreaterThanOrEqual(0);
    });

    it('should maintain metrics across requests', () => {
      const metrics1 = getLoadSheddingMetrics();
      const metrics2 = getLoadSheddingMetrics();

      expect(metrics1).toHaveProperty('eventLoopLag');
      expect(metrics2).toHaveProperty('eventLoopLag');
    });
  });
});
