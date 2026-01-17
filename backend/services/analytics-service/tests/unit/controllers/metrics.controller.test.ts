/**
 * Metrics Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies BEFORE any imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Create mock instances
const mockMetricsServiceInstance = {
  recordMetric: jest.fn(),
  bulkRecordMetrics: jest.fn(),
  getMetrics: jest.fn(),
  getRealTimeMetrics: jest.fn(),
};

const mockAggregationServiceInstance = {
  aggregateMetrics: jest.fn(),
  getComparativeMetrics: jest.fn(),
};

jest.mock('../../../src/services', () => ({
  MetricsService: {
    getInstance: jest.fn(() => mockMetricsServiceInstance),
  },
  AggregationService: {
    getInstance: jest.fn(() => mockAggregationServiceInstance),
  },
}));

// NOW import the controller (after mocks are set up)
import { metricsController } from '../../../src/controllers/metrics.controller';

describe('MetricsController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      query: {},
      body: {},
      params: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Set up default mock responses
    mockMetricsServiceInstance.recordMetric.mockResolvedValue({
      id: 'metric-123',
      venueId: 'venue-123',
      metricType: 'REVENUE',
      value: 1000,
    });

    mockMetricsServiceInstance.bulkRecordMetrics.mockResolvedValue(undefined);

    mockMetricsServiceInstance.getMetrics.mockResolvedValue([
      { timestamp: new Date(), value: 100 },
      { timestamp: new Date(), value: 200 },
    ]);

    mockMetricsServiceInstance.getRealTimeMetrics.mockResolvedValue({
      revenue: 5000,
      sales: 100,
      traffic: 1000,
    });

    mockAggregationServiceInstance.aggregateMetrics.mockResolvedValue({
      summary: { total: 1000, average: 100 },
      timeSeries: [],
    });

    mockAggregationServiceInstance.getComparativeMetrics.mockResolvedValue({
      current: { total: 1000 },
      previous: { total: 800 },
      change: { absolute: 200, percentage: 25 },
    });
  });

  describe('recordMetric', () => {
    it('should record a single metric', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        metricType: 'REVENUE',
        value: 1000,
        dimensions: { channel: 'online' },
        metadata: { orderId: 'order-123' },
      };

      await metricsController.recordMetric(mockRequest, mockReply);

      expect(mockMetricsServiceInstance.recordMetric).toHaveBeenCalledWith(
        'venue-123',
        'REVENUE',
        1000,
        { channel: 'online' },
        { orderId: 'order-123' }
      );

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          metric: expect.any(Object),
        }),
      });
    });

    it('should handle metric without dimensions', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        metricType: 'SALES',
        value: 50,
      };

      await metricsController.recordMetric(mockRequest, mockReply);

      expect(mockMetricsServiceInstance.recordMetric).toHaveBeenCalledWith(
        'venue-123',
        'SALES',
        50,
        undefined,
        undefined
      );
    });

    it('should handle errors', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        metricType: 'REVENUE',
        value: 1000,
      };

      mockMetricsServiceInstance.recordMetric.mockRejectedValue(new Error('Database error'));

      await metricsController.recordMetric(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Database error',
        }),
      });
    });
  });

  describe('bulkRecordMetrics', () => {
    it('should record multiple metrics', async () => {
      mockRequest.body = {
        metrics: [
          { venueId: 'venue-123', metricType: 'REVENUE', value: 1000 },
          { venueId: 'venue-123', metricType: 'SALES', value: 10 },
        ],
      };

      await metricsController.bulkRecordMetrics(mockRequest, mockReply);

      expect(mockMetricsServiceInstance.bulkRecordMetrics).toHaveBeenCalledWith([
        { venueId: 'venue-123', metricType: 'REVENUE', value: 1000, dimensions: undefined, metadata: undefined },
        { venueId: 'venue-123', metricType: 'SALES', value: 10, dimensions: undefined, metadata: undefined },
      ]);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Metrics recorded',
          recorded: 2,
        },
      });
    });

    it('should handle empty metrics array', async () => {
      mockRequest.body = { metrics: [] };

      await metricsController.bulkRecordMetrics(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Metrics recorded',
          recorded: 0,
        },
      });
    });
  });

  describe('getMetrics', () => {
    it('should get metrics for a venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        metricType: 'REVENUE',
      };

      await metricsController.getMetrics(mockRequest, mockReply);

      expect(mockMetricsServiceInstance.getMetrics).toHaveBeenCalledWith(
        'venue-123',
        'REVENUE',
        {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        },
        undefined
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          metrics: expect.any(Array),
        },
      });
    });

    it('should parse granularity parameter', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        metricType: 'REVENUE',
        granularity: 'hour-1',
      };

      await metricsController.getMetrics(mockRequest, mockReply);

      expect(mockMetricsServiceInstance.getMetrics).toHaveBeenCalledWith(
        'venue-123',
        'REVENUE',
        expect.any(Object),
        { unit: 'hour', value: 1 }
      );
    });
  });

  describe('getRealTimeMetrics', () => {
    it('should get real-time metrics', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await metricsController.getRealTimeMetrics(mockRequest, mockReply);

      expect(mockMetricsServiceInstance.getRealTimeMetrics).toHaveBeenCalledWith('venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          metrics: expect.objectContaining({
            revenue: 5000,
            sales: 100,
          }),
        },
      });
    });
  });

  describe('getAggregatedMetric', () => {
    it('should return aggregated metric value', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        metricType: 'REVENUE',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        aggregation: 'sum',
      };

      await metricsController.getAggregatedMetric(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          value: 1000,
        },
      });
    });

    it('should handle missing summary', async () => {
      mockAggregationServiceInstance.aggregateMetrics.mockResolvedValue({
        summary: null,
      });

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        metricType: 'REVENUE',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        aggregation: 'sum',
      };

      await metricsController.getAggregatedMetric(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          value: 0,
        },
      });
    });
  });
});
