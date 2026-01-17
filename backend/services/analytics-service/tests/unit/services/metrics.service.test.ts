/**
 * MetricsService Unit Tests
 */

// Mock dependencies
const mockMetricModel = {
  createMetric: jest.fn(),
  getMetrics: jest.fn(),
  aggregateMetrics: jest.fn(),
  bulkInsert: jest.fn(),
};

const mockRealtimeModel = {
  updateRealTimeMetric: jest.fn(),
  getRealTimeMetric: jest.fn(),
  incrementCounter: jest.fn(),
};

const mockCacheModel = {
  get: jest.fn(),
  set: jest.fn(),
  getCacheKey: jest.fn((...args) => args.join(':')),
  invalidateVenueCache: jest.fn(),
};

const mockInfluxDBService = {
  writeMetric: jest.fn(),
  queryMetrics: jest.fn(),
  aggregateMetrics: jest.fn(),
  bulkWriteMetrics: jest.fn(),
  flush: jest.fn(),
  healthCheck: jest.fn(),
};

jest.mock('../../../src/models', () => ({
  MetricModel: mockMetricModel,
  RealtimeModel: mockRealtimeModel,
  CacheModel: mockCacheModel,
}));

jest.mock('../../../src/services/influxdb.service', () => ({
  influxDBService: mockInfluxDBService,
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

// Default config - postgres backend
const createMockConfig = (backend = 'postgres', failSilently = true) => ({
  metrics: {
    backend,
    failSilently,
  },
});

jest.mock('../../../src/config', () => ({
  config: createMockConfig('postgres'),
}));

import { MetricType } from '../../../src/types';

describe('MetricsService', () => {
  let MetricsService: any;
  let metricsService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Re-apply mocks
    jest.doMock('../../../src/models', () => ({
      MetricModel: mockMetricModel,
      RealtimeModel: mockRealtimeModel,
      CacheModel: mockCacheModel,
    }));

    jest.doMock('../../../src/services/influxdb.service', () => ({
      influxDBService: mockInfluxDBService,
    }));

    jest.doMock('../../../src/config', () => ({
      config: createMockConfig('postgres'),
    }));

    const module = require('../../../src/services/metrics.service');
    MetricsService = module.MetricsService;
    metricsService = MetricsService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = MetricsService.getInstance();
      const instance2 = MetricsService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('recordMetric', () => {
    const venueId = 'venue-123';
    const metricType = 'revenue' as MetricType;
    const value = 100.50;
    const dimensions = { eventId: 'event-456' };
    const metadata = { source: 'api' };

    describe('postgres backend', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({
          MetricModel: mockMetricModel,
          RealtimeModel: mockRealtimeModel,
          CacheModel: mockCacheModel,
        }));
        jest.doMock('../../../src/services/influxdb.service', () => ({
          influxDBService: mockInfluxDBService,
        }));
        jest.doMock('../../../src/config', () => ({
          config: createMockConfig('postgres'),
        }));

        const module = require('../../../src/services/metrics.service');
        metricsService = module.MetricsService.getInstance();
      });

      it('should record metric to PostgreSQL', async () => {
        const dbMetric = {
          id: 'metric-1',
          tenant_id: venueId,
          metric_type: metricType,
          value,
          timestamp: new Date(),
          dimensions,
          metadata,
        };
        mockMetricModel.createMetric.mockResolvedValue(dbMetric);
        mockRealtimeModel.updateRealTimeMetric.mockResolvedValue(undefined);
        mockCacheModel.invalidateVenueCache.mockResolvedValue(undefined);

        const result = await metricsService.recordMetric(
          venueId,
          metricType,
          value,
          dimensions,
          metadata
        );

        expect(mockMetricModel.createMetric).toHaveBeenCalledWith({
          venueId,
          metricType,
          value,
          timestamp: expect.any(Date),
          dimensions,
          metadata,
        });
        expect(result.id).toBe('metric-1');
        expect(result.venueId).toBe(venueId);
        expect(result.value).toBe(value);
      });

      it('should update realtime metric', async () => {
        mockMetricModel.createMetric.mockResolvedValue({
          id: 'metric-1',
          tenant_id: venueId,
          metric_type: metricType,
          value,
          timestamp: new Date(),
        });

        await metricsService.recordMetric(venueId, metricType, value);

        expect(mockRealtimeModel.updateRealTimeMetric).toHaveBeenCalledWith(
          venueId,
          metricType,
          value
        );
      });

      it('should invalidate venue cache', async () => {
        mockMetricModel.createMetric.mockResolvedValue({
          id: 'metric-1',
          tenant_id: venueId,
          metric_type: metricType,
          value,
          timestamp: new Date(),
        });

        await metricsService.recordMetric(venueId, metricType, value);

        expect(mockCacheModel.invalidateVenueCache).toHaveBeenCalledWith(venueId);
      });

      it('should not write to InfluxDB in postgres mode', async () => {
        mockMetricModel.createMetric.mockResolvedValue({
          id: 'metric-1',
          tenant_id: venueId,
          metric_type: metricType,
          value,
          timestamp: new Date(),
        });

        await metricsService.recordMetric(venueId, metricType, value);

        expect(mockInfluxDBService.writeMetric).not.toHaveBeenCalled();
      });

      it('should throw error on failure', async () => {
        mockMetricModel.createMetric.mockRejectedValue(new Error('DB error'));

        await expect(
          metricsService.recordMetric(venueId, metricType, value)
        ).rejects.toThrow('DB error');
      });
    });

    describe('influxdb backend', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({
          MetricModel: mockMetricModel,
          RealtimeModel: mockRealtimeModel,
          CacheModel: mockCacheModel,
        }));
        jest.doMock('../../../src/services/influxdb.service', () => ({
          influxDBService: mockInfluxDBService,
        }));
        jest.doMock('../../../src/config', () => ({
          config: createMockConfig('influxdb'),
        }));

        const module = require('../../../src/services/metrics.service');
        metricsService = module.MetricsService.getInstance();
      });

      it('should record metric to InfluxDB only', async () => {
        mockInfluxDBService.writeMetric.mockResolvedValue(undefined);
        mockInfluxDBService.flush.mockResolvedValue(undefined);
        mockRealtimeModel.updateRealTimeMetric.mockResolvedValue(undefined);
        mockCacheModel.invalidateVenueCache.mockResolvedValue(undefined);

        const result = await metricsService.recordMetric(
          venueId,
          metricType,
          value,
          dimensions,
          metadata
        );

        expect(mockInfluxDBService.writeMetric).toHaveBeenCalledWith(
          venueId,
          metricType,
          value,
          dimensions,
          metadata,
          expect.any(Date)
        );
        expect(mockInfluxDBService.flush).toHaveBeenCalled();
        expect(mockMetricModel.createMetric).not.toHaveBeenCalled();

        // Should return generated metric object
        expect(result.venueId).toBe(venueId);
        expect(result.metricType).toBe(metricType);
        expect(result.value).toBe(value);
      });
    });

    describe('dual backend', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({
          MetricModel: mockMetricModel,
          RealtimeModel: mockRealtimeModel,
          CacheModel: mockCacheModel,
        }));
        jest.doMock('../../../src/services/influxdb.service', () => ({
          influxDBService: mockInfluxDBService,
        }));
        jest.doMock('../../../src/config', () => ({
          config: createMockConfig('dual', true),
        }));

        const module = require('../../../src/services/metrics.service');
        metricsService = module.MetricsService.getInstance();
      });

      it('should write to both PostgreSQL and InfluxDB', async () => {
        mockMetricModel.createMetric.mockResolvedValue({
          id: 'metric-1',
          tenant_id: venueId,
          metric_type: metricType,
          value,
          timestamp: new Date(),
        });
        mockInfluxDBService.writeMetric.mockResolvedValue(undefined);
        mockInfluxDBService.flush.mockResolvedValue(undefined);

        await metricsService.recordMetric(venueId, metricType, value);

        expect(mockMetricModel.createMetric).toHaveBeenCalled();
        expect(mockInfluxDBService.writeMetric).toHaveBeenCalled();
      });

      it('should continue if InfluxDB fails when failSilently is true', async () => {
        mockMetricModel.createMetric.mockResolvedValue({
          id: 'metric-1',
          tenant_id: venueId,
          metric_type: metricType,
          value,
          timestamp: new Date(),
        });
        mockInfluxDBService.writeMetric.mockRejectedValue(new Error('InfluxDB error'));

        const result = await metricsService.recordMetric(venueId, metricType, value);

        expect(result).toBeDefined();
        expect(mockMetricModel.createMetric).toHaveBeenCalled();
      });

      it('should throw if InfluxDB fails when failSilently is false', async () => {
        jest.resetModules();
        jest.doMock('../../../src/config', () => ({
          config: createMockConfig('dual', false),
        }));

        const module = require('../../../src/services/metrics.service');
        const service = module.MetricsService.getInstance();

        mockMetricModel.createMetric.mockResolvedValue({
          id: 'metric-1',
          tenant_id: venueId,
          metric_type: metricType,
          value,
          timestamp: new Date(),
        });
        mockInfluxDBService.writeMetric.mockRejectedValue(new Error('InfluxDB error'));

        await expect(
          service.recordMetric(venueId, metricType, value)
        ).rejects.toThrow('InfluxDB error');
      });
    });
  });

  describe('getMetrics', () => {
    const venueId = 'venue-123';
    const metricType = 'revenue' as MetricType;
    const dateRange = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    it('should return cached metrics if available', async () => {
      const cachedMetrics = [
        { id: '1', venueId, metricType, value: 100, timestamp: new Date() },
      ];
      mockCacheModel.get.mockResolvedValue(cachedMetrics);

      const result = await metricsService.getMetrics(
        venueId,
        metricType,
        dateRange
      );

      expect(result).toEqual(cachedMetrics);
      expect(mockMetricModel.getMetrics).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache when not cached', async () => {
      const dbMetrics = [
        {
          id: '1',
          tenant_id: venueId,
          metric_type: metricType,
          value: 100,
          timestamp: new Date(),
          dimensions: {},
          metadata: {},
        },
      ];
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue(dbMetrics);
      mockCacheModel.set.mockResolvedValue(undefined);

      const result = await metricsService.getMetrics(
        venueId,
        metricType,
        dateRange
      );

      expect(result).toHaveLength(1);
      expect(result[0].venueId).toBe(venueId);
      expect(mockCacheModel.set).toHaveBeenCalled();
    });

    it('should pass granularity to query', async () => {
      const granularity = { unit: 'hour' as const, value: 1 };
      mockCacheModel.get.mockResolvedValue(null);
      mockMetricModel.getMetrics.mockResolvedValue([]);

      await metricsService.getMetrics(venueId, metricType, dateRange, granularity);

      expect(mockMetricModel.getMetrics).toHaveBeenCalledWith(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        granularity
      );
    });

    describe('influxdb backend', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({
          MetricModel: mockMetricModel,
          RealtimeModel: mockRealtimeModel,
          CacheModel: mockCacheModel,
        }));
        jest.doMock('../../../src/services/influxdb.service', () => ({
          influxDBService: mockInfluxDBService,
        }));
        jest.doMock('../../../src/config', () => ({
          config: createMockConfig('influxdb'),
        }));

        const module = require('../../../src/services/metrics.service');
        metricsService = module.MetricsService.getInstance();
      });

      it('should fetch from InfluxDB', async () => {
        const influxMetrics = [
          {
            id: '1',
            venueId,
            metricType,
            value: 100,
            timestamp: new Date(),
            dimensions: {},
          },
        ];
        mockCacheModel.get.mockResolvedValue(null);
        mockInfluxDBService.queryMetrics.mockResolvedValue(influxMetrics);

        const result = await metricsService.getMetrics(
          venueId,
          metricType,
          dateRange
        );

        expect(mockInfluxDBService.queryMetrics).toHaveBeenCalled();
        expect(mockMetricModel.getMetrics).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
      });

      it('should return empty array on InfluxDB error', async () => {
        mockCacheModel.get.mockResolvedValue(null);
        mockInfluxDBService.queryMetrics.mockRejectedValue(new Error('Query failed'));

        const result = await metricsService.getMetrics(
          venueId,
          metricType,
          dateRange
        );

        expect(result).toEqual([]);
      });
    });
  });

  describe('getRealTimeMetric', () => {
    it('should return realtime metric', async () => {
      const metric = { value: 150, timestamp: new Date() };
      mockRealtimeModel.getRealTimeMetric.mockResolvedValue(metric);

      const result = await metricsService.getRealTimeMetric(
        'venue-123',
        'revenue' as MetricType
      );

      expect(result).toEqual(metric);
      expect(mockRealtimeModel.getRealTimeMetric).toHaveBeenCalledWith(
        'venue-123',
        'revenue'
      );
    });

    it('should throw error on failure', async () => {
      mockRealtimeModel.getRealTimeMetric.mockRejectedValue(new Error('Redis error'));

      await expect(
        metricsService.getRealTimeMetric('venue-123', 'revenue' as MetricType)
      ).rejects.toThrow('Redis error');
    });
  });

  describe('getRealTimeMetrics', () => {
    it('should return all realtime metrics for venue', async () => {
      mockRealtimeModel.getRealTimeMetric.mockImplementation((venueId, type) => {
        if (type === 'revenue') return Promise.resolve({ value: 100 });
        if (type === 'sales') return Promise.resolve({ value: 50 });
        return Promise.resolve(null);
      });

      const result = await metricsService.getRealTimeMetrics('venue-123');

      expect(result).toHaveProperty('revenue');
      expect(result).toHaveProperty('sales');
    });

    it('should exclude null metrics', async () => {
      mockRealtimeModel.getRealTimeMetric.mockResolvedValue(null);

      const result = await metricsService.getRealTimeMetrics('venue-123');

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('incrementCounter', () => {
    it('should increment counter', async () => {
      mockRealtimeModel.incrementCounter.mockResolvedValue(10);

      const result = await metricsService.incrementCounter(
        'venue-123',
        'page_views',
        5
      );

      expect(result).toBe(10);
      expect(mockRealtimeModel.incrementCounter).toHaveBeenCalledWith(
        'venue-123',
        'page_views',
        5
      );
    });

    it('should default increment by 1', async () => {
      mockRealtimeModel.incrementCounter.mockResolvedValue(1);

      await metricsService.incrementCounter('venue-123', 'page_views');

      expect(mockRealtimeModel.incrementCounter).toHaveBeenCalledWith(
        'venue-123',
        'page_views',
        1
      );
    });
  });

  describe('aggregateMetric', () => {
    const venueId = 'venue-123';
    const metricType = 'revenue' as MetricType;
    const dateRange = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    it('should aggregate metric with sum', async () => {
      mockMetricModel.aggregateMetrics.mockResolvedValue({ sum: 5000 });

      const result = await metricsService.aggregateMetric(
        venueId,
        metricType,
        dateRange,
        'sum'
      );

      expect(result).toBe(5000);
    });

    it('should aggregate metric with avg', async () => {
      mockMetricModel.aggregateMetrics.mockResolvedValue({ avg: 250 });

      const result = await metricsService.aggregateMetric(
        venueId,
        metricType,
        dateRange,
        'avg'
      );

      expect(result).toBe(250);
    });

    it('should return 0 when no results', async () => {
      mockMetricModel.aggregateMetrics.mockResolvedValue({});

      const result = await metricsService.aggregateMetric(
        venueId,
        metricType,
        dateRange,
        'sum'
      );

      expect(result).toBe(0);
    });

    describe('influxdb backend', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({
          MetricModel: mockMetricModel,
          RealtimeModel: mockRealtimeModel,
          CacheModel: mockCacheModel,
        }));
        jest.doMock('../../../src/services/influxdb.service', () => ({
          influxDBService: mockInfluxDBService,
        }));
        jest.doMock('../../../src/config', () => ({
          config: createMockConfig('influxdb'),
        }));

        const module = require('../../../src/services/metrics.service');
        metricsService = module.MetricsService.getInstance();
      });

      it('should aggregate from InfluxDB', async () => {
        mockInfluxDBService.aggregateMetrics.mockResolvedValue({ sum: 3000 });

        const result = await metricsService.aggregateMetric(
          venueId,
          metricType,
          dateRange,
          'sum'
        );

        expect(result).toBe(3000);
        expect(mockInfluxDBService.aggregateMetrics).toHaveBeenCalled();
      });

      it('should return 0 on InfluxDB error', async () => {
        mockInfluxDBService.aggregateMetrics.mockRejectedValue(new Error('Error'));

        const result = await metricsService.aggregateMetric(
          venueId,
          metricType,
          dateRange,
          'sum'
        );

        expect(result).toBe(0);
      });
    });
  });

  describe('getMetricTrend', () => {
    it('should return trend data for multiple periods', async () => {
      mockMetricModel.aggregateMetrics
        .mockResolvedValueOnce({ sum: 100 })
        .mockResolvedValueOnce({ sum: 150 })
        .mockResolvedValueOnce({ sum: 200 });

      const result = await metricsService.getMetricTrend(
        'venue-123',
        'revenue' as MetricType,
        3,
        'day'
      );

      expect(result).toHaveLength(3);
      expect(result[0].value).toBe(100);
      expect(result[1].value).toBe(150);
      expect(result[2].value).toBe(200);
    });

    it('should calculate change percentage', async () => {
      mockMetricModel.aggregateMetrics
        .mockResolvedValueOnce({ sum: 100 })
        .mockResolvedValueOnce({ sum: 150 });

      const result = await metricsService.getMetricTrend(
        'venue-123',
        'revenue' as MetricType,
        2,
        'day'
      );

      expect(result[0].change).toBe(0); // First period has no previous
      expect(result[1].change).toBe(50); // (150-100)/100 * 100 = 50%
    });

    it('should handle zero previous value', async () => {
      mockMetricModel.aggregateMetrics
        .mockResolvedValueOnce({ sum: 0 })
        .mockResolvedValueOnce({ sum: 100 });

      const result = await metricsService.getMetricTrend(
        'venue-123',
        'revenue' as MetricType,
        2,
        'day'
      );

      expect(result[1].change).toBe(0); // Avoid division by zero
    });

    it('should support different period units', async () => {
      mockMetricModel.aggregateMetrics.mockResolvedValue({ sum: 100 });

      const units: Array<'hour' | 'day' | 'week' | 'month'> = [
        'hour',
        'day',
        'week',
        'month',
      ];

      for (const unit of units) {
        const result = await metricsService.getMetricTrend(
          'venue-123',
          'revenue' as MetricType,
          2,
          unit
        );
        expect(result).toHaveLength(2);
      }
    });
  });

  describe('bulkRecordMetrics', () => {
    const metrics = [
      { venueId: 'venue-1', metricType: 'revenue' as MetricType, value: 100 },
      { venueId: 'venue-1', metricType: 'sales' as MetricType, value: 50 },
    ];

    it('should bulk insert metrics', async () => {
      mockMetricModel.bulkInsert.mockResolvedValue(undefined);
      mockRealtimeModel.updateRealTimeMetric.mockResolvedValue(undefined);

      await metricsService.bulkRecordMetrics(metrics);

      expect(mockMetricModel.bulkInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ venueId: 'venue-1', value: 100 }),
          expect.objectContaining({ venueId: 'venue-1', value: 50 }),
        ])
      );
    });

    it('should update realtime metrics for each', async () => {
      mockMetricModel.bulkInsert.mockResolvedValue(undefined);
      mockRealtimeModel.updateRealTimeMetric.mockResolvedValue(undefined);

      await metricsService.bulkRecordMetrics(metrics);

      expect(mockRealtimeModel.updateRealTimeMetric).toHaveBeenCalledTimes(2);
    });

    it('should add timestamp if not provided', async () => {
      mockMetricModel.bulkInsert.mockResolvedValue(undefined);

      await metricsService.bulkRecordMetrics(metrics);

      expect(mockMetricModel.bulkInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ timestamp: expect.any(Date) }),
        ])
      );
    });
  });

  describe('getCapacityMetrics', () => {
    it('should return capacity metrics', async () => {
      const result = await metricsService.getCapacityMetrics('venue-123', 'event-456');

      expect(result).toHaveProperty('totalCapacity');
      expect(result).toHaveProperty('soldTickets');
      expect(result).toHaveProperty('availableTickets');
      expect(result).toHaveProperty('occupancyRate');
      expect(result.availableTickets).toBe(
        result.totalCapacity - result.soldTickets
      );
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      mockInfluxDBService.healthCheck.mockResolvedValue(true);

      const result = await metricsService.healthCheck();

      expect(result).toHaveProperty('postgres');
      expect(result).toHaveProperty('influxdb');
      expect(result).toHaveProperty('backend');
    });

    it('should indicate postgres is available in postgres mode', async () => {
      const result = await metricsService.healthCheck();

      expect(result.postgres).toBe(true);
    });
  });
});
