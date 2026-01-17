/**
 * AggregationService Unit Tests
 */

// Mock dependencies
const mockAggregationModel = {
  upsertAggregation: jest.fn(),
};

const mockMetricModel = {
  getMetrics: jest.fn(),
};

const mockCacheModel = {
  get: jest.fn(),
  set: jest.fn(),
  getCacheKey: jest.fn((...args) => args.join(':')),
};

jest.mock('../../../src/models', () => ({
  AggregationModel: mockAggregationModel,
  MetricModel: mockMetricModel,
  CacheModel: mockCacheModel,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/config/constants', () => ({
  CONSTANTS: {
    CACHE_TTL: {
      METRICS: 300,
      INSIGHTS: 600,
    },
  },
}));

import { AggregationService, aggregationService } from '../../../src/services/aggregation.service';
import { MetricType } from '../../../src/types';

describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = AggregationService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AggregationService.getInstance();
      const instance2 = AggregationService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should export singleton as aggregationService', () => {
      expect(aggregationService).toBe(AggregationService.getInstance());
    });
  });

  describe('aggregateMetrics', () => {
    const venueId = 'venue-123';
    const metricType = 'revenue' as MetricType;
    const dateRange = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };
    const granularity = { unit: 'day' as const, value: 1 };

    it('should return cached aggregation if available', async () => {
      const cachedAggregation = {
        metricType,
        period: dateRange,
        granularity,
        data: [{ timestamp: new Date(), value: 100 }],
        summary: { total: 100, average: 100, min: 100, max: 100, trend: 0 },
      };
      mockCacheModel.get.mockResolvedValue(cachedAggregation);

      const result = await service.aggregateMetrics(
        venueId,
        metricType,
        dateRange,
        granularity
      );

      expect(result).toEqual(cachedAggregation);
      expect(mockMetricModel.getMetrics).not.toHaveBeenCalled();
    });

    it('should fetch and aggregate metrics when not cached', async () => {
      const metrics = [
        { timestamp: new Date('2024-01-01'), value: 100 },
        { timestamp: new Date('2024-01-02'), value: 150 },
        { timestamp: new Date('2024-01-03'), value: 200 },
      ];
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue(metrics);
      mockAggregationModel.upsertAggregation.mockResolvedValue(undefined);
      mockCacheModel.set.mockResolvedValue(undefined);

      const result = await service.aggregateMetrics(
        venueId,
        metricType,
        dateRange,
        granularity
      );

      expect(result.metricType).toBe(metricType);
      expect(result.period).toEqual(dateRange);
      expect(result.granularity).toEqual(granularity);
      expect(result.summary.total).toBe(450);
      expect(result.summary.average).toBe(150);
      expect(result.summary.min).toBe(100);
      expect(result.summary.max).toBe(200);
    });

    it('should store aggregation in database', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue([
        { timestamp: new Date('2024-01-01'), value: 100 },
      ]);

      await service.aggregateMetrics(venueId, metricType, dateRange, granularity);

      expect(mockAggregationModel.upsertAggregation).toHaveBeenCalledWith(
        venueId,
        expect.objectContaining({
          metricType,
          period: dateRange,
          granularity,
        })
      );
    });

    it('should cache the result', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue([]);

      await service.aggregateMetrics(venueId, metricType, dateRange, granularity);

      expect(mockCacheModel.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        600 // CACHE_TTL.INSIGHTS
      );
    });

    it('should handle empty metrics', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue([]);

      const result = await service.aggregateMetrics(
        venueId,
        metricType,
        dateRange,
        granularity
      );

      expect(result.data).toHaveLength(0);
      expect(result.summary.total).toBe(0);
      expect(result.summary.average).toBe(0);
      expect(result.summary.min).toBe(0);
      expect(result.summary.max).toBe(0);
      expect(result.summary.trend).toBe(0);
    });

    it('should calculate change and changePercent between data points', async () => {
      const metrics = [
        { timestamp: new Date('2024-01-01T00:00:00Z'), value: 100 },
        { timestamp: new Date('2024-01-02T00:00:00Z'), value: 150 },
      ];
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue(metrics);

      const result = await service.aggregateMetrics(
        venueId,
        metricType,
        dateRange,
        granularity
      );

      expect(result.data.length).toBeGreaterThanOrEqual(2);
      // First point has no change
      expect(result.data[0].change).toBeUndefined();
      // Second point has change calculated
      if (result.data.length > 1) {
        expect(result.data[1].change).toBe(50);
        expect(result.data[1].changePercent).toBe(50);
      }
    });

    it('should throw error on failure', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockRejectedValue(new Error('DB error'));

      await expect(
        service.aggregateMetrics(venueId, metricType, dateRange, granularity)
      ).rejects.toThrow('DB error');
    });

    describe('granularity bucketing', () => {
      it('should bucket by minute', async () => {
        const metrics = [
          { timestamp: new Date('2024-01-01T10:00:15Z'), value: 50 },
          { timestamp: new Date('2024-01-01T10:00:45Z'), value: 50 },
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          dateRange,
          { unit: 'minute', value: 1 }
        );

        // Both should be in the same minute bucket
        expect(result.data).toHaveLength(1);
        expect(result.data[0].value).toBe(100);
      });

      it('should bucket by hour', async () => {
        const metrics = [
          { timestamp: new Date('2024-01-01T10:15:00Z'), value: 50 },
          { timestamp: new Date('2024-01-01T10:45:00Z'), value: 50 },
          { timestamp: new Date('2024-01-01T11:15:00Z'), value: 100 },
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          dateRange,
          { unit: 'hour', value: 1 }
        );

        expect(result.data).toHaveLength(2);
      });

      it('should bucket by week', async () => {
        const metrics = [
          { timestamp: new Date('2024-01-01T10:00:00Z'), value: 100 }, // Monday
          { timestamp: new Date('2024-01-03T10:00:00Z'), value: 100 }, // Wednesday
          { timestamp: new Date('2024-01-08T10:00:00Z'), value: 200 }, // Next week
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          dateRange,
          { unit: 'week', value: 1 }
        );

        expect(result.data).toHaveLength(2);
      });

      it('should bucket by month', async () => {
        const metrics = [
          { timestamp: new Date('2024-01-15T10:00:00Z'), value: 100 },
          { timestamp: new Date('2024-01-20T10:00:00Z'), value: 100 },
          { timestamp: new Date('2024-02-05T10:00:00Z'), value: 200 },
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          { startDate: new Date('2024-01-01'), endDate: new Date('2024-03-01') },
          { unit: 'month', value: 1 }
        );

        expect(result.data).toHaveLength(2);
      });

      it('should bucket by quarter', async () => {
        const metrics = [
          { timestamp: new Date('2024-01-15T10:00:00Z'), value: 100 },
          { timestamp: new Date('2024-02-15T10:00:00Z'), value: 100 },
          { timestamp: new Date('2024-04-15T10:00:00Z'), value: 200 }, // Q2
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          { startDate: new Date('2024-01-01'), endDate: new Date('2024-06-01') },
          { unit: 'quarter', value: 1 }
        );

        expect(result.data).toHaveLength(2);
      });

      it('should bucket by year', async () => {
        const metrics = [
          { timestamp: new Date('2024-06-15T10:00:00Z'), value: 100 },
          { timestamp: new Date('2024-12-15T10:00:00Z'), value: 100 },
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          { startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') },
          { unit: 'year', value: 1 }
        );

        expect(result.data).toHaveLength(1);
        expect(result.data[0].value).toBe(200);
      });
    });

    describe('trend calculation', () => {
      it('should calculate positive trend', async () => {
        const metrics = [
          { timestamp: new Date('2024-01-01'), value: 100 },
          { timestamp: new Date('2024-01-02'), value: 200 },
          { timestamp: new Date('2024-01-03'), value: 300 },
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          dateRange,
          granularity
        );

        expect(result.summary.trend).toBeGreaterThan(0);
      });

      it('should calculate negative trend', async () => {
        const metrics = [
          { timestamp: new Date('2024-01-01'), value: 300 },
          { timestamp: new Date('2024-01-02'), value: 200 },
          { timestamp: new Date('2024-01-03'), value: 100 },
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          dateRange,
          granularity
        );

        expect(result.summary.trend).toBeLessThan(0);
      });

      it('should return 0 trend for single data point', async () => {
        const metrics = [{ timestamp: new Date('2024-01-01'), value: 100 }];
        mockCacheModel.get.mockResolvedValue(null);
        mockMetricModel.getMetrics.mockResolvedValue(metrics);

        const result = await service.aggregateMetrics(
          venueId,
          metricType,
          dateRange,
          granularity
        );

        expect(result.summary.trend).toBe(0);
      });
    });
  });

  describe('performHourlyAggregation', () => {
    it('should aggregate all metric types for the last hour', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue([]);
      mockAggregationModel.upsertAggregation.mockResolvedValue(undefined);
      mockCacheModel.set.mockResolvedValue(undefined);

      await service.performHourlyAggregation('venue-123');

      // Should be called for each MetricType
      expect(mockMetricModel.getMetrics).toHaveBeenCalled();
    });

    it('should throw error on failure', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockRejectedValue(new Error('Aggregation failed'));

      await expect(service.performHourlyAggregation('venue-123')).rejects.toThrow(
        'Aggregation failed'
      );
    });
  });

  describe('performDailyAggregation', () => {
    it('should aggregate all metric types for yesterday', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue([]);
      mockAggregationModel.upsertAggregation.mockResolvedValue(undefined);
      mockCacheModel.set.mockResolvedValue(undefined);

      await service.performDailyAggregation('venue-123');

      expect(mockMetricModel.getMetrics).toHaveBeenCalled();
    });

    it('should throw error on failure', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockRejectedValue(new Error('Daily aggregation failed'));

      await expect(service.performDailyAggregation('venue-123')).rejects.toThrow(
        'Daily aggregation failed'
      );
    });
  });

  describe('getComparativeMetrics', () => {
    const venueId = 'venue-123';
    const metricType = 'revenue' as MetricType;
    const currentPeriod = {
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-29'),
    };
    const comparisonPeriod = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };
    const granularity = { unit: 'day' as const, value: 1 };

    it('should return comparative metrics', async () => {
      // First call for current period
      mockCacheModel.get.mockResolvedValueOnce(null);
      mockMetricModel.getMetrics.mockResolvedValueOnce([
        { timestamp: new Date('2024-02-15'), value: 200 },
      ]);

      // Second call for comparison period
      mockCacheModel.get.mockResolvedValueOnce(null);
      mockMetricModel.getMetrics.mockResolvedValueOnce([
        { timestamp: new Date('2024-01-15'), value: 100 },
      ]);

      const result = await service.getComparativeMetrics(
        venueId,
        metricType,
        currentPeriod,
        comparisonPeriod,
        granularity
      );

      expect(result.current).toBeDefined();
      expect(result.previous).toBeDefined();
      expect(result.change).toBe(100); // 200 - 100
      expect(result.changePercent).toBe(100); // (100/100) * 100
    });

    it('should handle zero previous total', async () => {
      mockCacheModel.get.mockResolvedValueOnce(null);
      mockMetricModel.getMetrics.mockResolvedValueOnce([
        { timestamp: new Date('2024-02-15'), value: 200 },
      ]);

      mockCacheModel.get.mockResolvedValueOnce(null);
      mockMetricModel.getMetrics.mockResolvedValueOnce([]);

      const result = await service.getComparativeMetrics(
        venueId,
        metricType,
        currentPeriod,
        comparisonPeriod,
        granularity
      );

      expect(result.change).toBe(200);
      expect(result.changePercent).toBe(0); // Avoid division by zero
    });

    it('should calculate negative change', async () => {
      mockCacheModel.get.mockResolvedValueOnce(null);
      mockMetricModel.getMetrics.mockResolvedValueOnce([
        { timestamp: new Date('2024-02-15'), value: 50 },
      ]);

      mockCacheModel.get.mockResolvedValueOnce(null);
      mockMetricModel.getMetrics.mockResolvedValueOnce([
        { timestamp: new Date('2024-01-15'), value: 100 },
      ]);

      const result = await service.getComparativeMetrics(
        venueId,
        metricType,
        currentPeriod,
        comparisonPeriod,
        granularity
      );

      expect(result.change).toBe(-50);
      expect(result.changePercent).toBe(-50);
    });

    it('should throw error on failure', async () => {
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockRejectedValue(new Error('Comparison failed'));

      await expect(
        service.getComparativeMetrics(
          venueId,
          metricType,
          currentPeriod,
          comparisonPeriod,
          granularity
        )
      ).rejects.toThrow('Comparison failed');
    });
  });
});
