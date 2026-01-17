// Unmock prom-client for this test - we need the real implementation
jest.unmock('prom-client');

import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  authAttemptsTotal,
  circuitBreakerState,
  cacheHits,
  cacheMisses,
  securityViolations,
  updateSystemMetrics,
  measureEventLoopLag,
  getMetrics,
  getMetricsContentType,
  memoryUsage,
  eventLoopLag,
} from '../../../src/utils/metrics';

describe('metrics.ts', () => {
  beforeEach(async () => {
    // Clear all metrics before each test
    register.resetMetrics();
  });

  describe('httpRequestsTotal counter', () => {
    it('increments counter and appears in metrics', async () => {
      httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });

      const metrics = await getMetrics();
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toMatch(/http_requests_total\{.*method="GET".*route="\/test".*status_code="200".*\} 1/);
    });

    it('increments multiple times', async () => {
      httpRequestsTotal.inc({ method: 'POST', route: '/api', status_code: '201' });
      httpRequestsTotal.inc({ method: 'POST', route: '/api', status_code: '201' });
      httpRequestsTotal.inc({ method: 'POST', route: '/api', status_code: '201' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/http_requests_total\{.*method="POST".*route="\/api".*status_code="201".*\} 3/);
    });

    it('tracks different label combinations separately', async () => {
      httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
      httpRequestsTotal.inc({ method: 'POST', route: '/test', status_code: '201' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/http_requests_total\{.*method="GET".*\} 1/);
      expect(metrics).toMatch(/http_requests_total\{.*method="POST".*\} 1/);
    });
  });

  describe('httpRequestDuration histogram', () => {
    it('observes duration and appears in metrics', async () => {
      httpRequestDuration.observe({ method: 'GET', route: '/test', status_code: '200' }, 0.5);

      const metrics = await getMetrics();
      expect(metrics).toContain('http_request_duration_seconds');
      expect(metrics).toMatch(/http_request_duration_seconds_sum\{.*method="GET".*\} 0.5/);
      expect(metrics).toMatch(/http_request_duration_seconds_count\{.*method="GET".*\} 1/);
    });

    it('accumulates multiple observations', async () => {
      httpRequestDuration.observe({ method: 'POST', route: '/api', status_code: '200' }, 0.1);
      httpRequestDuration.observe({ method: 'POST', route: '/api', status_code: '200' }, 0.2);
      httpRequestDuration.observe({ method: 'POST', route: '/api', status_code: '200' }, 0.3);

      const metrics = await getMetrics();
      expect(metrics).toMatch(/http_request_duration_seconds_sum\{.*method="POST".*\} 0.6/);
      expect(metrics).toMatch(/http_request_duration_seconds_count\{.*method="POST".*\} 3/);
    });

    it('creates buckets for histogram', async () => {
      httpRequestDuration.observe({ method: 'GET', route: '/test', status_code: '200' }, 0.05);

      const metrics = await getMetrics();
      // Should have buckets defined (0.001, 0.005, 0.01, 0.05, 0.1, etc.)
      expect(metrics).toMatch(/http_request_duration_seconds_bucket\{.*le="0.001".*\}/);
      expect(metrics).toMatch(/http_request_duration_seconds_bucket\{.*le="0.1".*\}/);
    });
  });

  describe('authAttemptsTotal counter', () => {
    it('tracks successful auth attempts', async () => {
      authAttemptsTotal.inc({ status: 'success' });
      authAttemptsTotal.inc({ status: 'success' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/auth_attempts_total\{.*status="success".*\} 2/);
    });

    it('tracks failed auth attempts separately', async () => {
      authAttemptsTotal.inc({ status: 'success' });
      authAttemptsTotal.inc({ status: 'failure' });
      authAttemptsTotal.inc({ status: 'expired' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/auth_attempts_total\{.*status="success".*\} 1/);
      expect(metrics).toMatch(/auth_attempts_total\{.*status="failure".*\} 1/);
      expect(metrics).toMatch(/auth_attempts_total\{.*status="expired".*\} 1/);
    });
  });

  describe('circuitBreakerState gauge', () => {
    it('sets gauge value and appears in metrics', async () => {
      circuitBreakerState.set({ service: 'auth' }, 1);

      const metrics = await getMetrics();
      expect(metrics).toContain('circuit_breaker_state');
      expect(metrics).toMatch(/circuit_breaker_state\{.*service="auth".*\} 1/);
    });

    it('updates gauge value', async () => {
      circuitBreakerState.set({ service: 'venue' }, 0);
      circuitBreakerState.set({ service: 'venue' }, 1);
      circuitBreakerState.set({ service: 'venue' }, 2);

      const metrics = await getMetrics();
      expect(metrics).toMatch(/circuit_breaker_state\{.*service="venue".*\} 2/);
    });

    it('tracks different services separately', async () => {
      circuitBreakerState.set({ service: 'auth' }, 0);
      circuitBreakerState.set({ service: 'venue' }, 1);
      circuitBreakerState.set({ service: 'payment' }, 2);

      const metrics = await getMetrics();
      expect(metrics).toMatch(/circuit_breaker_state\{.*service="auth".*\} 0/);
      expect(metrics).toMatch(/circuit_breaker_state\{.*service="venue".*\} 1/);
      expect(metrics).toMatch(/circuit_breaker_state\{.*service="payment".*\} 2/);
    });
  });

  describe('cache metrics', () => {
    it('tracks cache hits', async () => {
      cacheHits.inc({ cache_type: 'user' });
      cacheHits.inc({ cache_type: 'user' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/cache_hits_total\{.*cache_type="user".*\} 2/);
    });

    it('tracks cache misses', async () => {
      cacheMisses.inc({ cache_type: 'venue_access' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/cache_misses_total\{.*cache_type="venue_access".*\} 1/);
    });

    it('tracks hits and misses separately', async () => {
      cacheHits.inc({ cache_type: 'user' });
      cacheHits.inc({ cache_type: 'user' });
      cacheMisses.inc({ cache_type: 'user' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/cache_hits_total\{.*cache_type="user".*\} 2/);
      expect(metrics).toMatch(/cache_misses_total\{.*cache_type="user".*\} 1/);
    });
  });

  describe('securityViolations counter', () => {
    it('tracks security violations by type', async () => {
      securityViolations.inc({ violation_type: 'header_manipulation' });
      securityViolations.inc({ violation_type: 'tenant_bypass' });
      securityViolations.inc({ violation_type: 'header_manipulation' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/security_violations_total\{.*violation_type="header_manipulation".*\} 2/);
      expect(metrics).toMatch(/security_violations_total\{.*violation_type="tenant_bypass".*\} 1/);
    });
  });

  describe('updateSystemMetrics', () => {
    it('updates memory usage gauges with process values', async () => {
      updateSystemMetrics();

      const metrics = await getMetrics();
      expect(metrics).toContain('memory_usage_bytes');
      expect(metrics).toMatch(/memory_usage_bytes\{.*type="heapUsed".*\} \d+/);
      expect(metrics).toMatch(/memory_usage_bytes\{.*type="heapTotal".*\} \d+/);
      expect(metrics).toMatch(/memory_usage_bytes\{.*type="rss".*\} \d+/);
      expect(metrics).toMatch(/memory_usage_bytes\{.*type="external".*\} \d+/);
    });

    it('updates gauges with actual memory values', async () => {
      const memBefore = process.memoryUsage();
      updateSystemMetrics();

      const metrics = await getMetrics();
      // Verify values are reasonable (greater than 0)
      const heapUsedMatch = metrics.match(/memory_usage_bytes\{.*type="heapUsed".*\} (\d+)/);
      expect(heapUsedMatch).toBeTruthy();
      const heapUsedValue = parseInt(heapUsedMatch![1]);
      expect(heapUsedValue).toBeGreaterThan(0);
      expect(heapUsedValue).toBeLessThanOrEqual(memBefore.heapTotal * 2); // Sanity check
    });
  });

  describe('measureEventLoopLag', () => {
    it('records event loop lag in histogram', (done) => {
      measureEventLoopLag();

      // Wait for setImmediate to execute
      setTimeout(async () => {
        const metrics = await getMetrics();
        expect(metrics).toContain('event_loop_lag_seconds');
        expect(metrics).toMatch(/event_loop_lag_seconds_count\{.*\} \d+/);
        expect(metrics).toMatch(/event_loop_lag_seconds_sum\{.*\} \d+\.?\d*/);
        done();
      }, 50);
    });
  });

  describe('getMetrics', () => {
    it('returns metrics as string', async () => {
      const metrics = await getMetrics();
      expect(typeof metrics).toBe('string');
    });

    it('returns prometheus format with HELP and TYPE', async () => {
      httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });

      const metrics = await getMetrics();
      expect(metrics).toContain('# HELP http_requests_total');
      expect(metrics).toContain('# TYPE http_requests_total counter');
    });

    it('includes default labels in all metrics', async () => {
      httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });

      const metrics = await getMetrics();
      expect(metrics).toMatch(/service="api-gateway"/);
      expect(metrics).toMatch(/environment="test"/);
    });

    it('returns all registered metrics', async () => {
      httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
      authAttemptsTotal.inc({ status: 'success' });
      cacheHits.inc({ cache_type: 'user' });

      const metrics = await getMetrics();
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('auth_attempts_total');
      expect(metrics).toContain('cache_hits_total');
    });
  });

  describe('getMetricsContentType', () => {
    it('returns prometheus content type', () => {
      const contentType = getMetricsContentType();
      expect(typeof contentType).toBe('string');
      expect(contentType).toContain('text/plain');
      expect(contentType).toMatch(/version=0\.0\.\d/);
    });
  });
});
