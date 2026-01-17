/**
 * Unit Tests for Prometheus Metrics Service
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock prom-client
jest.mock('prom-client');

describe('PrometheusMetricsService', () => {
  let mockRegistry: any;
  let mockCounter: any;
  let mockHistogram: any;
  let mockGauge: any;
  let Registry: jest.Mock;
  let Counter: jest.Mock;
  let Histogram: jest.Mock;
  let Gauge: jest.Mock;
  let collectDefaultMetrics: jest.Mock;
  let PrometheusMetricsService: any;
  let prometheusMetrics: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    // Mock registry
    mockRegistry = {
      metrics: jest.fn<any>().mockResolvedValue('# HELP metric\nmetric 1'),
      getMetricsAsJSON: jest.fn<any>().mockResolvedValue([{ name: 'metric', value: 1 }]),
      resetMetrics: jest.fn()
    };

    // Mock counter instance
    mockCounter = {
      inc: jest.fn(),
      labels: jest.fn().mockReturnThis()
    };

    // Mock histogram instance
    mockHistogram = {
      observe: jest.fn(),
      labels: jest.fn().mockReturnThis()
    };

    // Mock gauge instance
    mockGauge = {
      set: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn(),
      labels: jest.fn().mockReturnThis()
    };

    // Mock constructors
    Registry = jest.fn().mockImplementation(() => mockRegistry);
    Counter = jest.fn().mockImplementation(() => mockCounter);
    Histogram = jest.fn().mockImplementation(() => mockHistogram);
    Gauge = jest.fn().mockImplementation(() => mockGauge);
    collectDefaultMetrics = jest.fn();

    jest.doMock('prom-client', () => ({
      Registry,
      Counter,
      Histogram,
      Gauge,
      collectDefaultMetrics
    }));

    // Import after mocking
    const module = await import('../../../src/services/prometheus-metrics.service');
    PrometheusMetricsService = module.PrometheusMetricsService;
    prometheusMetrics = module.prometheusMetrics;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create registry and collect default metrics', async () => {
      const service = new PrometheusMetricsService();

      expect(Registry).toHaveBeenCalled();
      expect(collectDefaultMetrics).toHaveBeenCalledWith({ register: mockRegistry });
    });

    it('should create HTTP metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'http_requests_total',
          help: 'Total number of HTTP requests',
          labelNames: ['method', 'route', 'status_code']
        })
      );

      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'http_request_duration_seconds',
          help: 'Duration of HTTP requests in seconds',
          labelNames: ['method', 'route', 'status_code']
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'http_request_errors_total',
          labelNames: ['method', 'route', 'error_type']
        })
      );
    });

    it('should create verification metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'verifications_started_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'verifications_completed_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'verifications_failed_total'
        })
      );

      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'verification_duration_seconds'
        })
      );
    });

    it('should create tax reporting metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tax_calculations_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'form_1099_generated_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tax_report_errors_total'
        })
      );
    });

    it('should create OFAC screening metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ofac_checks_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ofac_matches_total'
        })
      );

      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ofac_check_duration_seconds'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ofac_cache_hits_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ofac_cache_misses_total'
        })
      );
    });

    it('should create risk assessment metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'risk_scores_calculated_total'
        })
      );

      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'high_risk_venues_count'
        })
      );

      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'flagged_venues_count'
        })
      );
    });

    it('should create document management metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'documents_uploaded_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'documents_downloaded_total'
        })
      );

      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'document_upload_size_bytes'
        })
      );
    });

    it('should create GDPR metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'gdpr_deletion_requests_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'gdpr_export_requests_total'
        })
      );
    });

    it('should create database metrics', async () => {
      new PrometheusMetricsService();

      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'db_query_duration_seconds'
        })
      );

      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'db_connection_pool_size'
        })
      );

      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'db_active_connections'
        })
      );
    });

    it('should create cache metrics', async () => {
      new PrometheusMetricsService();

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'cache_hits_total'
        })
      );

      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'cache_misses_total'
        })
      );

      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'cache_size_bytes'
        })
      );
    });
  });

  describe('getMetrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const service = new PrometheusMetricsService();

      const metrics = await service.getMetrics();

      expect(mockRegistry.metrics).toHaveBeenCalled();
      expect(metrics).toBe('# HELP metric\nmetric 1');
    });
  });

  describe('getMetricsJSON', () => {
    it('should return metrics as JSON array', async () => {
      const service = new PrometheusMetricsService();

      const metrics = await service.getMetricsJSON();

      expect(mockRegistry.getMetricsAsJSON).toHaveBeenCalled();
      expect(metrics).toEqual([{ name: 'metric', value: 1 }]);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', async () => {
      const service = new PrometheusMetricsService();

      service.resetMetrics();

      expect(mockRegistry.resetMetrics).toHaveBeenCalled();
    });
  });

  describe('recordHttpRequest', () => {
    it('should record successful request', async () => {
      const service = new PrometheusMetricsService();

      service.recordHttpRequest('GET', '/api/health', 200, 0.05);

      expect(mockHistogram.labels).toHaveBeenCalledWith('GET', '/api/health', '200');
      expect(mockHistogram.observe).toHaveBeenCalledWith(0.05);
      expect(mockCounter.labels).toHaveBeenCalledWith('GET', '/api/health', '200');
      expect(mockCounter.inc).toHaveBeenCalled();
    });

    it('should record client error (4xx)', async () => {
      const service = new PrometheusMetricsService();

      service.recordHttpRequest('POST', '/api/users', 400, 0.02);

      expect(mockCounter.labels).toHaveBeenCalledWith('POST', '/api/users', 'client_error');
      expect(mockCounter.inc).toHaveBeenCalled();
    });

    it('should record server error (5xx)', async () => {
      const service = new PrometheusMetricsService();

      service.recordHttpRequest('GET', '/api/data', 500, 0.1);

      expect(mockCounter.labels).toHaveBeenCalledWith('GET', '/api/data', 'server_error');
      expect(mockCounter.inc).toHaveBeenCalled();
    });

    it('should not record error for success status', async () => {
      const service = new PrometheusMetricsService();
      mockCounter.labels.mockClear();
      mockCounter.inc.mockClear();

      service.recordHttpRequest('GET', '/api/health', 200, 0.05);

      // Should only be called for duration and total, not errors
      const errorCalls = mockCounter.labels.mock.calls.filter(
        (call: any) => call[2] === 'client_error' || call[2] === 'server_error'
      );
      expect(errorCalls).toHaveLength(0);
    });
  });

  describe('recordDbQuery', () => {
    it('should record database query duration', async () => {
      const service = new PrometheusMetricsService();

      service.recordDbQuery('SELECT', 'users', 0.015);

      expect(mockHistogram.labels).toHaveBeenCalledWith('SELECT', 'users');
      expect(mockHistogram.observe).toHaveBeenCalledWith(0.015);
    });

    it('should handle different query types', async () => {
      const service = new PrometheusMetricsService();

      service.recordDbQuery('INSERT', 'orders', 0.025);
      service.recordDbQuery('UPDATE', 'venues', 0.018);
      service.recordDbQuery('DELETE', 'sessions', 0.012);

      expect(mockHistogram.labels).toHaveBeenCalledWith('INSERT', 'orders');
      expect(mockHistogram.labels).toHaveBeenCalledWith('UPDATE', 'venues');
      expect(mockHistogram.labels).toHaveBeenCalledWith('DELETE', 'sessions');
    });
  });

  describe('updateDbMetrics', () => {
    it('should update database connection metrics', async () => {
      const service = new PrometheusMetricsService();

      service.updateDbMetrics(10, 5);

      expect(mockGauge.set).toHaveBeenCalledWith(10);
      expect(mockGauge.set).toHaveBeenCalledWith(5);
    });

    it('should handle zero connections', async () => {
      const service = new PrometheusMetricsService();

      service.updateDbMetrics(10, 0);

      expect(mockGauge.set).toHaveBeenCalledWith(0);
    });
  });

  describe('recordCacheOperation', () => {
    it('should record cache hit', async () => {
      const service = new PrometheusMetricsService();

      service.recordCacheOperation('redis', true);

      expect(mockCounter.labels).toHaveBeenCalledWith('redis');
      expect(mockCounter.inc).toHaveBeenCalled();
    });

    it('should record cache miss', async () => {
      const service = new PrometheusMetricsService();

      service.recordCacheOperation('redis', false);

      expect(mockCounter.labels).toHaveBeenCalledWith('redis');
      expect(mockCounter.inc).toHaveBeenCalled();
    });

    it('should update cache size when provided', async () => {
      const service = new PrometheusMetricsService();

      service.recordCacheOperation('redis', true, 1048576);

      expect(mockGauge.labels).toHaveBeenCalledWith('redis');
      expect(mockGauge.set).toHaveBeenCalledWith(1048576);
    });

    it('should not update cache size when not provided', async () => {
      const service = new PrometheusMetricsService();
      mockGauge.labels.mockClear();
      mockGauge.set.mockClear();

      service.recordCacheOperation('memory', true);

      // Gauge.set should not be called for size
      expect(mockGauge.set).not.toHaveBeenCalled();
    });
  });

  describe('getErrorType (private, tested via recordHttpRequest)', () => {
    it('should return client_error for 4xx', async () => {
      const service = new PrometheusMetricsService();

      service.recordHttpRequest('GET', '/test', 404, 0.01);

      expect(mockCounter.labels).toHaveBeenCalledWith('GET', '/test', 'client_error');
    });

    it('should return server_error for 5xx', async () => {
      const service = new PrometheusMetricsService();

      service.recordHttpRequest('GET', '/test', 503, 0.01);

      expect(mockCounter.labels).toHaveBeenCalledWith('GET', '/test', 'server_error');
    });
  });

  describe('exported singleton', () => {
    it('should export prometheusMetrics instance', () => {
      expect(prometheusMetrics).toBeDefined();
      expect(prometheusMetrics.registry).toBeDefined();
    });
  });
});
