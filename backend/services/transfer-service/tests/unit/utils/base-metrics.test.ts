/**
 * Unit Tests for Base Metrics
 *
 * Tests Prometheus metrics foundation:
 * - Registry initialization and configuration
 * - Default metrics collection
 * - Metric type availability
 */

import * as promClient from 'prom-client';

describe('Base Metrics - Registry and Foundation', () => {
  let baseMetrics: any;

  beforeEach(() => {
    // Clear registry before each test
    promClient.register.clear();
    
    // Force fresh module load
    jest.resetModules();
    baseMetrics = require('../../../src/utils/base-metrics');
  });

  afterEach(() => {
    promClient.register.clear();
  });

  describe('Registry Initialization', () => {
    it('should create a registry instance', () => {
      expect(baseMetrics.register).toBeDefined();
      expect(baseMetrics.register.constructor.name).toBe('Registry');
    });

    it('should be a separate registry from global', () => {
      expect(baseMetrics.register).not.toBe(promClient.register);
    });

    it('should have default metrics registered', async () => {
      const metrics = await baseMetrics.register.metrics();
      
      // Should have some default metrics as string
      expect(metrics).toBeTruthy();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should include process metrics in defaults', async () => {
      const metricsString = await baseMetrics.register.metrics();
      
      // Default Node.js metrics
      expect(metricsString).toContain('process_cpu');
      expect(metricsString).toContain('nodejs_');
    });
  });

  describe('Metric Type Exports', () => {
    it('should export Counter class', () => {
      expect(baseMetrics.Counter).toBeDefined();
      expect(typeof baseMetrics.Counter).toBe('function');
      expect(baseMetrics.Counter.name).toBe('Counter');
    });

    it('should export Histogram class', () => {
      expect(baseMetrics.Histogram).toBeDefined();
      expect(typeof baseMetrics.Histogram).toBe('function');
      expect(baseMetrics.Histogram.name).toBe('Histogram');
    });

    it('should export Gauge class', () => {
      expect(baseMetrics.Gauge).toBeDefined();
      expect(typeof baseMetrics.Gauge).toBe('function');
      expect(baseMetrics.Gauge.name).toBe('Gauge');
    });

    it('should allow creating Counter instances', async () => {
      const counter = new baseMetrics.Counter({
        name: 'test_counter',
        help: 'Test counter',
        registers: [baseMetrics.register]
      });

      expect(counter.constructor.name).toBe('Counter');
      counter.inc();
      
      // Verify it increments
      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('test_counter');
      expect(metrics).toContain('1');
    });

    it('should allow creating Histogram instances', async () => {
      const histogram = new baseMetrics.Histogram({
        name: 'test_histogram',
        help: 'Test histogram',
        registers: [baseMetrics.register]
      });

      expect(histogram.constructor.name).toBe('Histogram');
      histogram.observe(100);
      
      // Verify it recorded observation
      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('test_histogram');
    });

    it('should allow creating Gauge instances', async () => {
      const gauge = new baseMetrics.Gauge({
        name: 'test_gauge',
        help: 'Test gauge',
        registers: [baseMetrics.register]
      });

      expect(gauge.constructor.name).toBe('Gauge');
      gauge.set(42);
      
      // Verify it set value
      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('test_gauge');
      expect(metrics).toContain('42');
    });
  });

  describe('Registry Operations', () => {
    it('should allow registering custom metrics', () => {
      const customCounter = new baseMetrics.Counter({
        name: 'custom_metric',
        help: 'Custom test metric',
        registers: [baseMetrics.register]
      });

      const singleMetric = baseMetrics.register.getSingleMetric('custom_metric');
      expect(singleMetric).toBe(customCounter);
    });

    it('should prevent duplicate metric registration', () => {
      new baseMetrics.Counter({
        name: 'duplicate_test',
        help: 'First registration',
        registers: [baseMetrics.register]
      });

      // Second registration should throw
      expect(() => {
        new baseMetrics.Counter({
          name: 'duplicate_test',
          help: 'Duplicate registration',
          registers: [baseMetrics.register]
        });
      }).toThrow();
    });

    it('should retrieve metrics as text', async () => {
      const counter = new baseMetrics.Counter({
        name: 'text_export_test',
        help: 'Test text export',
        registers: [baseMetrics.register]
      });

      counter.inc(5);

      const metricsText = await baseMetrics.register.metrics();
      
      expect(metricsText).toContain('text_export_test');
      expect(metricsText).toContain('5');
    });

    it('should support metric removal', () => {
      const counter = new baseMetrics.Counter({
        name: 'removable_metric',
        help: 'Test removal',
        registers: [baseMetrics.register]
      });

      baseMetrics.register.removeSingleMetric('removable_metric');
      
      const metric = baseMetrics.register.getSingleMetric('removable_metric');
      expect(metric).toBeUndefined();
    });

    it('should clear all metrics', () => {
      new baseMetrics.Counter({
        name: 'clearable_1',
        help: 'Test 1',
        registers: [baseMetrics.register]
      });

      new baseMetrics.Counter({
        name: 'clearable_2',
        help: 'Test 2',
        registers: [baseMetrics.register]
      });

      baseMetrics.register.clear();

      expect(baseMetrics.register.getSingleMetric('clearable_1')).toBeUndefined();
      expect(baseMetrics.register.getSingleMetric('clearable_2')).toBeUndefined();
    });
  });

  describe('Metric Values and Observations', () => {
    it('should track counter increments accurately', async () => {
      const counter = new baseMetrics.Counter({
        name: 'increment_test',
        help: 'Test increments',
        registers: [baseMetrics.register]
      });

      counter.inc();
      counter.inc(5);
      counter.inc(10);

      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('increment_test');
      expect(metrics).toContain('16');
    });

    it('should track histogram observations', async () => {
      const histogram = new baseMetrics.Histogram({
        name: 'observation_test',
        help: 'Test observations',
        buckets: [10, 50, 100],
        registers: [baseMetrics.register]
      });

      histogram.observe(5);
      histogram.observe(25);
      histogram.observe(75);
      histogram.observe(150);

      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('observation_test_count 4');
      expect(metrics).toContain('observation_test_sum 255');
    });

    it('should update gauge values', async () => {
      const gauge = new baseMetrics.Gauge({
        name: 'gauge_test',
        help: 'Test gauge',
        registers: [baseMetrics.register]
      });

      gauge.set(100);
      let metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('gauge_test 100');

      gauge.inc(50);
      metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('gauge_test 150');

      gauge.dec(30);
      metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('gauge_test 120');
    });
  });

  describe('Labels and Multi-dimensional Metrics', () => {
    it('should support labeled counters', async () => {
      const counter = new baseMetrics.Counter({
        name: 'labeled_counter',
        help: 'Test labels',
        labelNames: ['method', 'status'],
        registers: [baseMetrics.register]
      });

      counter.labels('GET', '200').inc();
      counter.labels('POST', '201').inc(5);
      counter.labels('GET', '200').inc(2);

      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('status="200"');
      expect(metrics).toContain('method="POST"');
      expect(metrics).toContain('status="201"');
    });

    it('should support labeled histograms', async () => {
      const histogram = new baseMetrics.Histogram({
        name: 'labeled_histogram',
        help: 'Test labels',
        labelNames: ['endpoint'],
        registers: [baseMetrics.register]
      });

      histogram.labels('/api/users').observe(100);
      histogram.labels('/api/users').observe(200);
      histogram.labels('/api/products').observe(50);

      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('endpoint="/api/users"');
      expect(metrics).toContain('endpoint="/api/products"');
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent counter increments', async () => {
      const counter = new baseMetrics.Counter({
        name: 'concurrent_counter',
        help: 'Test concurrency',
        registers: [baseMetrics.register]
      });

      const promises = Array(100).fill(null).map(() =>
        Promise.resolve(counter.inc())
      );

      await Promise.all(promises);

      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('concurrent_counter 100');
    });

    it('should handle concurrent histogram observations', async () => {
      const histogram = new baseMetrics.Histogram({
        name: 'concurrent_histogram',
        help: 'Test concurrency',
        registers: [baseMetrics.register]
      });

      const promises = Array(50).fill(null).map((_, i) =>
        Promise.resolve(histogram.observe(i))
      );

      await Promise.all(promises);

      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('concurrent_histogram_count 50');
    });
  });

  describe('Default Metrics Collection', () => {
    it('should collect process CPU metrics', async () => {
      const metrics = await baseMetrics.register.metrics();
      
      expect(metrics).toContain('process_cpu_user_seconds_total');
      expect(metrics).toContain('process_cpu_system_seconds_total');
    });

    it('should collect memory metrics', async () => {
      const metrics = await baseMetrics.register.metrics();
      
      expect(metrics).toContain('process_resident_memory_bytes');
      expect(metrics).toContain('nodejs_heap_size_total_bytes');
    });

    it('should collect event loop metrics', async () => {
      const metrics = await baseMetrics.register.metrics();
      
      expect(metrics).toContain('nodejs_eventloop_lag');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero values', async () => {
      const counter = new baseMetrics.Counter({
        name: 'zero_counter',
        help: 'Test zero',
        registers: [baseMetrics.register]
      });

      counter.inc(0);
      
      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('zero_counter 0');
    });

    it('should handle very large values', async () => {
      const histogram = new baseMetrics.Histogram({
        name: 'large_histogram',
        help: 'Test large values',
        registers: [baseMetrics.register]
      });

      histogram.observe(Number.MAX_SAFE_INTEGER);
      
      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('large_histogram_sum');
    });

    it('should handle decimal values in histogram', async () => {
      const histogram = new baseMetrics.Histogram({
        name: 'decimal_histogram',
        help: 'Test decimals',
        registers: [baseMetrics.register]
      });

      histogram.observe(1.5);
      histogram.observe(2.7);
      histogram.observe(0.3);

      const metrics = await baseMetrics.register.metrics();
      expect(metrics).toContain('decimal_histogram_count 3');
      expect(metrics).toContain('decimal_histogram_sum 4.5');
    });
  });
});
