/**
 * Metrics Utility Unit Tests
 */

// Mock circuit breaker
jest.mock('../../../src/utils/circuit-breaker', () => ({
  getAllCircuits: jest.fn(() => new Map()),
  CircuitState: {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  },
}));

import {
  incrementCounter,
  setGauge,
  incrementGauge,
  decrementGauge,
  observeHistogram,
  startTimer,
  timeAsync,
  analyticsMetrics,
  getPrometheusMetrics,
  getMetricsStatus,
} from '../../../src/utils/metrics';

describe('Metrics Utility', () => {
  describe('incrementCounter', () => {
    it('should increment counter without labels', () => {
      incrementCounter('test_counter', 1);
      incrementCounter('test_counter', 2);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('test_counter 3');
    });

    it('should increment counter with labels', () => {
      incrementCounter('http_requests', 1, { method: 'GET', status: 200 });
      incrementCounter('http_requests', 1, { method: 'GET', status: 200 });
      incrementCounter('http_requests', 1, { method: 'POST', status: 201 });

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('http_requests{method="GET",status="200"} 2');
      expect(metrics).toContain('http_requests{method="POST",status="201"} 1');
    });

    it('should use default increment of 1', () => {
      incrementCounter('default_counter');

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('default_counter 1');
    });
  });

  describe('setGauge', () => {
    it('should set gauge value', () => {
      setGauge('cpu_usage', 75.5);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('cpu_usage 75.5');
    });

    it('should update existing gauge', () => {
      setGauge('memory_usage', 100);
      setGauge('memory_usage', 200);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('memory_usage 200');
    });

    it('should set gauge with labels', () => {
      setGauge('queue_size', 10, { queue: 'email' });
      setGauge('queue_size', 5, { queue: 'sms' });

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('queue_size{queue="email"} 10');
      expect(metrics).toContain('queue_size{queue="sms"} 5');
    });
  });

  describe('incrementGauge', () => {
    it('should increment gauge', () => {
      setGauge('connections', 10);
      incrementGauge('connections', 5);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('connections 15');
    });

    it('should create gauge if not exists', () => {
      incrementGauge('new_gauge', 3);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('new_gauge 3');
    });
  });

  describe('decrementGauge', () => {
    it('should decrement gauge', () => {
      setGauge('active_users', 100);
      decrementGauge('active_users', 10);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('active_users 90');
    });

    it('should allow negative values', () => {
      setGauge('balance', 10);
      decrementGauge('balance', 20);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('balance -10');
    });
  });

  describe('observeHistogram', () => {
    it('should observe histogram value', () => {
      observeHistogram('request_duration', 0.5);
      observeHistogram('request_duration', 1.5);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('request_duration_sum');
      expect(metrics).toContain('request_duration_count 2');
      expect(metrics).toContain('request_duration_bucket');
    });

    it('should populate buckets correctly', () => {
      observeHistogram('latency', 0.1);
      observeHistogram('latency', 0.5);
      observeHistogram('latency', 2);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('latency_count 3');
      expect(metrics).toContain('latency_sum');
    });

    it('should support labels', () => {
      observeHistogram('api_latency', 0.25, { endpoint: '/users' });
      observeHistogram('api_latency', 0.35, { endpoint: '/users' });

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('api_latency_count{endpoint="/users"} 2');
    });
  });

  describe('startTimer', () => {
    it('should measure elapsed time', async () => {
      const end = startTimer();

      await new Promise(resolve => setTimeout(resolve, 100));

      const duration = end();

      expect(duration).toBeGreaterThanOrEqual(0.09); // ~100ms
      expect(duration).toBeLessThan(0.2); // Should not be too long
    });

    it('should return time in seconds', () => {
      const end = startTimer();
      const duration = end();

      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('timeAsync', () => {
    it('should time async function and record success', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await timeAsync('test_operation', fn, { service: 'api' });

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('test_operation_total{service="api",status="success"} 1');
      expect(metrics).toContain('test_operation_duration_seconds');
    });

    it('should record failure when function throws', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(
        timeAsync('failing_operation', fn)
      ).rejects.toThrow('Test error');

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('failing_operation_total{status="error"} 1');
    });

    it('should measure actual execution time', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      };

      await timeAsync('timed_operation', fn);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('timed_operation_duration_seconds');
    });
  });

  describe('analyticsMetrics', () => {
    it('should have requestsTotal method', () => {
      analyticsMetrics.requestsTotal('GET', '/api/metrics', 200);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('analytics_http_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('status="200"');
    });

    it('should have requestDuration method', () => {
      analyticsMetrics.requestDuration('POST', '/api/data', 0.123);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('analytics_http_request_duration_seconds');
    });

    it('should have database metrics', () => {
      analyticsMetrics.dbQueryDuration('SELECT * FROM users', 0.05);
      analyticsMetrics.dbConnections('primary', 10);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('analytics_db_query_duration_seconds');
      expect(metrics).toContain('analytics_db_connections');
    });

    it('should have cache metrics', () => {
      analyticsMetrics.cacheHit('redis');
      analyticsMetrics.cacheMiss('redis');

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('analytics_cache_hits_total');
      expect(metrics).toContain('analytics_cache_misses_total');
    });

    it('should have InfluxDB metrics', () => {
      analyticsMetrics.influxQueryDuration('analytics', 0.234);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('analytics_influx_query_duration_seconds');
    });

    it('should have RFM metrics', () => {
      analyticsMetrics.rfmCalculationDuration(5.67);
      analyticsMetrics.rfmCustomersProcessed(1000);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('analytics_rfm_calculation_duration_seconds');
      expect(metrics).toContain('analytics_rfm_customers_processed_total');
    });

    it('should have activity metrics', () => {
      analyticsMetrics.activeTenants(25);
      analyticsMetrics.activeConnections(150);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('analytics_active_tenants');
      expect(metrics).toContain('analytics_active_connections');
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return Prometheus format string', () => {
      incrementCounter('test_metric', 1);
      const metrics = getPrometheusMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('# TYPE');
    });

    it('should include counter type declarations', () => {
      incrementCounter('my_counter', 1);
      const metrics = getPrometheusMetrics();

      expect(metrics).toContain('# TYPE my_counter counter');
    });

    it('should include gauge type declarations', () => {
      setGauge('my_gauge', 42);
      const metrics = getPrometheusMetrics();

      expect(metrics).toContain('# TYPE my_gauge gauge');
    });

    it('should include histogram type declarations', () => {
      observeHistogram('my_histogram', 1.5);
      const metrics = getPrometheusMetrics();

      expect(metrics).toContain('# TYPE my_histogram histogram');
    });

    it('should include circuit breaker metrics', () => {
      const metrics = getPrometheusMetrics();

      expect(metrics).toContain('# TYPE circuit_breaker_status gauge');
    });
  });

  describe('getMetricsStatus', () => {
    it('should return metrics status object', () => {
      incrementCounter('status_counter', 1);
      setGauge('status_gauge', 100);

      const status = getMetricsStatus();

      expect(status).toHaveProperty('counters');
      expect(status).toHaveProperty('gauges');
      expect(status).toHaveProperty('circuits');
    });

    it('should include circuit breaker status', () => {
      const status = getMetricsStatus();

      expect(status.circuits).toBeDefined();
      expect(typeof status.circuits).toBe('object');
    });
  });
});
