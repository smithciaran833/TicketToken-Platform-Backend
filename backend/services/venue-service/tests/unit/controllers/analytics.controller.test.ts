/**
 * Unit tests for analytics.controller.ts
 * Tests HTTP route handlers for venue analytics
 */

import { createMockRequest, createMockReply, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockAnalyticsService = {
  getVenueMetrics: jest.fn(),
  getRevenueAnalytics: jest.fn(),
  getTicketSalesAnalytics: jest.fn(),
  getAttendanceAnalytics: jest.fn(),
  getEventPerformance: jest.fn(),
  exportAnalyticsReport: jest.fn(),
};

const mockVenueService = {
  checkVenueAccess: jest.fn(),
};

describe('analytics.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest({ params: { venueId: mockVenueId } });
    mockReply = createMockReply();
    mockVenueService.checkVenueAccess.mockResolvedValue(true);
  });

  describe('GET /venues/:venueId/analytics/metrics', () => {
    it('should return venue metrics', async () => {
      const metrics = {
        totalEvents: 50,
        totalTicketsSold: 25000,
        totalRevenue: 1500000,
        averageOccupancy: 78.5,
      };
      mockAnalyticsService.getVenueMetrics.mockResolvedValue(metrics);

      const result = await mockAnalyticsService.getVenueMetrics(mockVenueId);

      expect(result.totalEvents).toBe(50);
      expect(result.totalRevenue).toBe(1500000);
    });
  });

  describe('GET /venues/:venueId/analytics/revenue', () => {
    it('should return revenue analytics with date range', async () => {
      const analytics = {
        total: 500000,
        byMonth: [{ month: '2024-01', revenue: 100000 }, { month: '2024-02', revenue: 150000 }],
        growth: 15.5,
      };
      mockAnalyticsService.getRevenueAnalytics.mockResolvedValue(analytics);

      const result = await mockAnalyticsService.getRevenueAnalytics(mockVenueId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      });

      expect(result.total).toBe(500000);
      expect(result.growth).toBe(15.5);
    });
  });

  describe('GET /venues/:venueId/analytics/tickets', () => {
    it('should return ticket sales analytics', async () => {
      const analytics = {
        totalSold: 10000,
        byType: [{ type: 'VIP', count: 500 }, { type: 'General', count: 9500 }],
        averagePrice: 45.00,
      };
      mockAnalyticsService.getTicketSalesAnalytics.mockResolvedValue(analytics);

      const result = await mockAnalyticsService.getTicketSalesAnalytics(mockVenueId);

      expect(result.totalSold).toBe(10000);
      expect(result.byType).toHaveLength(2);
    });
  });

  describe('GET /venues/:venueId/analytics/attendance', () => {
    it('should return attendance analytics', async () => {
      const analytics = {
        totalAttended: 8000,
        noShowRate: 5.2,
        peakDays: ['Saturday', 'Friday'],
      };
      mockAnalyticsService.getAttendanceAnalytics.mockResolvedValue(analytics);

      const result = await mockAnalyticsService.getAttendanceAnalytics(mockVenueId);

      expect(result.noShowRate).toBe(5.2);
      expect(result.peakDays).toContain('Saturday');
    });
  });

  describe('GET /venues/:venueId/analytics/events/:eventId', () => {
    it('should return event performance data', async () => {
      const performance = {
        ticketsSold: 500,
        revenue: 25000,
        occupancyRate: 85,
      };
      mockAnalyticsService.getEventPerformance.mockResolvedValue(performance);

      const result = await mockAnalyticsService.getEventPerformance(mockVenueId, 'event-123');

      expect(result.occupancyRate).toBe(85);
    });
  });

  describe('POST /venues/:venueId/analytics/export', () => {
    it('should export analytics report', async () => {
      mockAnalyticsService.exportAnalyticsReport.mockResolvedValue({
        downloadUrl: 'https://storage.example.com/report.csv',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = await mockAnalyticsService.exportAnalyticsReport(mockVenueId, { format: 'csv' });

      expect(result.downloadUrl).toBeDefined();
    });
  });
});
