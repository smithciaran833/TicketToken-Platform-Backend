/**
 * Report Analytics Controller Unit Tests
 * 
 * Tests the report analytics controller handlers for:
 * - getSalesReport: Get sales report for events
 * - getVenueComparisonReport: Get venue comparison metrics
 * - getCustomerInsightsReport: Get customer insights data
 */

import {
  getSalesReport,
  getVenueComparisonReport,
  getCustomerInsightsReport
} from '../../../src/controllers/report-analytics.controller';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn()
  }
}));

describe('Report Analytics Controller', () => {
  let mockDb: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereBetween: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(),
      limit: jest.fn().mockReturnThis()
    });

    mockRequest = {
      params: {},
      query: {},
      container: { cradle: { db: mockDb } }
    };
    (mockRequest as any).tenantId = 'tenant-123';

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('getSalesReport', () => {
    it('should return sales report', async () => {
      const salesData = [
        { event_name: 'Concert A', tickets_sold: 100, revenue: '5000.00' },
        { event_name: 'Concert B', tickets_sold: 50, revenue: '2500.00' }
      ];

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockResolvedValue(salesData)
      });

      await getSalesReport(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          report_type: 'sales',
          data: salesData
        })
      });
    });

    it('should filter by date range', async () => {
      mockRequest.query = {
        start_date: '2026-01-01',
        end_date: '2026-01-31'
      };

      const mockChain = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockResolvedValue([])
      };
      mockDb.mockReturnValueOnce(mockChain);

      await getSalesReport(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true
      }));
    });

    it('should handle database errors', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await getSalesReport(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate sales report'
      });
    });
  });

  describe('getVenueComparisonReport', () => {
    it('should return venue comparison report', async () => {
      const venueData = [
        { venue_id: 'v1', venue_name: 'Venue A', total_events: 10, total_revenue: '50000.00' },
        { venue_id: 'v2', venue_name: 'Venue B', total_events: 5, total_revenue: '25000.00' }
      ];

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(venueData)
      });

      await getVenueComparisonReport(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          report_type: 'venue_comparison',
          data: venueData
        })
      });
    });

    it('should handle empty results', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([])
      });

      await getVenueComparisonReport(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          data: []
        })
      });
    });

    it('should handle database errors', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await getVenueComparisonReport(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate venue comparison report'
      });
    });
  });

  describe('getCustomerInsightsReport', () => {
    it('should return customer insights report', async () => {
      const customerData = [
        { customer_segment: 'VIP', count: 50, avg_spend: '500.00' },
        { customer_segment: 'Regular', count: 200, avg_spend: '100.00' }
      ];

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(customerData)
      });

      await getCustomerInsightsReport(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          report_type: 'customer_insights',
          data: customerData
        })
      });
    });

    it('should handle database errors', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await getCustomerInsightsReport(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to generate customer insights report'
      });
    });
  });
});
