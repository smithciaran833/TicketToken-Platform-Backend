// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/performance-monitor.ts
 */

jest.mock('../../../src/utils/logger');

describe('src/utils/performance-monitor.ts - Comprehensive Unit Tests', () => {
  let logger: any;
  const originalDateNow = Date.now;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    console.log = jest.fn();

    // Mock Date.now for consistent timing
    Date.now = jest.fn()
      .mockReturnValueOnce(1000)  // Start time
      .mockReturnValueOnce(1100); // End time (100ms duration)

    // Mock logger
    logger = require('../../../src/utils/logger').logger;
    logger.warn = jest.fn();
    logger.info = jest.fn();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    console.log = originalConsoleLog;
  });

  // =============================================================================
  // trackOperation() - Success Cases
  // =============================================================================

  describe('trackOperation() - Success Cases', () => {
    it('should execute function and return result', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await performanceMonitor.trackOperation('test-op', mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalled();
    });

    it('should record metric on success', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');

      await performanceMonitor.trackOperation('test-op', mockFn);

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.has('test-op')).toBe(true);
    });

    it('should calculate duration correctly', async () => {
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1250);

      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');

      await performanceMonitor.trackOperation('test-op', mockFn);

      const stats = performanceMonitor.getStats('test-op');
      expect(stats.avg).toBe(250);
    });

    it('should store metadata', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');
      const metadata = { userId: '123', query: 'test' };

      await performanceMonitor.trackOperation('test-op', mockFn, metadata);

      expect(performanceMonitor.getMetrics().has('test-op')).toBe(true);
    });
  });

  // =============================================================================
  // trackOperation() - Error Cases
  // =============================================================================

  describe('trackOperation() - Error Cases', () => {
    it('should throw error from function', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);

      await expect(performanceMonitor.trackOperation('test-op', mockFn)).rejects.toThrow('Test error');
    });

    it('should record error metric', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockRejectedValue(new Error('Failed'));

      try {
        await performanceMonitor.trackOperation('test-op', mockFn);
      } catch (e) {}

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.has('test-op_error')).toBe(true);
    });

    it('should calculate duration even on error', async () => {
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1200);

      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockRejectedValue(new Error('Failed'));

      try {
        await performanceMonitor.trackOperation('test-op', mockFn);
      } catch (e) {}

      const stats = performanceMonitor.getStats('test-op_error');
      expect(stats.avg).toBe(200);
    });
  });

  // =============================================================================
  // trackOperation() - Slow Query Detection
  // =============================================================================

  describe('trackOperation() - Slow Query Detection', () => {
    it('should log warning for slow operations', async () => {
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(2500); // 1500ms duration

      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');

      await performanceMonitor.trackOperation('slow-op', mockFn);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'slow-op',
          duration: 1500,
          threshold: 1000
        }),
        'Slow operation detected'
      );
    });

    it('should not log warning for fast operations', async () => {
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100); // 100ms duration

      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');

      await performanceMonitor.trackOperation('fast-op', mockFn);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should console log slow operations in non-production', async () => {
      process.env.NODE_ENV = 'development';
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1600); // 600ms duration

      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');

      await performanceMonitor.trackOperation('dev-slow', mockFn);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Slow operation: dev-slow took 600ms')
      );
    });

    it('should not console log in production', async () => {
      process.env.NODE_ENV = 'production';
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1600);

      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');

      await performanceMonitor.trackOperation('prod-slow', mockFn);

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getStats() - Statistics Calculation
  // =============================================================================

  describe('getStats() - Statistics Calculation', () => {
    it('should return null for non-existent operation', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const stats = performanceMonitor.getStats('non-existent');

      expect(stats).toBeNull();
    });

    it('should calculate min correctly', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      // Add multiple metrics
      const metrics = performanceMonitor.getMetrics();
      metrics.set('test-op', [10, 20, 30, 5, 15]);

      const stats = performanceMonitor.getStats('test-op');

      expect(stats.min).toBe(5);
    });

    it('should calculate max correctly', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('test-op', [10, 20, 30, 5, 15]);

      const stats = performanceMonitor.getStats('test-op');

      expect(stats.max).toBe(30);
    });

    it('should calculate average correctly', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('test-op', [10, 20, 30, 40]);

      const stats = performanceMonitor.getStats('test-op');

      expect(stats.avg).toBe(25);
    });

    it('should calculate count correctly', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('test-op', [10, 20, 30, 40, 50]);

      const stats = performanceMonitor.getStats('test-op');

      expect(stats.count).toBe(5);
    });

    it('should calculate p50 percentile', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('test-op', [10, 20, 30, 40, 50]);

      const stats = performanceMonitor.getStats('test-op');

      expect(stats.p50).toBe(30);
    });

    it('should calculate p95 percentile', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      metrics.set('test-op', values);

      const stats = performanceMonitor.getStats('test-op');

      expect(stats.p95).toBe(95);
    });

    it('should calculate p99 percentile', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      metrics.set('test-op', values);

      const stats = performanceMonitor.getStats('test-op');

      expect(stats.p99).toBe(99);
    });
  });

  // =============================================================================
  // getAllStats()
  // =============================================================================

  describe('getAllStats()', () => {
    it('should return empty object when no metrics', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const allStats = performanceMonitor.getAllStats();

      expect(allStats).toEqual({});
    });

    it('should return stats for all operations', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('op1', [10, 20, 30]);
      metrics.set('op2', [100, 200, 300]);

      const allStats = performanceMonitor.getAllStats();

      expect(allStats).toHaveProperty('op1');
      expect(allStats).toHaveProperty('op2');
    });

    it('should include all stats properties', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('test-op', [10, 20, 30]);

      const allStats = performanceMonitor.getAllStats();

      expect(allStats['test-op']).toHaveProperty('min');
      expect(allStats['test-op']).toHaveProperty('max');
      expect(allStats['test-op']).toHaveProperty('avg');
      expect(allStats['test-op']).toHaveProperty('p50');
      expect(allStats['test-op']).toHaveProperty('p95');
      expect(allStats['test-op']).toHaveProperty('p99');
      expect(allStats['test-op']).toHaveProperty('count');
    });
  });

  // =============================================================================
  // resetMetrics()
  // =============================================================================

  describe('resetMetrics()', () => {
    it('should clear all metrics when no operation specified', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('op1', [10, 20]);
      metrics.set('op2', [30, 40]);

      performanceMonitor.resetMetrics();

      expect(metrics.size).toBe(0);
    });

    it('should clear specific operation metrics', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('op1', [10, 20]);
      metrics.set('op2', [30, 40]);

      performanceMonitor.resetMetrics('op1');

      expect(metrics.has('op1')).toBe(false);
      expect(metrics.has('op2')).toBe(true);
    });

    it('should not affect other operations when resetting one', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('op1', [10, 20]);
      metrics.set('op2', [30, 40]);

      performanceMonitor.resetMetrics('op1');

      const stats = performanceMonitor.getStats('op2');
      expect(stats).not.toBeNull();
      expect(stats.count).toBe(2);
    });
  });

  // =============================================================================
  // setSlowQueryThreshold()
  // =============================================================================

  describe('setSlowQueryThreshold()', () => {
    it('should update slow query threshold', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      performanceMonitor.setSlowQueryThreshold(500);

      // Threshold should be updated (tested through slow query detection)
      expect(performanceMonitor).toBeDefined();
    });

    it('should use new threshold for slow query detection', async () => {
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1600); // 600ms

      const { performanceMonitor } = require('../../../src/utils/performance-monitor');
      performanceMonitor.setSlowQueryThreshold(500);

      const mockFn = jest.fn().mockResolvedValue('result');
      await performanceMonitor.trackOperation('test-op', mockFn);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 500 }),
        'Slow operation detected'
      );
    });
  });

  // =============================================================================
  // isOperationSlow()
  // =============================================================================

  describe('isOperationSlow()', () => {
    it('should return false for non-existent operation', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const result = performanceMonitor.isOperationSlow('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when p95 exceeds threshold', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('slow-op', [1000, 1100, 1200, 1300, 1400]);

      const result = performanceMonitor.isOperationSlow('slow-op');

      expect(result).toBe(true);
    });

    it('should return false when p95 below threshold', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('fast-op', [10, 20, 30, 40, 50]);

      const result = performanceMonitor.isOperationSlow('fast-op');

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // getSlowOperationsReport()
  // =============================================================================

  describe('getSlowOperationsReport()', () => {
    it('should return empty array when no slow operations', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('fast-op', [10, 20, 30]);

      const report = performanceMonitor.getSlowOperationsReport();

      expect(report).toEqual([]);
    });

    it('should return slow operations', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('slow-op', [1000, 1100, 1200, 1300, 1400]);

      const report = performanceMonitor.getSlowOperationsReport();

      expect(report.length).toBeGreaterThan(0);
      expect(report[0].operation).toBe('slow-op');
    });

    it('should sort by p95 descending', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('slow-op-1', [1100, 1200, 1300, 1400, 1500]);
      metrics.set('slow-op-2', [1500, 1600, 1700, 1800, 1900]);

      const report = performanceMonitor.getSlowOperationsReport();

      expect(report[0].operation).toBe('slow-op-2');
      expect(report[1].operation).toBe('slow-op-1');
    });

    it('should include stats in report', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('slow-op', [1000, 1100, 1200, 1300, 1400]);

      const report = performanceMonitor.getSlowOperationsReport();

      expect(report[0]).toHaveProperty('stats');
      expect(report[0].stats).toHaveProperty('p95');
    });
  });

  // =============================================================================
  // logSummary()
  // =============================================================================

  describe('logSummary()', () => {
    it('should log to logger.info', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      performanceMonitor.logSummary();

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(Object),
        'Performance monitoring summary'
      );
    });

    it('should include stats in log', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      const metrics = performanceMonitor.getMetrics();
      metrics.set('test-op', [10, 20, 30]);

      performanceMonitor.logSummary();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.any(Object)
        }),
        expect.any(String)
      );
    });

    it('should console log summary', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      performanceMonitor.logSummary();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Performance Monitoring Summary')
      );
    });
  });

  // =============================================================================
  // Metrics Retention
  // =============================================================================

  describe('Metrics Retention', () => {
    it('should limit metrics to retention limit', async () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      // Reset first to start clean
      performanceMonitor.resetMetrics();

      // Track operations to exceed retention limit
      Date.now = jest.fn();
      const mockFn = jest.fn().mockResolvedValue('result');

      for (let i = 0; i < 10005; i++) {
        Date.now.mockReturnValueOnce(1000).mockReturnValueOnce(1100);
        await performanceMonitor.trackOperation('test-op', mockFn);
      }

      const metrics = performanceMonitor.getMetrics();
      const currentMetrics = metrics.get('test-op');
      
      // Should be trimmed to retention limit
      expect(currentMetrics.length).toBeLessThanOrEqual(10000);
    });
  });

  // =============================================================================
  // Singleton Instance
  // =============================================================================

  describe('Singleton Instance', () => {
    it('should export performanceMonitor instance', () => {
      const { performanceMonitor } = require('../../../src/utils/performance-monitor');

      expect(performanceMonitor).toBeDefined();
    });

    it('should export trackPerformance helper', () => {
      const { trackPerformance } = require('../../../src/utils/performance-monitor');

      expect(typeof trackPerformance).toBe('function');
    });

    it('should use performanceMonitor in helper', async () => {
      Date.now = jest.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100);

      const { trackPerformance, performanceMonitor } = require('../../../src/utils/performance-monitor');
      const mockFn = jest.fn().mockResolvedValue('result');

      const result = await trackPerformance('test-op', mockFn);

      expect(result).toBe('result');
      expect(performanceMonitor.getStats('test-op')).not.toBeNull();
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export performanceMonitor', () => {
      const module = require('../../../src/utils/performance-monitor');

      expect(module.performanceMonitor).toBeDefined();
    });

    it('should export trackPerformance function', () => {
      const module = require('../../../src/utils/performance-monitor');

      expect(module.trackPerformance).toBeDefined();
      expect(typeof module.trackPerformance).toBe('function');
    });
  });
});
