// Mock dependencies BEFORE imports
const mockPushMetrics = jest.fn();
const mockQuery = jest.fn();
const mockRegisterMetrics = jest.fn();

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    pushMetrics: mockPushMetrics,
  },
}));

jest.mock('../../../src/utils/database', () => ({
  pgPool: {
    query: mockQuery,
  },
}));

jest.mock('prom-client', () => ({
  register: {
    metrics: mockRegisterMetrics,
  },
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { metricsController } from '../../../src/controllers/metrics.controller';

describe('MetricsController', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      params: {},
      query: {},
      body: {},
    };
    mockReply = {
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };
  });

  describe('getMetrics', () => {
    it('should return metrics from last 5 minutes', async () => {
      const mockMetrics = {
        rows: [
          { metric_name: 'http_requests_total', service_name: 'api-gateway', value: 1500, labels: {}, timestamp: '2024-01-15T10:00:00Z' },
          { metric_name: 'response_time_ms', service_name: 'api-gateway', value: 45, labels: { endpoint: '/api/v1/users' }, timestamp: '2024-01-15T10:00:00Z' },
        ],
      };
      mockQuery.mockResolvedValue(mockMetrics);

      const result = await metricsController.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain("INTERVAL '5 minutes'");
      expect(mockQuery.mock.calls[0][0]).toContain('LIMIT 1000');
      expect(result).toEqual(mockMetrics.rows);
    });

    it('should return empty array when no recent metrics', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await metricsController.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(result).toEqual([]);
    });

    it('should return empty array on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection lost'));

      const result = await metricsController.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(result).toEqual([]);
    });

    it('should query correct columns', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await metricsController.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const queryString = mockQuery.mock.calls[0][0];
      expect(queryString).toContain('metric_name');
      expect(queryString).toContain('service_name');
      expect(queryString).toContain('value');
      expect(queryString).toContain('labels');
      expect(queryString).toContain('timestamp');
    });
  });

  describe('pushMetrics', () => {
    it('should push metrics and return success', async () => {
      const metricsPayload = {
        metrics: [
          { name: 'http_requests_total', value: 100, labels: { method: 'GET' } },
          { name: 'response_time_ms', value: 50, labels: { endpoint: '/api' } },
        ],
      };
      mockRequest.body = metricsPayload;
      mockPushMetrics.mockResolvedValue(undefined);

      const result = await metricsController.pushMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockPushMetrics).toHaveBeenCalledWith(metricsPayload);
      expect(result).toEqual({ success: true });
    });

    it('should handle single metric push', async () => {
      const singleMetric = { name: 'cpu_usage', value: 45.5 };
      mockRequest.body = singleMetric;
      mockPushMetrics.mockResolvedValue(undefined);

      const result = await metricsController.pushMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockPushMetrics).toHaveBeenCalledWith(singleMetric);
      expect(result).toEqual({ success: true });
    });

    it('should return 500 on push failure', async () => {
      mockRequest.body = { name: 'test_metric', value: 1 };
      mockPushMetrics.mockRejectedValue(new Error('Write failed'));

      await metricsController.pushMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to push metrics' });
    });
  });

  describe('exportPrometheusMetrics', () => {
    it('should return prometheus format metrics', async () => {
      const prometheusOutput = `# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1500
http_requests_total{method="POST",status="201"} 300`;
      mockRegisterMetrics.mockResolvedValue(prometheusOutput);

      const result = await metricsController.exportPrometheusMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRegisterMetrics).toHaveBeenCalledTimes(1);
      expect(mockReply.type).toHaveBeenCalledWith('text/plain');
      expect(result).toBe(prometheusOutput);
    });

    it('should set content type to text/plain', async () => {
      mockRegisterMetrics.mockResolvedValue('');

      await metricsController.exportPrometheusMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.type).toHaveBeenCalledWith('text/plain');
    });

    it('should return 500 on export failure', async () => {
      mockRegisterMetrics.mockRejectedValue(new Error('Registry error'));

      await metricsController.exportPrometheusMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to export metrics' });
    });
  });

  describe('getLatestMetrics', () => {
    it('should return latest value for each metric/service combination', async () => {
      const latestMetrics = {
        rows: [
          { metric_name: 'cpu_usage', service_name: 'auth-service', value: 45, timestamp: '2024-01-15T10:05:00Z' },
          { metric_name: 'cpu_usage', service_name: 'payment-service', value: 60, timestamp: '2024-01-15T10:05:00Z' },
          { metric_name: 'memory_usage', service_name: 'auth-service', value: 70, timestamp: '2024-01-15T10:05:00Z' },
        ],
      };
      mockQuery.mockResolvedValue(latestMetrics);

      const result = await metricsController.getLatestMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockQuery.mock.calls[0][0]).toContain('DISTINCT ON (metric_name, service_name)');
      expect(mockQuery.mock.calls[0][0]).toContain("INTERVAL '1 hour'");
      expect(result).toEqual(latestMetrics.rows);
    });

    it('should return empty array when no metrics in last hour', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await metricsController.getLatestMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(result).toEqual([]);
    });

    it('should return empty array on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const result = await metricsController.getLatestMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(result).toEqual([]);
    });
  });

  describe('getMetricsByService', () => {
    it('should return metrics for specific service', async () => {
      const serviceMetrics = {
        rows: [
          { metric_name: 'http_requests_total', service_name: 'payment-service', value: 500, timestamp: '2024-01-15T10:00:00Z' },
          { metric_name: 'response_time_ms', service_name: 'payment-service', value: 120, timestamp: '2024-01-15T10:00:00Z' },
        ],
      };
      mockRequest.params = { service: 'payment-service' };
      mockQuery.mockResolvedValue(serviceMetrics);

      const result = await metricsController.getMetricsByService(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE service_name = $1'),
        ['payment-service']
      );
      expect(result).toEqual(serviceMetrics.rows);
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      mockRequest.params = { service: "'; DROP TABLE metrics; --" };
      mockQuery.mockResolvedValue({ rows: [] });

      await metricsController.getMetricsByService(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      // Verify parameterized query is used (second argument is params array)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ["'; DROP TABLE metrics; --"]
      );
    });

    it('should limit results to 100 rows', async () => {
      mockRequest.params = { service: 'api-gateway' };
      mockQuery.mockResolvedValue({ rows: [] });

      await metricsController.getMetricsByService(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockQuery.mock.calls[0][0]).toContain('LIMIT 100');
    });

    it('should filter by last hour', async () => {
      mockRequest.params = { service: 'auth-service' };
      mockQuery.mockResolvedValue({ rows: [] });

      await metricsController.getMetricsByService(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockQuery.mock.calls[0][0]).toContain("INTERVAL '1 hour'");
    });

    it('should return empty array on database error', async () => {
      mockRequest.params = { service: 'error-service' };
      mockQuery.mockRejectedValue(new Error('Connection refused'));

      const result = await metricsController.getMetricsByService(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(result).toEqual([]);
    });

    it('should handle service names with hyphens', async () => {
      mockRequest.params = { service: 'blockchain-indexer' };
      mockQuery.mockResolvedValue({ rows: [{ service_name: 'blockchain-indexer' }] });

      const result = await metricsController.getMetricsByService(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['blockchain-indexer']
      );
      expect(result).toEqual([{ service_name: 'blockchain-indexer' }]);
    });
  });
});
