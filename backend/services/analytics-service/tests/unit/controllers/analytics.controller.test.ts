/**
 * Analytics Controller Unit Tests
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

jest.mock('../../../src/analytics-engine/analytics-engine', () => ({
  analyticsEngine: {
    query: jest.fn(),
  },
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(),
}));

// Mock the revenue calculator module completely
const mockProjectRevenue = jest.fn();
jest.mock('../../../src/analytics-engine/calculators/revenue-calculator', () => ({
  RevenueCalculator: jest.fn().mockImplementation(() => ({
    projectRevenue: mockProjectRevenue,
  })),
}));

import { analyticsController } from '../../../src/controllers/analytics.controller';
import { analyticsEngine } from '../../../src/analytics-engine/analytics-engine';
import { getRedis } from '../../../src/config/redis';

describe('AnalyticsController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      query: {},
      body: {},
      params: {},
      venue: { id: 'venue-123', name: 'Test Venue' },
      user: { id: 'user-123', tenantId: 'tenant-123' },
      log: {
        error: jest.fn(),
        info: jest.fn(),
      },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default successful responses
    (analyticsEngine.query as jest.Mock).mockResolvedValue({
      revenue: {
        byChannel: { total: 10000, online: 6000, pos: 4000 },
      },
      ticketSales: [{ date: '2024-01-01', ticketsSold: 100 }],
      customerMetrics: {
        clv: { totalCustomers: 500 },
        segmentation: [{ segment: 'VIP', count: 50 }],
        churnRisk: { high: 10, medium: 20, low: 70 },
      },
      topEvents: [{ eventId: 'event-1', revenue: 5000 }],
      salesTrends: { trend: 'up', percentage: 15 },
      conversionRate: { rate: 0.05 },
    });

    (getRedis as jest.Mock).mockReturnValue({
      hgetall: jest.fn().mockResolvedValue({
        total_sales: '100',
        revenue: '5000',
        page_views: '1000',
      }),
    });

    mockProjectRevenue.mockResolvedValue({
      projections: [{ date: '2024-02-01', projected: 15000 }],
    });
  });

  describe('getRevenueSummary', () => {
    it('should return revenue summary', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await analyticsController.getRevenueSummary(mockRequest, mockReply);

      expect(analyticsEngine.query).toHaveBeenCalledWith({
        venueId: 'venue-123',
        metrics: ['revenue'],
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          byChannel: expect.any(Object),
        }),
      });
    });

    it('should return 400 if venue context is missing', async () => {
      mockRequest.venue = null;
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await analyticsController.getRevenueSummary(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Venue context required',
      });
    });

    it('should handle errors', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };
      (analyticsEngine.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        analyticsController.getRevenueSummary(mockRequest, mockReply)
      ).rejects.toThrow('Database error');

      expect(mockRequest.log.error).toHaveBeenCalled();
    });
  });

  describe('getRevenueByChannel', () => {
    it('should return revenue by channel', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await analyticsController.getRevenueByChannel(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Object),
      });
    });

    it('should return empty array if no channel data', async () => {
      (analyticsEngine.query as jest.Mock).mockResolvedValue({
        revenue: {},
      });

      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await analyticsController.getRevenueByChannel(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });
  });

  describe('getRevenueProjections', () => {
    it('should return revenue projections', async () => {
      mockRequest.query = { days: 30 };

      await analyticsController.getRevenueProjections(mockRequest, mockReply);

      expect(mockProjectRevenue).toHaveBeenCalledWith('venue-123', 30);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          projections: expect.any(Array),
        }),
      });
    });

    it('should use default 30 days if not specified', async () => {
      mockRequest.query = {};

      await analyticsController.getRevenueProjections(mockRequest, mockReply);

      expect(mockProjectRevenue).toHaveBeenCalledWith('venue-123', 30);
    });

    it('should require venue context', async () => {
      mockRequest.venue = null;
      mockRequest.query = { days: 30 };

      await analyticsController.getRevenueProjections(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('getCustomerLifetimeValue', () => {
    it('should return customer lifetime value', async () => {
      await analyticsController.getCustomerLifetimeValue(mockRequest, mockReply);

      expect(analyticsEngine.query).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-123',
          metrics: ['customerMetrics'],
        })
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Object),
      });
    });

    it('should query last year of data', async () => {
      await analyticsController.getCustomerLifetimeValue(mockRequest, mockReply);

      const call = (analyticsEngine.query as jest.Mock).mock.calls[0][0];
      const yearInMs = 365 * 24 * 60 * 60 * 1000;
      const timeDiff = call.timeRange.end.getTime() - call.timeRange.start.getTime();

      expect(timeDiff).toBeGreaterThanOrEqual(yearInMs - 1000);
      expect(timeDiff).toBeLessThanOrEqual(yearInMs + 1000);
    });
  });

  describe('getRealtimeSummary', () => {
    it('should fetch realtime data from Redis', async () => {
      const mockHgetall = jest.fn().mockResolvedValue({
        total_sales: '100',
        revenue: '5000',
        page_views: '1000',
      });

      (getRedis as jest.Mock).mockReturnValue({
        hgetall: mockHgetall,
      });

      await analyticsController.getRealtimeSummary(mockRequest, mockReply);

      expect(mockHgetall).toHaveBeenCalledTimes(2);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          timestamp: expect.any(Date),
          sales: expect.objectContaining({
            count: 100,
            revenue: 5000,
          }),
          traffic: expect.objectContaining({
            pageViews: 1000,
          }),
          conversionRate: expect.any(String),
        }),
      });
    });

    it('should calculate conversion rate', async () => {
      await analyticsController.getRealtimeSummary(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.conversionRate).toBe('10.00');
    });

    it('should handle zero traffic', async () => {
      (getRedis as jest.Mock).mockReturnValue({
        hgetall: jest.fn()
          .mockResolvedValueOnce({
            total_sales: '0',
            revenue: '0',
          })
          .mockResolvedValueOnce({
            page_views: '0',
          }),
      });

      await analyticsController.getRealtimeSummary(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      // When page_views is 0, the ternary returns '0.00'
      expect(sendCall.data.conversionRate).toBe('0.00');
    });
  });

  describe('getDashboardData', () => {
    it('should return comprehensive dashboard data', async () => {
      mockRequest.query = { period: '7d' };

      await analyticsController.getDashboardData(mockRequest, mockReply);

      expect(analyticsEngine.query).toHaveBeenCalledTimes(4);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          period: '7d',
          summary: expect.any(Object),
          realtime: expect.any(Object),
          charts: expect.any(Object),
          topEvents: expect.any(Array),
        }),
      });
    });

    it('should use default period of 7d', async () => {
      mockRequest.query = {};

      await analyticsController.getDashboardData(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.period).toBe('7d');
    });
  });
});
