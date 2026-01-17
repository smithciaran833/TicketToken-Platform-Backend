// Mock dependencies BEFORE imports
const mockPgQuery = jest.fn();
const mockGetOverallHealth = jest.fn();
const mockGetActiveAlerts = jest.fn();

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

jest.mock('../../../src/services/health.service', () => ({
  healthService: {
    getOverallHealth: mockGetOverallHealth,
  },
}));

jest.mock('../../../src/services/alert.service', () => ({
  alertService: {
    getActiveAlerts: mockGetActiveAlerts,
  },
}));

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {},
}));

import { dashboardService } from '../../../src/services/dashboard.service';
import { logger } from '../../../src/utils/logger';

describe('DashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue({ rows: [] });
    mockGetOverallHealth.mockResolvedValue({ status: 'healthy' });
    mockGetActiveAlerts.mockResolvedValue([]);
  });

  describe('getOverview', () => {
    it('should return complete dashboard overview', async () => {
      const mockHealth = { status: 'healthy', uptime: 86400 };
      const mockAlerts = [
        { id: '1', severity: 'critical', title: 'CPU High' },
        { id: '2', severity: 'warning', title: 'Memory Warning' },
        { id: '3', severity: 'warning', title: 'Disk Space' },
      ];
      const mockMetrics = [
        { metric_name: 'cpu_usage', service_name: 'api', avg_value: 45 },
      ];

      mockGetOverallHealth.mockResolvedValue(mockHealth);
      mockGetActiveAlerts.mockResolvedValue(mockAlerts);
      mockPgQuery.mockResolvedValue({ rows: mockMetrics });

      const result = await dashboardService.getOverview();

      expect(result).toEqual({
        health: mockHealth,
        alerts: {
          total: 3,
          critical: 1,
          warning: 2,
        },
        metrics: mockMetrics,
        timestamp: expect.any(Date),
      });
    });

    it('should call all services in parallel', async () => {
      await dashboardService.getOverview();

      expect(mockGetOverallHealth).toHaveBeenCalledTimes(1);
      expect(mockGetActiveAlerts).toHaveBeenCalledTimes(1);
      expect(mockPgQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle zero alerts', async () => {
      mockGetActiveAlerts.mockResolvedValue([]);

      const result = await dashboardService.getOverview();

      expect(result.alerts).toEqual({
        total: 0,
        critical: 0,
        warning: 0,
      });
    });

    it('should handle only critical alerts', async () => {
      mockGetActiveAlerts.mockResolvedValue([
        { id: '1', severity: 'critical' },
        { id: '2', severity: 'critical' },
      ]);

      const result = await dashboardService.getOverview();

      expect(result.alerts).toEqual({
        total: 2,
        critical: 2,
        warning: 0,
      });
    });

    it('should handle info severity alerts (not counted as critical/warning)', async () => {
      mockGetActiveAlerts.mockResolvedValue([
        { id: '1', severity: 'info' },
        { id: '2', severity: 'critical' },
      ]);

      const result = await dashboardService.getOverview();

      expect(result.alerts).toEqual({
        total: 2,
        critical: 1,
        warning: 0,
      });
    });

    it('should throw and log error when health service fails', async () => {
      const healthError = new Error('Health check failed');
      mockGetOverallHealth.mockRejectedValue(healthError);

      await expect(dashboardService.getOverview()).rejects.toThrow('Health check failed');
      expect(logger.error).toHaveBeenCalledWith('Error getting dashboard overview:', healthError);
    });

    it('should throw and log error when alert service fails', async () => {
      const alertError = new Error('Alert service unavailable');
      mockGetActiveAlerts.mockRejectedValue(alertError);

      await expect(dashboardService.getOverview()).rejects.toThrow('Alert service unavailable');
      expect(logger.error).toHaveBeenCalledWith('Error getting dashboard overview:', alertError);
    });

    it('should throw and log error when metrics query fails', async () => {
      const dbError = new Error('Database connection lost');
      mockPgQuery.mockRejectedValue(dbError);

      await expect(dashboardService.getOverview()).rejects.toThrow('Database connection lost');
      expect(logger.error).toHaveBeenCalledWith('Error getting dashboard overview:', dbError);
    });
  });

  describe('getSLAMetrics', () => {
    it('should return SLA metrics grouped by service', async () => {
      const mockSLAData = [
        { service_name: 'api', avg_uptime: 99.9, avg_p95_latency: 150, total_violations: 2 },
        { service_name: 'auth', avg_uptime: 99.5, avg_p95_latency: 200, total_violations: 5 },
      ];
      mockPgQuery.mockResolvedValue({ rows: mockSLAData });

      const result = await dashboardService.getSLAMetrics({});

      expect(result).toEqual({
        services: mockSLAData,
        period: '30d',
        timestamp: expect.any(Date),
      });
    });

    it('should use provided start_date parameter', async () => {
      const startDate = new Date('2024-01-01');
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getSLAMetrics({ start_date: startDate });

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining('period_start >= $1'),
        [startDate]
      );
    });

    it('should use default 30 days when start_date not provided', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getSLAMetrics({});

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.any(String),
        [expect.any(Date)]
      );
    });

    it('should use provided period parameter', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      const result = await dashboardService.getSLAMetrics({ period: '7d' });

      expect(result.period).toBe('7d');
    });

    it('should return empty services array when no data', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      const result = await dashboardService.getSLAMetrics({});

      expect(result.services).toEqual([]);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Query timeout');
      mockPgQuery.mockRejectedValue(dbError);

      await expect(dashboardService.getSLAMetrics({})).rejects.toThrow('Query timeout');
      expect(logger.error).toHaveBeenCalledWith('Error getting SLA metrics:', dbError);
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return performance metrics with percentiles', async () => {
      const mockPerfData = [
        {
          service_name: 'api',
          endpoint: '/users',
          avg_response_time: 45.5,
          p95: 120,
          p99: 250,
          request_count: 10000,
        },
      ];
      mockPgQuery.mockResolvedValue({ rows: mockPerfData });

      const result = await dashboardService.getPerformanceMetrics({});

      expect(result).toEqual({
        endpoints: mockPerfData,
        timestamp: expect.any(Date),
      });
    });

    it('should query last hour of data', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getPerformanceMetrics({});

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 hour'")
      );
    });

    it('should order by request_count DESC', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getPerformanceMetrics({});

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY request_count DESC')
      );
    });

    it('should limit to 20 results', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getPerformanceMetrics({});

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 20')
      );
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Database error');
      mockPgQuery.mockRejectedValue(dbError);

      await expect(dashboardService.getPerformanceMetrics({})).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error getting performance metrics:', dbError);
    });
  });

  describe('getBusinessMetrics', () => {
    it('should return business metrics structure', async () => {
      const result = await dashboardService.getBusinessMetrics({});

      expect(result).toEqual({
        revenue: {
          today: 0,
          week: 0,
          month: 0,
        },
        tickets: {
          sold_today: 0,
          active_events: 0,
        },
        venues: {
          active: 0,
          total: 0,
        },
        timestamp: expect.any(Date),
      });
    });

    it('should include timestamp', async () => {
      const result = await dashboardService.getBusinessMetrics({});

      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should handle params gracefully', async () => {
      const result = await dashboardService.getBusinessMetrics({
        start_date: new Date(),
        end_date: new Date(),
      });

      expect(result).toBeDefined();
      expect(result.revenue).toBeDefined();
    });
  });

  describe('getIncidents', () => {
    it('should return non-closed incidents', async () => {
      const mockIncidents = [
        { id: '1', status: 'open', severity: 'critical', detected_at: new Date() },
        { id: '2', status: 'investigating', severity: 'warning', detected_at: new Date() },
      ];
      mockPgQuery.mockResolvedValue({ rows: mockIncidents });

      const result = await dashboardService.getIncidents({});

      expect(result).toEqual({
        incidents: mockIncidents,
        timestamp: expect.any(Date),
      });
    });

    it('should filter out closed incidents', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getIncidents({});

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining("status != 'closed'")
      );
    });

    it('should order by severity and detected_at', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getIncidents({});

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY severity, detected_at DESC')
      );
    });

    it('should limit to 10 incidents', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      await dashboardService.getIncidents({});

      expect(mockPgQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10')
      );
    });

    it('should return empty incidents array when none exist', async () => {
      mockPgQuery.mockResolvedValue({ rows: [] });

      const result = await dashboardService.getIncidents({});

      expect(result.incidents).toEqual([]);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Incidents query failed');
      mockPgQuery.mockRejectedValue(dbError);

      await expect(dashboardService.getIncidents({})).rejects.toThrow('Incidents query failed');
      expect(logger.error).toHaveBeenCalledWith('Error getting incidents:', dbError);
    });
  });

  describe('exported instance', () => {
    it('should export dashboardService as singleton', () => {
      const { dashboardService: exported1 } = require('../../../src/services/dashboard.service');
      const { dashboardService: exported2 } = require('../../../src/services/dashboard.service');
      expect(exported1).toBe(exported2);
    });
  });
});
