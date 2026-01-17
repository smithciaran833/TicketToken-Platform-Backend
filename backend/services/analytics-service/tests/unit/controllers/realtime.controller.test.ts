/**
 * Realtime Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockRedisClient = {
  hgetall: jest.fn(),
  scard: jest.fn(),
  smembers: jest.fn(),
  incrby: jest.fn(),
  expire: jest.fn(),
  get: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => mockRedisClient),
}));

const mockAnalyticsDb = jest.fn(() => ({
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  count: jest.fn().mockReturnThis(),
}));

jest.mock('../../../src/config/database', () => ({
  getAnalyticsDb: jest.fn(() => mockAnalyticsDb),
}));

import { realtimeController } from '../../../src/controllers/realtime.controller';

describe('RealtimeController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
      log: { error: jest.fn(), info: jest.fn() },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Reset mock implementations
    mockRedisClient.hgetall.mockResolvedValue({});
    mockRedisClient.scard.mockResolvedValue(0);
    mockRedisClient.smembers.mockResolvedValue([]);
    mockRedisClient.incrby.mockResolvedValue(1);
    mockRedisClient.expire.mockResolvedValue(1);
    mockRedisClient.get.mockResolvedValue(null);
  });

  describe('getRealTimeMetrics', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-123' };
    });

    it('should return metrics for default metric types when none specified', async () => {
      mockRequest.query = {};
      mockRedisClient.hgetall
        .mockResolvedValueOnce({ count: '100', value: '5000' }) // sales
        .mockResolvedValueOnce({ pageViews: '1000' }) // traffic
        .mockResolvedValueOnce({ rate: '0.05' }); // conversion

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ metric_value: { summary: 'data' } }),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      await realtimeController.getRealTimeMetrics(mockRequest, mockReply);

      expect(mockRedisClient.hgetall).toHaveBeenCalledTimes(3);
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          metrics: expect.objectContaining({
            sales: expect.any(Object),
            traffic: expect.any(Object),
            conversion: expect.any(Object),
          }),
          summary: expect.any(Object),
          timestamp: expect.any(String),
        }),
      });
    });

    it('should return only requested metrics when specified', async () => {
      mockRequest.query = { metrics: 'sales,traffic' };
      mockRedisClient.hgetall
        .mockResolvedValueOnce({ count: '50' })
        .mockResolvedValueOnce({ pageViews: '500' });

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      await realtimeController.getRealTimeMetrics(mockRequest, mockReply);

      expect(mockRedisClient.hgetall).toHaveBeenCalledTimes(2);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          metrics: {
            sales: { count: '50' },
            traffic: { pageViews: '500' },
          },
        }),
      });
    });

    it('should use correct Redis key format with venue and date', async () => {
      mockRequest.query = { metrics: 'sales' };
      const today = new Date().toISOString().split('T')[0];

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      await realtimeController.getRealTimeMetrics(mockRequest, mockReply);

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith(
        `metrics:sales:venue-123:${today}`
      );
    });

    it('should return empty summary when no realtime data exists', async () => {
      mockRequest.query = { metrics: 'sales' };

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      await realtimeController.getRealTimeMetrics(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          summary: {},
        }),
      });
    });

    it('should handle Redis errors gracefully', async () => {
      mockRequest.query = {};
      mockRedisClient.hgetall.mockRejectedValue(new Error('Redis connection failed'));

      await realtimeController.getRealTimeMetrics(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Redis connection failed',
        }),
      });
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.query = { metrics: 'sales' };
      mockRedisClient.hgetall.mockResolvedValue({});

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      await realtimeController.getRealTimeMetrics(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('subscribeToMetrics', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-456' };
    });

    it('should return subscription info with requested metrics', async () => {
      mockRequest.query = { metrics: 'sales,traffic,conversion' };

      await realtimeController.subscribeToMetrics(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          subscriptionId: expect.stringMatching(/^sub_venue-456_\d+$/),
          venueId: 'venue-456',
          metrics: ['sales', 'traffic', 'conversion'],
          websocketUrl: '/ws/metrics/venue-456',
          message: 'Use WebSocket connection for real-time updates',
        }),
      });
    });

    it('should generate unique subscription IDs', async () => {
      mockRequest.query = { metrics: 'sales' };

      await realtimeController.subscribeToMetrics(mockRequest, mockReply);
      const firstCall = mockReply.send.mock.calls[0][0].data.subscriptionId;

      jest.clearAllMocks();
      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));
      await realtimeController.subscribeToMetrics(mockRequest, mockReply);
      const secondCall = mockReply.send.mock.calls[0][0].data.subscriptionId;

      expect(firstCall).not.toBe(secondCall);
    });

    it('should handle single metric subscription', async () => {
      mockRequest.query = { metrics: 'revenue' };

      await realtimeController.subscribeToMetrics(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          metrics: ['revenue'],
        }),
      });
    });
  });

  describe('getActiveSessions', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-789' };
    });

    it('should return active session count and details', async () => {
      mockRedisClient.scard.mockResolvedValue(5);
      mockRedisClient.smembers.mockResolvedValue(['sess-1', 'sess-2', 'sess-3']);
      mockRedisClient.hgetall
        .mockResolvedValueOnce({ userId: 'user-1', startTime: '2024-01-01T10:00:00Z' })
        .mockResolvedValueOnce({ userId: 'user-2', startTime: '2024-01-01T10:05:00Z' })
        .mockResolvedValueOnce({ userId: 'user-3', startTime: '2024-01-01T10:10:00Z' });

      await realtimeController.getActiveSessions(mockRequest, mockReply);

      expect(mockRedisClient.scard).toHaveBeenCalledWith('sessions:active:venue-789');
      expect(mockRedisClient.smembers).toHaveBeenCalledWith('sessions:active:venue-789');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          sessions: 5,
          activeSessionDetails: expect.arrayContaining([
            expect.objectContaining({ sessionId: 'sess-1', userId: 'user-1' }),
            expect.objectContaining({ sessionId: 'sess-2', userId: 'user-2' }),
            expect.objectContaining({ sessionId: 'sess-3', userId: 'user-3' }),
          ]),
          timestamp: expect.any(String),
        }),
      });
    });

    it('should limit session details to 100 sessions', async () => {
      const manySessionIds = Array.from({ length: 150 }, (_, i) => `sess-${i}`);
      mockRedisClient.scard.mockResolvedValue(150);
      mockRedisClient.smembers.mockResolvedValue(manySessionIds);
      mockRedisClient.hgetall.mockResolvedValue({ userId: 'user-x' });

      await realtimeController.getActiveSessions(mockRequest, mockReply);

      // Should only fetch details for first 100
      expect(mockRedisClient.hgetall).toHaveBeenCalledTimes(100);
    });

    it('should return zero sessions when none active', async () => {
      mockRedisClient.scard.mockResolvedValue(0);
      mockRedisClient.smembers.mockResolvedValue([]);

      await realtimeController.getActiveSessions(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          sessions: 0,
          activeSessionDetails: [],
        }),
      });
    });

    it('should handle Redis errors', async () => {
      mockRedisClient.scard.mockRejectedValue(new Error('Connection timeout'));

      await realtimeController.getActiveSessions(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Connection timeout',
        }),
      });
    });
  });

  describe('getLiveDashboardStats', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-123', dashboardId: 'dash-456' };
    });

    it('should return comprehensive live dashboard stats', async () => {
      mockRedisClient.hgetall.mockResolvedValue({
        total_sales: '150',
        revenue: '7500.50',
        avg_order: '50.00',
      });

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ hourly_data: 'stats' }),
        count: jest.fn().mockReturnThis(),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      // Mock for hourly stats
      mockDbChain.first.mockResolvedValueOnce({ hourly_data: 'stats' });
      // Mock for alerts count
      mockDbChain.first.mockResolvedValueOnce({ count: '3' });

      await realtimeController.getLiveDashboardStats(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          stats: expect.objectContaining({
            dashboardId: 'dash-456',
            sales: {
              today: 150,
              revenue: 7500.50,
              avgOrderValue: 50.00,
            },
            lastUpdated: expect.any(String),
          }),
        }),
      });
    });

    it('should handle missing sales data with defaults', async () => {
      mockRedisClient.hgetall.mockResolvedValue({});

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockReturnThis(),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      await realtimeController.getLiveDashboardStats(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          stats: expect.objectContaining({
            sales: {
              today: 0,
              revenue: 0,
              avgOrderValue: 0,
            },
            activeAlerts: 0,
          }),
        }),
      });
    });

    it('should query correct Redis key for current date', async () => {
      const today = new Date().toISOString().split('T')[0];

      const mockDbChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockReturnThis(),
      };
      mockAnalyticsDb.mockReturnValue(mockDbChain);

      await realtimeController.getLiveDashboardStats(mockRequest, mockReply);

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith(
        `metrics:sales:venue-123:${today}`
      );
    });
  });

  describe('updateCounter', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-123' };
    });

    it('should increment counter by specified amount', async () => {
      mockRequest.body = { counterType: 'page_views', increment: 5 };
      mockRedisClient.incrby.mockResolvedValue(105);

      await realtimeController.updateCounter(mockRequest, mockReply);

      expect(mockRedisClient.incrby).toHaveBeenCalledWith(
        'counter:page_views:venue-123',
        5
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          counterType: 'page_views',
          value: 105,
          venueId: 'venue-123',
        },
      });
    });

    it('should use default increment of 1 when not specified', async () => {
      mockRequest.body = { counterType: 'clicks' };
      mockRedisClient.incrby.mockResolvedValue(1);

      await realtimeController.updateCounter(mockRequest, mockReply);

      expect(mockRedisClient.incrby).toHaveBeenCalledWith(
        'counter:clicks:venue-123',
        1
      );
    });

    it('should set 24-hour expiry for daily counters', async () => {
      mockRequest.body = { counterType: 'daily_visitors', increment: 1 };
      mockRedisClient.incrby.mockResolvedValue(50);

      await realtimeController.updateCounter(mockRequest, mockReply);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'counter:daily_visitors:venue-123',
        86400
      );
    });

    it('should not set expiry for non-daily counters', async () => {
      mockRequest.body = { counterType: 'total_sales', increment: 1 };
      mockRedisClient.incrby.mockResolvedValue(1000);

      await realtimeController.updateCounter(mockRequest, mockReply);

      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    it('should handle negative increments (decrements)', async () => {
      mockRequest.body = { counterType: 'active_users', increment: -1 };
      mockRedisClient.incrby.mockResolvedValue(99);

      await realtimeController.updateCounter(mockRequest, mockReply);

      expect(mockRedisClient.incrby).toHaveBeenCalledWith(
        'counter:active_users:venue-123',
        -1
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ value: 99 }),
      });
    });

    it('should handle Redis errors', async () => {
      mockRequest.body = { counterType: 'test', increment: 1 };
      mockRedisClient.incrby.mockRejectedValue(new Error('Redis write error'));

      await realtimeController.updateCounter(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getCounter', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-123', counterType: 'page_views' };
    });

    it('should return counter value', async () => {
      mockRedisClient.get.mockResolvedValue('500');

      await realtimeController.getCounter(mockRequest, mockReply);

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        'counter:page_views:venue-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          counterType: 'page_views',
          value: 500,
          venueId: 'venue-123',
        },
      });
    });

    it('should return 0 for non-existent counter', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await realtimeController.getCounter(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ value: 0 }),
      });
    });

    it('should handle Redis errors', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Connection refused'));

      await realtimeController.getCounter(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Connection refused',
        }),
      });
    });
  });
});
