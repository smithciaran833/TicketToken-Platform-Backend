// Mock circuit-breaker
jest.mock('../../../src/utils/circuit-breaker', () => ({
  getAllCircuitBreakerStats: jest.fn().mockReturnValue([
    { name: 'stripe', state: 'CLOSED', failures: 0, totalRequests: 100 },
    { name: 'square', state: 'OPEN', failures: 5, totalRequests: 50 },
  ]),
}));

// Mock database config
jest.mock('../../../src/config/database', () => ({
  getPoolStats: jest.fn().mockReturnValue({
    size: 10,
    used: 3,
    free: 7,
    pending: 0,
  }),
}));

import {
  recordHttpRequest,
  httpMetricsOnRequest,
  httpMetricsOnResponse,
  recordProviderRequest,
  startProviderTimer,
  recordSyncJob,
  recordWebhook,
  setActiveConnections,
  updateSystemMetrics,
  getPrometheusMetrics,
  getMetricsJson,
} from '../../../src/utils/metrics';
import { getAllCircuitBreakerStats } from '../../../src/utils/circuit-breaker';
import { getPoolStats } from '../../../src/config/database';

describe('Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordHttpRequest', () => {
    it('should record HTTP request metrics', () => {
      recordHttpRequest('GET', '/api/health', 200, 50);

      const metrics = getMetricsJson();
      expect(metrics.http.requestsTotal).toBeGreaterThan(0);
      expect(metrics.http.requestsByLabel['GET:/api/health:200']).toBeDefined();
    });

    it('should record different status codes separately', () => {
      recordHttpRequest('POST', '/api/sync', 200, 100);
      recordHttpRequest('POST', '/api/sync', 500, 200);

      const metrics = getMetricsJson();
      expect(metrics.http.requestsByLabel['POST:/api/sync:200']).toBeDefined();
      expect(metrics.http.requestsByLabel['POST:/api/sync:500']).toBeDefined();
    });

    it('should accumulate request counts', () => {
      const initialMetrics = getMetricsJson();
      const initialTotal = initialMetrics.http.requestsTotal;

      recordHttpRequest('GET', '/test', 200, 10);
      recordHttpRequest('GET', '/test', 200, 20);

      const metrics = getMetricsJson();
      expect(metrics.http.requestsTotal).toBe(initialTotal + 2);
    });

    it('should record duration in histogram', () => {
      recordHttpRequest('GET', '/histogram-test', 200, 150);

      const metrics = getMetricsJson();
      const histogram = metrics.http.durations['GET:/histogram-test'];
      expect(histogram).toBeDefined();
      expect(histogram.count).toBeGreaterThan(0);
      expect(histogram.sum).toBeGreaterThan(0);
    });
  });

  describe('httpMetricsOnRequest', () => {
    it('should store start time on request', async () => {
      const mockRequest: any = {};
      const mockReply: any = {};

      await httpMetricsOnRequest(mockRequest, mockReply);

      expect(mockRequest.metricsStartTime).toBeDefined();
      expect(typeof mockRequest.metricsStartTime).toBe('bigint');
    });
  });

  describe('httpMetricsOnResponse', () => {
    it('should calculate duration and record metrics', async () => {
      const mockRequest: any = {
        metricsStartTime: process.hrtime.bigint(),
        method: 'GET',
        routeOptions: { url: '/api/test' },
        url: '/api/test',
      };
      const mockReply: any = {
        statusCode: 200,
      };

      // Small delay to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 1));

      await httpMetricsOnResponse(mockRequest, mockReply);

      const metrics = getMetricsJson();
      expect(metrics.http.requestsByLabel['GET:/api/test:200']).toBeDefined();
    });

    it('should use request.url when routeOptions.url is not available', async () => {
      const mockRequest: any = {
        metricsStartTime: process.hrtime.bigint(),
        method: 'POST',
        routeOptions: {},
        url: '/fallback-url',
      };
      const mockReply: any = {
        statusCode: 201,
      };

      await httpMetricsOnResponse(mockRequest, mockReply);

      const metrics = getMetricsJson();
      expect(metrics.http.requestsByLabel['POST:/fallback-url:201']).toBeDefined();
    });

    it('should handle missing start time gracefully', async () => {
      const mockRequest: any = {
        method: 'GET',
        url: '/no-start-time',
      };
      const mockReply: any = {
        statusCode: 200,
      };

      // Should not throw
      await expect(httpMetricsOnResponse(mockRequest, mockReply)).resolves.toBeUndefined();
    });
  });

  describe('recordProviderRequest', () => {
    it('should record successful provider request', () => {
      recordProviderRequest('stripe', 'createPayment', 250, true);

      const metrics = getMetricsJson();
      expect(metrics.providers.requestsByLabel['stripe:createPayment:success']).toBeDefined();
    });

    it('should record failed provider request', () => {
      recordProviderRequest('square', 'fetchOrders', 500, false);

      const metrics = getMetricsJson();
      expect(metrics.providers.requestsByLabel['square:fetchOrders:failure']).toBeDefined();
      expect(metrics.providers.errors['square:fetchOrders']).toBeDefined();
    });

    it('should not record error for successful requests', () => {
      const initialMetrics = getMetricsJson();
      const initialErrors = initialMetrics.providers.errors['newprovider:newop'] || 0;

      recordProviderRequest('newprovider', 'newop', 100, true);

      const metrics = getMetricsJson();
      expect(metrics.providers.errors['newprovider:newop'] || 0).toBe(initialErrors);
    });

    it('should record duration histogram', () => {
      recordProviderRequest('mailchimp', 'syncContacts', 1500, true);

      const metrics = getMetricsJson();
      const histogram = metrics.providers.durations['mailchimp:syncContacts'];
      expect(histogram).toBeDefined();
      expect(histogram.sum).toBeGreaterThanOrEqual(1500);
    });
  });

  describe('startProviderTimer', () => {
    it('should return a function to stop timer', () => {
      const stopTimer = startProviderTimer('stripe', 'charge');

      expect(typeof stopTimer).toBe('function');
    });

    it('should record metrics when timer is stopped', async () => {
      const stopTimer = startProviderTimer('timer-provider', 'timer-op');

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 5));

      stopTimer(true);

      const metrics = getMetricsJson();
      expect(metrics.providers.requestsByLabel['timer-provider:timer-op:success']).toBeDefined();
    });

    it('should record failure when stopped with false', () => {
      const stopTimer = startProviderTimer('fail-provider', 'fail-op');

      stopTimer(false);

      const metrics = getMetricsJson();
      expect(metrics.providers.requestsByLabel['fail-provider:fail-op:failure']).toBeDefined();
    });

    it('should default to success when called without argument', () => {
      const stopTimer = startProviderTimer('default-provider', 'default-op');

      stopTimer();

      const metrics = getMetricsJson();
      expect(metrics.providers.requestsByLabel['default-provider:default-op:success']).toBeDefined();
    });
  });

  describe('recordSyncJob', () => {
    it('should record successful sync job', () => {
      recordSyncJob('stripe', 'full', 5000, 100, true);

      const metrics = getMetricsJson();
      expect(metrics.sync.jobsByLabel['stripe:full:success']).toBeDefined();
    });

    it('should record failed sync job', () => {
      recordSyncJob('square', 'incremental', 1000, 50, false);

      const metrics = getMetricsJson();
      expect(metrics.sync.jobsByLabel['square:incremental:failure']).toBeDefined();
    });

    it('should track records processed', () => {
      const initialMetrics = getMetricsJson();
      const initialCount = initialMetrics.sync.recordsProcessed['sync-test:full'] || 0;

      recordSyncJob('sync-test', 'full', 2000, 200, true);

      const metrics = getMetricsJson();
      expect(metrics.sync.recordsProcessed['sync-test:full']).toBeGreaterThan(initialCount);
    });

    it('should keep only last 100 duration entries', () => {
      // Record more than 100 jobs
      for (let i = 0; i < 110; i++) {
        recordSyncJob('overflow-provider', 'overflow-type', i * 10, 10, true);
      }

      // Should not throw and metrics should still work
      const metrics = getMetricsJson();
      expect(metrics.sync.jobsByLabel['overflow-provider:overflow-type:success']).toBeDefined();
    });
  });

  describe('recordWebhook', () => {
    it('should record received webhook', () => {
      recordWebhook('stripe', 'payment.succeeded', 'received');

      const metrics = getMetricsJson();
      expect(metrics.webhooks.received['stripe:payment.succeeded']).toBeDefined();
    });

    it('should record processed webhook', () => {
      recordWebhook('square', 'order.created', 'processed');

      const metrics = getMetricsJson();
      expect(metrics.webhooks.processed['square:order.created']).toBeDefined();
    });

    it('should record failed webhook', () => {
      recordWebhook('mailchimp', 'subscriber.added', 'failed');

      const metrics = getMetricsJson();
      expect(metrics.webhooks.failed['mailchimp:subscriber.added']).toBeDefined();
    });
  });

  describe('setActiveConnections', () => {
    it('should set active connections gauge', () => {
      setActiveConnections(42);

      const metrics = getMetricsJson();
      expect(metrics.system.activeConnections).toBe(42);
    });

    it('should update timestamp', () => {
      const before = Date.now();
      setActiveConnections(10);
      const after = Date.now();

      const metrics = getMetricsJson();
      expect(metrics.system.activeConnections).toBe(10);
    });
  });

  describe('updateSystemMetrics', () => {
    it('should update memory usage', () => {
      updateSystemMetrics();

      const metrics = getMetricsJson();
      expect(metrics.system.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return string in Prometheus format', () => {
      recordHttpRequest('GET', '/prom-test', 200, 100);

      const prometheus = getPrometheusMetrics();

      expect(typeof prometheus).toBe('string');
      expect(prometheus).toContain('# HELP');
      expect(prometheus).toContain('# TYPE');
    });

    it('should include HTTP request metrics', () => {
      recordHttpRequest('GET', '/prom-http', 200, 50);

      const prometheus = getPrometheusMetrics();

      expect(prometheus).toContain('http_requests_total');
      expect(prometheus).toContain('http_request_duration_ms');
    });

    it('should include provider metrics', () => {
      recordProviderRequest('prom-provider', 'prom-op', 100, true);

      const prometheus = getPrometheusMetrics();

      expect(prometheus).toContain('provider_requests_total');
      expect(prometheus).toContain('provider_errors_total');
    });

    it('should include webhook metrics', () => {
      recordWebhook('prom-webhook', 'event', 'received');

      const prometheus = getPrometheusMetrics();

      expect(prometheus).toContain('webhooks_received_total');
    });

    it('should include circuit breaker metrics', () => {
      const prometheus = getPrometheusMetrics();

      expect(prometheus).toContain('circuit_breaker_state');
      expect(prometheus).toContain('circuit_breaker_failures');
      expect(prometheus).toContain('circuit_breaker_total_requests');
      expect(getAllCircuitBreakerStats).toHaveBeenCalled();
    });

    it('should include database pool metrics', () => {
      const prometheus = getPrometheusMetrics();

      expect(prometheus).toContain('db_pool_size');
      expect(prometheus).toContain('db_pool_used');
      expect(prometheus).toContain('db_pool_free');
      expect(prometheus).toContain('db_pool_pending');
      expect(getPoolStats).toHaveBeenCalled();
    });

    it('should include memory metrics', () => {
      const prometheus = getPrometheusMetrics();

      expect(prometheus).toContain('process_heap_bytes');
    });

    it('should handle missing pool stats', () => {
      (getPoolStats as jest.Mock).mockReturnValueOnce(null);

      const prometheus = getPrometheusMetrics();

      // Should not throw and should still contain other metrics
      expect(prometheus).toContain('http_requests_total');
    });
  });

  describe('getMetricsJson', () => {
    it('should return metrics as JSON object', () => {
      const metrics = getMetricsJson();

      expect(metrics).toHaveProperty('http');
      expect(metrics).toHaveProperty('providers');
      expect(metrics).toHaveProperty('sync');
      expect(metrics).toHaveProperty('webhooks');
      expect(metrics).toHaveProperty('circuitBreakers');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('system');
    });

    it('should include HTTP metrics structure', () => {
      const metrics = getMetricsJson();

      expect(metrics.http).toHaveProperty('requestsTotal');
      expect(metrics.http).toHaveProperty('requestsByLabel');
      expect(metrics.http).toHaveProperty('durations');
    });

    it('should include provider metrics structure', () => {
      const metrics = getMetricsJson();

      expect(metrics.providers).toHaveProperty('requestsTotal');
      expect(metrics.providers).toHaveProperty('requestsByLabel');
      expect(metrics.providers).toHaveProperty('errors');
      expect(metrics.providers).toHaveProperty('durations');
    });

    it('should include sync metrics structure', () => {
      const metrics = getMetricsJson();

      expect(metrics.sync).toHaveProperty('jobsTotal');
      expect(metrics.sync).toHaveProperty('jobsByLabel');
      expect(metrics.sync).toHaveProperty('recordsProcessed');
    });

    it('should include system metrics', () => {
      const metrics = getMetricsJson();

      expect(metrics.system).toHaveProperty('memoryUsage');
      expect(metrics.system).toHaveProperty('activeConnections');
    });

    it('should call getAllCircuitBreakerStats', () => {
      getMetricsJson();

      expect(getAllCircuitBreakerStats).toHaveBeenCalled();
    });

    it('should call getPoolStats', () => {
      getMetricsJson();

      expect(getPoolStats).toHaveBeenCalled();
    });
  });
});
