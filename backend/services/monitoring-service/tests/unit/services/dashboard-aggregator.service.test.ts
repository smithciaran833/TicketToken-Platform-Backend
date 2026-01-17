// Mock dependencies BEFORE imports
const mockPgQuery = jest.fn();
const mockRedisPing = jest.fn();
const mockGetMetricsAsJSON = jest.fn();
const mockGetActiveAlerts = jest.fn();

jest.mock('../../../src/utils/database', () => ({
  pgPool: { query: mockPgQuery },
  redisClient: { ping: mockRedisPing },
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
  register: {
    getMetricsAsJSON: mockGetMetricsAsJSON,
  },
}));

jest.mock('../../../src/services/health.service', () => ({
  healthService: {},
}));

jest.mock('../../../src/services/alert.service', () => ({
  alertService: {
    getActiveAlerts: mockGetActiveAlerts,
  },
}));

import { dashboardAggregatorService } from '../../../src/services/dashboard-aggregator.service';
import { logger } from '../../../src/utils/logger';

describe('DashboardAggregatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockRedisPing.mockResolvedValue('PONG');
    mockGetMetricsAsJSON.mockResolvedValue([]);
    mockGetActiveAlerts.mockResolvedValue([]);
  });

  describe('getSystemStatus', () => {
    it('should return complete system status', async () => {
      const mockMetrics = [
        { name: 'system_cpu_usage_percent', values: [{ value: 45.5 }] },
        { name: 'system_memory_usage_percent', values: [{ value: 60.2 }] },
        { name: 'process_resident_memory_bytes', values: [{ value: 104857600 }] }, // 100MB
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result).toEqual({
        timestamp: expect.any(Date),
        system: {
          cpu: '45.5%',
          memory: '60.2%',
          processMemory: '100.0 MB',
        },
        services: {},
        databases: {
          postgresql: true,
          redis: true,
          mongodb: false,
        },
        alerts: {
          total: 0,
          critical: 0,
          warning: 0,
        },
        servicesCount: {
          total: 0,
          up: 0,
          down: 0,
        },
      });
    });

    it('should extract service metrics correctly', async () => {
      const mockMetrics = [
        {
          name: 'service_up',
          values: [
            { value: 1, labels: { service: 'api-gateway', port: '3000' } },
            { value: 0, labels: { service: 'auth-service', port: '3001' } },
            { value: 1, labels: { service: 'payment-service', port: '3002' } },
          ],
        },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.services).toEqual({
        'api-gateway': { up: true, port: '3000' },
        'auth-service': { up: false, port: '3001' },
        'payment-service': { up: true, port: '3002' },
      });
      expect(result.servicesCount).toEqual({
        total: 3,
        up: 2,
        down: 1,
      });
    });

    it('should handle missing port label', async () => {
      const mockMetrics = [
        {
          name: 'service_up',
          values: [{ value: 1, labels: { service: 'test-service' } }],
        },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.services['test-service'].port).toBe('unknown');
    });

    it('should handle PostgreSQL connection failure', async () => {
      mockPgQuery.mockRejectedValue(new Error('Connection refused'));

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.databases.postgresql).toBe(false);
    });

    it('should handle Redis connection failure', async () => {
      mockRedisPing.mockRejectedValue(new Error('Redis unavailable'));

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.databases.redis).toBe(false);
    });

    it('should count alerts by severity', async () => {
      mockGetActiveAlerts.mockResolvedValue([
        { id: '1', severity: 'critical' },
        { id: '2', severity: 'critical' },
        { id: '3', severity: 'warning' },
        { id: '4', severity: 'info' },
      ]);

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.alerts).toEqual({
        total: 4,
        critical: 2,
        warning: 1,
      });
    });

    it('should handle alert service failure gracefully', async () => {
      mockGetActiveAlerts.mockRejectedValue(new Error('Alert service down'));

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.alerts).toEqual({
        total: 0,
        critical: 0,
        warning: 0,
      });
    });

    it('should handle missing metric values', async () => {
      const mockMetrics = [
        { name: 'system_cpu_usage_percent', values: [] },
        { name: 'system_memory_usage_percent', values: [{}] },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getSystemStatus();

      // toFixed(1) always produces one decimal place
      expect(result.system.cpu).toBe('0.0%');
      expect(result.system.memory).toBe('0.0%');
    });

    it('should handle empty metrics array', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([]);

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.system).toEqual({
        cpu: '0%',
        memory: '0%',
        processMemory: '0 MB',
      });
    });

    it('should convert process memory from bytes to MB', async () => {
      const mockMetrics = [
        { name: 'process_resident_memory_bytes', values: [{ value: 524288000 }] }, // 500MB
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getSystemStatus();

      expect(result.system.processMemory).toBe('500.0 MB');
    });

    it('should throw and log error on critical failure', async () => {
      mockGetMetricsAsJSON.mockRejectedValue(new Error('Prometheus unavailable'));

      await expect(dashboardAggregatorService.getSystemStatus()).rejects.toThrow('Prometheus unavailable');
      expect(logger.error).toHaveBeenCalledWith(
        'Error aggregating dashboard data:',
        expect.any(Error)
      );
    });
  });

  describe('getMetricsSummary', () => {
    it('should categorize metrics correctly', async () => {
      const mockMetrics = [
        { name: 'system_cpu_usage', type: 'gauge', values: [{ value: 45 }], help: 'CPU usage' },
        { name: 'system_memory_usage', type: 'gauge', values: [{ value: 60 }], help: 'Memory usage' },
        { name: 'service_requests_total', type: 'counter', values: [{ value: 1000 }], help: 'Total requests' },
        { name: 'http_request_duration', type: 'histogram', values: [{ value: 0.5 }], help: 'Request duration' },
        { name: 'postgres_connections', type: 'gauge', values: [{ value: 10 }], help: 'DB connections' },
        { name: 'redis_memory_used', type: 'gauge', values: [{ value: 1024 }], help: 'Redis memory' },
        { name: 'business_revenue_total', type: 'counter', values: [{ value: 50000 }], help: 'Revenue' },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getMetricsSummary();

      expect(result.categories.system).toHaveLength(2);
      expect(result.categories.services).toHaveLength(2);
      expect(result.categories.database).toHaveLength(2);
      expect(result.categories.business).toHaveLength(1);
    });

    it('should include timestamp', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([]);

      const result = await dashboardAggregatorService.getMetricsSummary();

      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should extract metric details correctly', async () => {
      const mockMetrics = [
        { name: 'system_test', type: 'gauge', values: [{ value: 42 }], help: 'Test metric' },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getMetricsSummary();

      expect(result.categories.system[0]).toEqual({
        name: 'system_test',
        type: 'gauge',
        value: 42,
        help: 'Test metric',
      });
    });

    it('should handle metrics with mongo prefix', async () => {
      const mockMetrics = [
        { name: 'mongodb_connections', type: 'gauge', values: [{ value: 5 }], help: 'Mongo connections' },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getMetricsSummary();

      expect(result.categories.database).toHaveLength(1);
    });

    it('should return empty categories when no metrics', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([]);

      const result = await dashboardAggregatorService.getMetricsSummary();

      expect(result.categories).toEqual({
        system: [],
        services: [],
        database: [],
        business: [],
      });
    });

    it('should handle metrics with empty values array', async () => {
      const mockMetrics = [
        { name: 'system_empty', type: 'gauge', values: [], help: 'Empty metric' },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getMetricsSummary();

      expect(result.categories.system[0].value).toBeUndefined();
    });

    it('should throw and log error on failure', async () => {
      mockGetMetricsAsJSON.mockRejectedValue(new Error('Metrics fetch failed'));

      await expect(dashboardAggregatorService.getMetricsSummary()).rejects.toThrow('Metrics fetch failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting metrics summary:',
        expect.any(Error)
      );
    });

    it('should not categorize uncategorized metrics', async () => {
      const mockMetrics = [
        { name: 'random_metric', type: 'gauge', values: [{ value: 1 }], help: 'Random' },
      ];
      mockGetMetricsAsJSON.mockResolvedValue(mockMetrics);

      const result = await dashboardAggregatorService.getMetricsSummary();

      expect(result.categories.system).toHaveLength(0);
      expect(result.categories.services).toHaveLength(0);
      expect(result.categories.database).toHaveLength(0);
      expect(result.categories.business).toHaveLength(0);
    });
  });

  describe('exported instance', () => {
    it('should export dashboardAggregatorService as singleton', () => {
      const { dashboardAggregatorService: exported1 } = require('../../../src/services/dashboard-aggregator.service');
      const { dashboardAggregatorService: exported2 } = require('../../../src/services/dashboard-aggregator.service');
      expect(exported1).toBe(exported2);
    });
  });
});
