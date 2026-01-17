// Mock dependencies BEFORE imports
const mockGetOverview = jest.fn();
const mockGetSLAMetrics = jest.fn();
const mockGetPerformanceMetrics = jest.fn();
const mockGetBusinessMetrics = jest.fn();
const mockGetIncidents = jest.fn();

jest.mock('../../../src/services/dashboard.service', () => ({
  dashboardService: {
    getOverview: mockGetOverview,
    getSLAMetrics: mockGetSLAMetrics,
    getPerformanceMetrics: mockGetPerformanceMetrics,
    getBusinessMetrics: mockGetBusinessMetrics,
    getIncidents: mockGetIncidents,
  },
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { dashboardController } from '../../../src/controllers/dashboard.controller';

describe('DashboardController', () => {
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
    };
  });

  describe('getOverview', () => {
    it('should return complete dashboard overview', async () => {
      const mockOverview = {
        systemHealth: 'healthy',
        activeAlerts: 3,
        totalServices: 12,
        uptime: 99.95,
        responseTime: { avg: 45, p95: 120, p99: 250 },
        requestsPerMinute: 1500,
        errorRate: 0.02,
      };
      mockGetOverview.mockResolvedValue(mockOverview);

      await dashboardController.getOverview(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetOverview).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith(mockOverview);
    });

    it('should handle partial overview data', async () => {
      const partialOverview = { systemHealth: 'degraded', activeAlerts: 5 };
      mockGetOverview.mockResolvedValue(partialOverview);

      await dashboardController.getOverview(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith(partialOverview);
    });

    it('should return 500 on service error', async () => {
      mockGetOverview.mockRejectedValue(new Error('Overview aggregation failed'));

      await dashboardController.getOverview(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('getSLAMetrics', () => {
    it('should return SLA metrics with query filters', async () => {
      const queryParams = { service: 'payment-service', period: '30d' };
      const mockSLA = {
        availability: 99.99,
        targetAvailability: 99.95,
        breaches: 0,
        mttr: 15,
        mtbf: 720,
        complianceStatus: 'compliant',
      };
      mockRequest.query = queryParams;
      mockGetSLAMetrics.mockResolvedValue(mockSLA);

      await dashboardController.getSLAMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetSLAMetrics).toHaveBeenCalledWith(queryParams);
      expect(mockReply.send).toHaveBeenCalledWith(mockSLA);
    });

    it('should handle empty query params', async () => {
      mockRequest.query = {};
      mockGetSLAMetrics.mockResolvedValue({ availability: 99.5 });

      await dashboardController.getSLAMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetSLAMetrics).toHaveBeenCalledWith({});
    });

    it('should pass time range filters correctly', async () => {
      const queryParams = { startDate: '2024-01-01', endDate: '2024-01-31' };
      mockRequest.query = queryParams;
      mockGetSLAMetrics.mockResolvedValue({});

      await dashboardController.getSLAMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetSLAMetrics).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 on service error', async () => {
      mockGetSLAMetrics.mockRejectedValue(new Error('SLA calculation failed'));

      await dashboardController.getSLAMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return performance metrics with service filter', async () => {
      const queryParams = { service: 'api-gateway', granularity: '1m' };
      const mockPerformance = {
        latency: { avg: 45, p50: 35, p95: 120, p99: 250 },
        throughput: 1500,
        errorRate: 0.01,
        saturation: { cpu: 45, memory: 60, connections: 200 },
        trends: { latencyTrend: 'stable', throughputTrend: 'increasing' },
      };
      mockRequest.query = queryParams;
      mockGetPerformanceMetrics.mockResolvedValue(mockPerformance);

      await dashboardController.getPerformanceMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetPerformanceMetrics).toHaveBeenCalledWith(queryParams);
      expect(mockReply.send).toHaveBeenCalledWith(mockPerformance);
    });

    it('should handle granularity options', async () => {
      const granularities = ['1m', '5m', '1h', '1d'];
      
      for (const granularity of granularities) {
        mockRequest.query = { granularity };
        mockGetPerformanceMetrics.mockResolvedValue({ granularity });

        await dashboardController.getPerformanceMetrics(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockGetPerformanceMetrics).toHaveBeenCalledWith({ granularity });
      }
    });

    it('should return 500 on service error', async () => {
      mockGetPerformanceMetrics.mockRejectedValue(new Error('Metrics aggregation timeout'));

      await dashboardController.getPerformanceMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getBusinessMetrics', () => {
    it('should return business metrics with date range', async () => {
      const queryParams = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const mockBusiness = {
        revenue: { total: 150000, daily: 5000, growth: 12.5 },
        transactions: { total: 3500, successful: 3450, failed: 50 },
        users: { active: 1200, new: 150, churn: 0.02 },
        conversion: { rate: 3.5, funnel: { views: 10000, carts: 1500, purchases: 350 } },
      };
      mockRequest.query = queryParams;
      mockGetBusinessMetrics.mockResolvedValue(mockBusiness);

      await dashboardController.getBusinessMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetBusinessMetrics).toHaveBeenCalledWith(queryParams);
      expect(mockReply.send).toHaveBeenCalledWith(mockBusiness);
    });

    it('should handle category filters', async () => {
      const queryParams = { category: 'revenue', period: '7d' };
      mockRequest.query = queryParams;
      mockGetBusinessMetrics.mockResolvedValue({ revenue: { total: 35000 } });

      await dashboardController.getBusinessMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetBusinessMetrics).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 on service error', async () => {
      mockGetBusinessMetrics.mockRejectedValue(new Error('Business metrics unavailable'));

      await dashboardController.getBusinessMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getIncidents', () => {
    it('should return incidents list with filters', async () => {
      const queryParams = { status: 'open', severity: 'critical' };
      const mockIncidents = [
        { id: 'inc-1', title: 'Database slowdown', severity: 'critical', status: 'open', startedAt: '2024-01-15T10:00:00Z' },
        { id: 'inc-2', title: 'API errors spike', severity: 'critical', status: 'open', startedAt: '2024-01-15T11:00:00Z' },
      ];
      mockRequest.query = queryParams;
      mockGetIncidents.mockResolvedValue(mockIncidents);

      await dashboardController.getIncidents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetIncidents).toHaveBeenCalledWith(queryParams);
      expect(mockReply.send).toHaveBeenCalledWith(mockIncidents);
    });

    it('should return empty array when no incidents', async () => {
      mockRequest.query = { status: 'resolved' };
      mockGetIncidents.mockResolvedValue([]);

      await dashboardController.getIncidents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith([]);
    });

    it('should handle pagination params', async () => {
      const queryParams = { page: 2, limit: 10, sortBy: 'severity' };
      mockRequest.query = queryParams;
      mockGetIncidents.mockResolvedValue([]);

      await dashboardController.getIncidents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetIncidents).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 on service error', async () => {
      mockGetIncidents.mockRejectedValue(new Error('Incidents query failed'));

      await dashboardController.getIncidents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});
