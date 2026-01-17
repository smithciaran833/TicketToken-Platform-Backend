// Mock logger BEFORE imports
const mockLoggerWarn = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock request-id middleware
jest.mock('../../../src/middleware/request-id.middleware', () => ({
  getRequestId: jest.fn(() => 'mock-request-id'),
}));

import { performanceMetricsService } from '../../../src/services/performance-metrics.service';

describe('PerformanceMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    performanceMetricsService.reset();
  });

  describe('startTimer / stopTimer', () => {
    it('should start and stop a timer', () => {
      const timerId = performanceMetricsService.startTimer('test-operation');

      expect(timerId).toContain('test-operation');

      const duration = performanceMetricsService.stopTimer(timerId);

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should use provided timerId', () => {
      const timerId = performanceMetricsService.startTimer('test-op', 'custom-id');

      expect(timerId).toBe('custom-id');
    });

    it('should store metadata', () => {
      const timerId = performanceMetricsService.startTimer('test-op', undefined, {
        provider: 'stripe',
      });

      performanceMetricsService.stopTimer(timerId, true);

      const metrics = performanceMetricsService.getMetricsByOperation('test-op');
      expect(metrics[0].metadata).toMatchObject({ provider: 'stripe' });
    });

    it('should return null for non-existent timer', () => {
      const duration = performanceMetricsService.stopTimer('non-existent');

      expect(duration).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith('Timer not found: non-existent');
    });

    it('should record failed status', () => {
      const timerId = performanceMetricsService.startTimer('failing-op');
      performanceMetricsService.stopTimer(timerId, false);

      const metrics = performanceMetricsService.getMetricsByOperation('failing-op');
      expect(metrics[0].success).toBe(false);
    });

    it('should merge additional metadata on stop', () => {
      const timerId = performanceMetricsService.startTimer('test-op', undefined, {
        initial: 'value',
      });

      performanceMetricsService.stopTimer(timerId, true, { extra: 'data' });

      const metrics = performanceMetricsService.getMetricsByOperation('test-op');
      expect(metrics[0].metadata).toMatchObject({
        initial: 'value',
        extra: 'data',
      });
    });
  });

  describe('recordMetric', () => {
    it('should record a metric', () => {
      performanceMetricsService.recordMetric({
        operation: 'sync',
        duration: 1000,
        timestamp: Date.now(),
        success: true,
      });

      const metrics = performanceMetricsService.getMetricsByOperation('sync');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].duration).toBe(1000);
    });

    it('should limit stored metrics to prevent memory bloat', () => {
      // Record 1001 metrics (max is 1000)
      for (let i = 0; i < 1001; i++) {
        performanceMetricsService.recordMetric({
          operation: `op-${i}`,
          duration: i,
          timestamp: Date.now(),
          success: true,
        });
      }

      const summary = performanceMetricsService.getPerformanceSummary();
      expect(summary.totalOperations).toBe(1000);
    });

    it('should log slow operations over 5000ms', () => {
      performanceMetricsService.recordMetric({
        operation: 'slow-op',
        duration: 6000,
        timestamp: Date.now(),
        success: true,
        provider: 'stripe',
      });

      expect(mockLoggerWarn).toHaveBeenCalledWith('Slow operation detected', {
        operation: 'slow-op',
        duration: 6000,
        provider: 'stripe',
      });
    });

    it('should not log operations under 5000ms', () => {
      performanceMetricsService.recordMetric({
        operation: 'fast-op',
        duration: 1000,
        timestamp: Date.now(),
        success: true,
      });

      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('trackApiCall', () => {
    it('should track successful API call', async () => {
      const fn = jest.fn().mockResolvedValue({ data: 'result' });

      const result = await performanceMetricsService.trackApiCall(
        'api-call',
        'stripe',
        fn
      );

      expect(result).toEqual({ data: 'result' });
      expect(fn).toHaveBeenCalled();

      const metrics = performanceMetricsService.getMetricsByOperation('api-call');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].success).toBe(true);
    });

    it('should track failed API call and rethrow error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('API failed'));

      await expect(
        performanceMetricsService.trackApiCall('failing-api', 'square', fn)
      ).rejects.toThrow('API failed');

      const metrics = performanceMetricsService.getMetricsByOperation('failing-api');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].success).toBe(false);
      expect(metrics[0].metadata?.error).toBe('API failed');
    });

    it('should include provider in metadata', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await performanceMetricsService.trackApiCall('test-api', 'mailchimp', fn);

      const metrics = performanceMetricsService.getMetricsByOperation('test-api');
      expect(metrics[0].metadata?.provider).toBe('mailchimp');
    });
  });

  describe('getMetricsByOperation', () => {
    it('should filter metrics by operation', () => {
      performanceMetricsService.recordMetric({
        operation: 'op-a',
        duration: 100,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'op-b',
        duration: 200,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'op-a',
        duration: 150,
        timestamp: Date.now(),
        success: true,
      });

      const metricsA = performanceMetricsService.getMetricsByOperation('op-a');
      const metricsB = performanceMetricsService.getMetricsByOperation('op-b');

      expect(metricsA).toHaveLength(2);
      expect(metricsB).toHaveLength(1);
    });

    it('should return empty array for unknown operation', () => {
      const metrics = performanceMetricsService.getMetricsByOperation('unknown');

      expect(metrics).toEqual([]);
    });
  });

  describe('getMetricsByProvider', () => {
    it('should filter metrics by provider', () => {
      performanceMetricsService.recordMetric({
        operation: 'sync',
        duration: 100,
        timestamp: Date.now(),
        success: true,
        metadata: { provider: 'stripe' },
      });
      performanceMetricsService.recordMetric({
        operation: 'sync',
        duration: 200,
        timestamp: Date.now(),
        success: true,
        metadata: { provider: 'square' },
      });

      const stripeMetrics = performanceMetricsService.getMetricsByProvider('stripe');
      const squareMetrics = performanceMetricsService.getMetricsByProvider('square');

      expect(stripeMetrics).toHaveLength(1);
      expect(squareMetrics).toHaveLength(1);
    });
  });

  describe('getAverageDuration', () => {
    it('should calculate average duration', () => {
      performanceMetricsService.recordMetric({
        operation: 'avg-test',
        duration: 100,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'avg-test',
        duration: 200,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'avg-test',
        duration: 300,
        timestamp: Date.now(),
        success: true,
      });

      const avg = performanceMetricsService.getAverageDuration('avg-test');

      expect(avg).toBe(200);
    });

    it('should return 0 for unknown operation', () => {
      const avg = performanceMetricsService.getAverageDuration('unknown');

      expect(avg).toBe(0);
    });
  });

  describe('getP95Duration', () => {
    it('should calculate p95 duration', () => {
      // Add 100 metrics with durations 1-100
      for (let i = 1; i <= 100; i++) {
        performanceMetricsService.recordMetric({
          operation: 'p95-test',
          duration: i,
          timestamp: Date.now(),
          success: true,
        });
      }

      const p95 = performanceMetricsService.getP95Duration('p95-test');

      expect(p95).toBe(95);
    });

    it('should return 0 for unknown operation', () => {
      const p95 = performanceMetricsService.getP95Duration('unknown');

      expect(p95).toBe(0);
    });

    it('should handle small sample sizes', () => {
      performanceMetricsService.recordMetric({
        operation: 'small-sample',
        duration: 500,
        timestamp: Date.now(),
        success: true,
      });

      const p95 = performanceMetricsService.getP95Duration('small-sample');

      expect(p95).toBe(500);
    });
  });

  describe('getSuccessRate', () => {
    it('should calculate success rate', () => {
      for (let i = 0; i < 8; i++) {
        performanceMetricsService.recordMetric({
          operation: 'rate-test',
          duration: 100,
          timestamp: Date.now(),
          success: true,
        });
      }
      for (let i = 0; i < 2; i++) {
        performanceMetricsService.recordMetric({
          operation: 'rate-test',
          duration: 100,
          timestamp: Date.now(),
          success: false,
        });
      }

      const rate = performanceMetricsService.getSuccessRate('rate-test');

      expect(rate).toBe(80);
    });

    it('should return 0 for unknown operation', () => {
      const rate = performanceMetricsService.getSuccessRate('unknown');

      expect(rate).toBe(0);
    });
  });

  describe('getPerformanceSummary', () => {
    it('should return complete summary', () => {
      performanceMetricsService.recordMetric({
        operation: 'sync',
        duration: 100,
        timestamp: Date.now(),
        success: true,
        metadata: { provider: 'stripe' },
      });
      performanceMetricsService.recordMetric({
        operation: 'sync',
        duration: 200,
        timestamp: Date.now(),
        success: false,
        metadata: { provider: 'stripe' },
      });
      performanceMetricsService.recordMetric({
        operation: 'webhook',
        duration: 50,
        timestamp: Date.now(),
        success: true,
        metadata: { provider: 'square' },
      });

      const summary = performanceMetricsService.getPerformanceSummary();

      expect(summary.totalOperations).toBe(3);
      expect(summary.operations.sync).toBeDefined();
      expect(summary.operations.sync.count).toBe(2);
      expect(summary.operations.sync.avgDuration).toBe(150);
      expect(summary.operations.sync.successRate).toBe(50);
      expect(summary.operations.webhook.count).toBe(1);
      expect(summary.providers.stripe.count).toBe(2);
      expect(summary.providers.square.count).toBe(1);
    });

    it('should return empty summary when no metrics', () => {
      const summary = performanceMetricsService.getPerformanceSummary();

      expect(summary.totalOperations).toBe(0);
      expect(summary.operations).toEqual({});
      expect(summary.providers).toEqual({});
    });
  });

  describe('getSlowOperations', () => {
    it('should return operations slower than threshold', () => {
      performanceMetricsService.recordMetric({
        operation: 'fast',
        duration: 1000,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'slow',
        duration: 4000,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'very-slow',
        duration: 5000,
        timestamp: Date.now(),
        success: true,
      });

      const slowOps = performanceMetricsService.getSlowOperations(3000);

      expect(slowOps).toHaveLength(2);
      expect(slowOps[0].duration).toBe(5000); // Sorted by duration desc
      expect(slowOps[1].duration).toBe(4000);
    });

    it('should limit results', () => {
      for (let i = 0; i < 20; i++) {
        performanceMetricsService.recordMetric({
          operation: `slow-${i}`,
          duration: 4000 + i,
          timestamp: Date.now(),
          success: true,
        });
      }

      const slowOps = performanceMetricsService.getSlowOperations(3000, 5);

      expect(slowOps).toHaveLength(5);
    });

    it('should use default threshold of 3000ms', () => {
      performanceMetricsService.recordMetric({
        operation: 'borderline',
        duration: 3001,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'under',
        duration: 2999,
        timestamp: Date.now(),
        success: true,
      });

      const slowOps = performanceMetricsService.getSlowOperations();

      expect(slowOps).toHaveLength(1);
      expect(slowOps[0].operation).toBe('borderline');
    });
  });

  describe('clearOldMetrics', () => {
    it('should clear metrics older than specified time', () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const twoHoursAgo = now - 7200000;

      performanceMetricsService.recordMetric({
        operation: 'recent',
        duration: 100,
        timestamp: now,
        success: true,
      });
      performanceMetricsService.recordMetric({
        operation: 'old',
        duration: 100,
        timestamp: twoHoursAgo,
        success: true,
      });

      performanceMetricsService.clearOldMetrics(3600000); // 1 hour

      const summary = performanceMetricsService.getPerformanceSummary();
      expect(summary.totalOperations).toBe(1);
      expect(summary.operations.recent).toBeDefined();
      expect(summary.operations.old).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('should clear all metrics and timers', () => {
      performanceMetricsService.recordMetric({
        operation: 'test',
        duration: 100,
        timestamp: Date.now(),
        success: true,
      });
      performanceMetricsService.startTimer('pending-timer');

      performanceMetricsService.reset();

      const summary = performanceMetricsService.getPerformanceSummary();
      expect(summary.totalOperations).toBe(0);

      // Timer should be gone
      const duration = performanceMetricsService.stopTimer('pending-timer');
      expect(duration).toBeNull();
    });
  });
});
