/**
 * Realtime Aggregation Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockHgetall = jest.fn().mockResolvedValue({});
const mockScard = jest.fn().mockResolvedValue(0);

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    hgetall: mockHgetall,
    scard: mockScard,
  })),
}));

const mockDbInsert = jest.fn().mockReturnThis();
const mockDbOnConflict = jest.fn().mockReturnThis();
const mockDbMerge = jest.fn().mockResolvedValue(1);
const mockDbWhere = jest.fn().mockReturnThis();
const mockDbWhereRaw = jest.fn().mockReturnThis();
const mockDbDistinct = jest.fn().mockReturnThis();
const mockDbPluck = jest.fn().mockResolvedValue([]);
const mockDbUpdate = jest.fn().mockResolvedValue(1);
const mockDbCount = jest.fn().mockReturnThis();
const mockDbFirst = jest.fn().mockResolvedValue({ count: 0 });

const mockAnalyticsDb = jest.fn(() => ({
  insert: mockDbInsert,
  onConflict: mockDbOnConflict,
  merge: mockDbMerge,
  where: mockDbWhere,
  whereRaw: mockDbWhereRaw,
  distinct: mockDbDistinct,
  pluck: mockDbPluck,
  update: mockDbUpdate,
  count: mockDbCount,
  first: mockDbFirst,
}));

jest.mock('../../../src/config/database', () => ({
  getAnalyticsDb: jest.fn(() => mockAnalyticsDb),
}));

const mockEmitMetricUpdate = jest.fn();
const mockEmitAlert = jest.fn();

jest.mock('../../../src/config/websocket', () => ({
  emitMetricUpdate: mockEmitMetricUpdate,
  emitAlert: mockEmitAlert,
}));

import { RealtimeAggregationService } from '../../../src/services/realtime-aggregation.service';
import { logger } from '../../../src/utils/logger';

describe('RealtimeAggregationService', () => {
  let service: RealtimeAggregationService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new RealtimeAggregationService();
  });

  afterEach(() => {
    service.stopAggregationPipeline();
    jest.useRealTimers();
  });

  describe('startAggregationPipeline', () => {
    it('should log startup message', async () => {
      await service.startAggregationPipeline();

      expect(logger.info).toHaveBeenCalledWith('Starting real-time aggregation pipeline');
    });

    it('should set up aggregation intervals', async () => {
      await service.startAggregationPipeline();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Started 1-minute aggregation'),
        expect.any(String)
      );
    });
  });

  describe('stopAggregationPipeline', () => {
    it('should clear all intervals', async () => {
      await service.startAggregationPipeline();
      service.stopAggregationPipeline();

      expect(logger.info).toHaveBeenCalledWith('Stopped aggregation pipeline');
    });

    it('should handle stop when not started', () => {
      expect(() => service.stopAggregationPipeline()).not.toThrow();
    });
  });

  describe('aggregate1Minute', () => {
    beforeEach(async () => {
      mockDbPluck.mockResolvedValue(['venue-1', 'venue-2']);
      mockHgetall.mockResolvedValue({
        total_sales: '10',
        revenue: '500',
        page_views: '100',
      });
    });

    it('should get active venues', async () => {
      await (service as any).aggregate1Minute();

      expect(mockAnalyticsDb).toHaveBeenCalledWith('venue_analytics');
      expect(mockDbDistinct).toHaveBeenCalledWith('venue_id');
    });

    it('should calculate metrics for each venue', async () => {
      await (service as any).aggregate1Minute();

      expect(mockHgetall).toHaveBeenCalled();
    });

    it('should emit WebSocket updates', async () => {
      await (service as any).aggregate1Minute();

      expect(mockEmitMetricUpdate).toHaveBeenCalledWith(
        'venue-1',
        'realtime-summary',
        expect.any(Object)
      );
    });

    it('should store metrics in database', async () => {
      await (service as any).aggregate1Minute();

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: expect.any(String),
          metric_type: '1min_summary',
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockDbPluck.mockRejectedValueOnce(new Error('DB error'));

      await (service as any).aggregate1Minute();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to run 1-minute aggregation',
        expect.any(Error)
      );
    });
  });

  describe('calculate1MinuteMetrics', () => {
    it('should calculate sales rate', async () => {
      mockHgetall
        .mockResolvedValueOnce({ total_sales: '120', revenue: '6000' })
        .mockResolvedValueOnce({ page_views: '600' });

      const metrics = await (service as any).calculate1MinuteMetrics('venue-1');

      expect(metrics.sales.count).toBe(120);
      expect(metrics.sales.revenue).toBe(6000);
      expect(metrics.sales.rate).toBe(2); // 120/60
    });

    it('should calculate traffic rate', async () => {
      mockHgetall
        .mockResolvedValueOnce({ total_sales: '60', revenue: '3000' })
        .mockResolvedValueOnce({ page_views: '1800' });

      const metrics = await (service as any).calculate1MinuteMetrics('venue-1');

      expect(metrics.traffic.pageViews).toBe(1800);
      expect(metrics.traffic.rate).toBe(30); // 1800/60
    });

    it('should calculate conversion rate', async () => {
      mockHgetall
        .mockResolvedValueOnce({ total_sales: '30', revenue: '1500' })
        .mockResolvedValueOnce({ page_views: '600' });

      const metrics = await (service as any).calculate1MinuteMetrics('venue-1');

      // salesRate = 30/60 = 0.5, trafficRate = 600/60 = 10
      // conversion = 0.5/10 = 0.05
      expect(metrics.conversion.rate).toBe(0.05);
    });

    it('should handle zero traffic', async () => {
      mockHgetall
        .mockResolvedValueOnce({ total_sales: '0', revenue: '0' })
        .mockResolvedValueOnce({ page_views: '0' });

      const metrics = await (service as any).calculate1MinuteMetrics('venue-1');

      expect(metrics.conversion.rate).toBe(0);
    });

    it('should handle missing data', async () => {
      mockHgetall.mockResolvedValue({});

      const metrics = await (service as any).calculate1MinuteMetrics('venue-1');

      expect(metrics.sales.count).toBe(0);
      expect(metrics.traffic.pageViews).toBe(0);
    });
  });

  describe('aggregate5Minutes', () => {
    beforeEach(() => {
      mockDbPluck.mockResolvedValue(['venue-1']);
      mockHgetall.mockResolvedValue({
        total_sales: '50',
        revenue: '2500',
        page_views: '500',
        unique_visitors: '200',
      });
    });

    it('should calculate 5-minute aggregates', async () => {
      await (service as any).aggregate5Minutes();

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metric_type: '5min_summary',
        })
      );
    });

    it('should emit 5min-summary to WebSocket', async () => {
      await (service as any).aggregate5Minutes();

      expect(mockEmitMetricUpdate).toHaveBeenCalledWith(
        'venue-1',
        '5min-summary',
        expect.any(Object)
      );
    });

    it('should log completion', async () => {
      await (service as any).aggregate5Minutes();

      expect(logger.debug).toHaveBeenCalledWith(
        '5-minute aggregation completed',
        expect.objectContaining({ venueCount: 1 })
      );
    });
  });

  describe('aggregateHourly', () => {
    beforeEach(() => {
      mockDbPluck.mockResolvedValue(['venue-1']);
    });

    it('should update venue_analytics table', async () => {
      await (service as any).aggregateHourly();

      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockDbPluck.mockRejectedValueOnce(new Error('Hourly error'));

      await (service as any).aggregateHourly();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to run hourly aggregation',
        expect.any(Error)
      );
    });
  });

  describe('calculateHourlyMetrics', () => {
    it('should return metrics object', async () => {
      mockHgetall.mockResolvedValue({
        unique_count: '50',
        sessions: '100',
        avg_duration: '120.5',
        tickets_sold: '25',
        revenue: '1250',
      });
      mockScard.mockResolvedValue(45);
      mockDbFirst.mockResolvedValue({ count: 3 });

      const metrics = await (service as any).calculateHourlyMetrics('venue-1');

      expect(metrics).toHaveProperty('uniqueCustomers');
      expect(metrics).toHaveProperty('activeEvents');
      expect(metrics).toHaveProperty('totalSessions');
      expect(metrics).toHaveProperty('ticketsSold');
      expect(metrics).toHaveProperty('revenue');
    });

    it('should handle errors and return defaults', async () => {
      mockHgetall.mockRejectedValue(new Error('Redis error'));

      const metrics = await (service as any).calculateHourlyMetrics('venue-1');

      expect(metrics.uniqueCustomers).toBe(0);
      expect(metrics.activeEvents).toBe(0);
    });
  });

  describe('getActiveVenues', () => {
    it('should query venues with recent activity', async () => {
      mockDbPluck.mockResolvedValue(['venue-1', 'venue-2', 'venue-3']);

      const venues = await (service as any).getActiveVenues();

      expect(venues).toEqual(['venue-1', 'venue-2', 'venue-3']);
      expect(mockDbDistinct).toHaveBeenCalledWith('venue_id');
    });
  });

  describe('checkAlertConditions', () => {
    it('should create high traffic alert', async () => {
      const metrics = {
        traffic: { rate: 150, pageViews: 9000 },
        conversion: { rate: 0.05 },
      };

      await (service as any).checkAlertConditions('venue-1', metrics);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: 'venue-1',
          alert_name: 'high_traffic',
        })
      );
    });

    it('should create low conversion alert', async () => {
      const metrics = {
        traffic: { rate: 50, pageViews: 2000 },
        conversion: { rate: 0.005 },
      };

      await (service as any).checkAlertConditions('venue-1', metrics);

      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_name: 'low_conversion',
        })
      );
    });

    it('should emit alert via WebSocket', async () => {
      const metrics = {
        traffic: { rate: 200, pageViews: 12000 },
        conversion: { rate: 0.1 },
      };

      await (service as any).checkAlertConditions('venue-1', metrics);

      expect(mockEmitAlert).toHaveBeenCalled();
    });

    it('should not alert for normal metrics', async () => {
      const metrics = {
        traffic: { rate: 50, pageViews: 500 },
        conversion: { rate: 0.05 },
      };

      await (service as any).checkAlertConditions('venue-1', metrics);

      expect(mockEmitAlert).not.toHaveBeenCalled();
    });
  });
});
