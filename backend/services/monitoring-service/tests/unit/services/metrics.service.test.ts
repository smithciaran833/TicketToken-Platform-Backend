// Mock dependencies BEFORE imports
const mockPgQuery = jest.fn();
const mockRegister = {
  metrics: jest.fn(),
  contentType: 'text/plain',
};
const mockKafkaSendMetric = jest.fn();

jest.mock('../../../src/utils/database', () => ({
  pgPool: { query: mockPgQuery },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('prom-client', () => ({
  register: mockRegister,
  collectDefaultMetrics: jest.fn(),
  Counter: jest.fn(),
  Histogram: jest.fn(),
  Gauge: jest.fn(),
}));

jest.mock('../../../src/streaming/kafka-producer', () => ({
  kafkaProducer: { sendMetric: mockKafkaSendMetric },
}));

import { metricsService, streamMetricToKafka } from '../../../src/services/metrics.service';
import { logger } from '../../../src/utils/logger';

describe('MetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue({ rows: [] });
    mockKafkaSendMetric.mockResolvedValue(undefined);
  });

  describe('pushMetrics', () => {
    it('should insert metric with all fields', async () => {
      const metricData = {
        metric_name: 'http_requests_total',
        service_name: 'api-gateway',
        value: 1000,
        type: 'counter',
        labels: { method: 'GET', path: '/api/users' },
      };

      await metricsService.pushMetrics(metricData);

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO metrics'),
        [
          'http_requests_total',
          'api-gateway',
          1000,
          'counter',
          JSON.stringify({ method: 'GET', path: '/api/users' }),
        ]
      );
    });

    it('should use default metric_name "unknown" when not provided', async () => {
      await metricsService.pushMetrics({ value: 100 });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['unknown'])
      );
    });

    it('should accept "name" as alternative to "metric_name"', async () => {
      await metricsService.pushMetrics({ name: 'custom_metric', value: 50 });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['custom_metric'])
      );
    });

    it('should use default service_name "monitoring-service" when not provided', async () => {
      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['monitoring-service'])
      );
    });

    it('should use default value 0 when not provided', async () => {
      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0])
      );
    });

    it('should use default type "gauge" when not provided', async () => {
      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['gauge'])
      );
    });

    it('should accept "metric_type" as alternative to "type"', async () => {
      await metricsService.pushMetrics({ metric_name: 'test', metric_type: 'histogram' });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['histogram'])
      );
    });

    it('should use empty object for labels when not provided', async () => {
      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['{}'])
      );
    });

    it('should stringify labels object', async () => {
      const labels = { region: 'us-east-1', environment: 'production' };
      await metricsService.pushMetrics({ metric_name: 'test', labels });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(labels)])
      );
    });

    it('should log debug message on successful insert', async () => {
      await metricsService.pushMetrics({ metric_name: 'test_metric', value: 42 });

      expect(logger.debug).toHaveBeenCalledWith('Stored metric: test_metric = 42');
    });

    it('should log PostgreSQL errors', async () => {
      const pgError = new Error('Connection pool exhausted');
      mockPgQuery.mockRejectedValue(pgError);

      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(logger.error).toHaveBeenCalledWith(
        'Error pushing metrics to PostgreSQL:',
        'Connection pool exhausted'
      );
    });

    it('should NOT log InfluxDB errors', async () => {
      const influxError = new Error('InfluxDB write failed');
      mockPgQuery.mockRejectedValue(influxError);

      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should NOT log unauthorized errors', async () => {
      const authError = new Error('unauthorized access');
      mockPgQuery.mockRejectedValue(authError);

      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects in catch block', async () => {
      mockPgQuery.mockRejectedValue('String error');

      await metricsService.pushMetrics({ metric_name: 'test' });

      expect(logger.error).toHaveBeenCalledWith(
        'Error pushing metrics to PostgreSQL:',
        'String error'
      );
    });

    it('should not throw errors - fail silently', async () => {
      mockPgQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        metricsService.pushMetrics({ metric_name: 'test' })
      ).resolves.toBeUndefined();
    });

    it('should handle numeric values correctly', async () => {
      await metricsService.pushMetrics({ metric_name: 'test', value: 0.12345 });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0.12345])
      );
    });

    it('should handle negative values', async () => {
      await metricsService.pushMetrics({ metric_name: 'test', value: -100 });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([-100])
      );
    });

    it('should handle complex labels with special characters', async () => {
      const complexLabels = {
        path: '/api/v1/users/:id',
        query: 'SELECT * FROM users WHERE name = "test"',
        unicode: '日本語',
      };
      await metricsService.pushMetrics({ metric_name: 'test', labels: complexLabels });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(complexLabels)])
      );
    });
  });

  describe('queryMetrics', () => {
    it('should execute query and return rows', async () => {
      const mockRows = [
        { metric_name: 'cpu_usage', value: 75 },
        { metric_name: 'memory_usage', value: 60 },
      ];
      mockPgQuery.mockResolvedValue({ rows: mockRows });

      const result = await metricsService.queryMetrics('SELECT * FROM metrics');

      expect(mockPgQuery).toHaveBeenCalledWith('SELECT * FROM metrics');
      expect(result).toEqual(mockRows);
    });

    it('should return empty array when no results', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      const result = await metricsService.queryMetrics('SELECT * FROM metrics WHERE 1=0');

      expect(result).toEqual([]);
    });

    it('should return empty array on query error', async () => {
      mockPgQuery.mockRejectedValue(new Error('Query syntax error'));

      const result = await metricsService.queryMetrics('INVALID SQL');

      expect(result).toEqual([]);
    });

    it('should log error on query failure', async () => {
      const queryError = new Error('Query execution failed');
      mockPgQuery.mockRejectedValue(queryError);

      await metricsService.queryMetrics('SELECT * FROM metrics');

      expect(logger.error).toHaveBeenCalledWith('Error querying metrics:', queryError);
    });

    it('should handle complex queries', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      const complexQuery = `
        SELECT metric_name, AVG(value) as avg_value
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '1 hour'
        GROUP BY metric_name
        ORDER BY avg_value DESC
        LIMIT 10
      `;

      await metricsService.queryMetrics(complexQuery);

      expect(mockPgQuery).toHaveBeenCalledWith(complexQuery);
    });

    it('should not throw errors - return empty array instead', async () => {
      mockPgQuery.mockRejectedValue(new Error('Connection lost'));

      await expect(
        metricsService.queryMetrics('SELECT 1')
      ).resolves.toEqual([]);
    });
  });

  describe('getPrometheusRegistry', () => {
    it('should return the prometheus register', () => {
      const registry = metricsService.getPrometheusRegistry();

      expect(registry).toBe(mockRegister);
    });

    it('should return same registry instance on multiple calls', () => {
      const registry1 = metricsService.getPrometheusRegistry();
      const registry2 = metricsService.getPrometheusRegistry();

      expect(registry1).toBe(registry2);
    });
  });

  describe('streamMetricToKafka', () => {
    it('should send metric to Kafka producer', async () => {
      const metric = {
        name: 'http_requests',
        value: 100,
        timestamp: Date.now(),
      };

      await streamMetricToKafka(metric);

      expect(mockKafkaSendMetric).toHaveBeenCalledWith(metric);
    });

    it('should handle Kafka producer errors', async () => {
      const kafkaError = new Error('Kafka broker unavailable');
      mockKafkaSendMetric.mockRejectedValue(kafkaError);

      await expect(
        streamMetricToKafka({ name: 'test' })
      ).rejects.toThrow('Kafka broker unavailable');
    });

    it('should pass through complex metric objects', async () => {
      const complexMetric = {
        name: 'complex_metric',
        value: 123.456,
        labels: { service: 'api', region: 'us-east' },
        timestamp: 1704067200000,
        metadata: { source: 'collector', version: '1.0' },
      };

      await streamMetricToKafka(complexMetric);

      expect(mockKafkaSendMetric).toHaveBeenCalledWith(complexMetric);
    });
  });

  describe('exported instance', () => {
    it('should export metricsService as singleton', () => {
      const { metricsService: exported1 } = require('../../../src/services/metrics.service');
      const { metricsService: exported2 } = require('../../../src/services/metrics.service');
      expect(exported1).toBe(exported2);
    });
  });
});
