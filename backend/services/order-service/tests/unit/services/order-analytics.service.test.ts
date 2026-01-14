/**
 * Unit Tests: Order Analytics Service
 * Tests analytics metrics calculation
 */

const mockQuery = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery })),
}));

import { OrderAnalyticsService } from '../../../src/services/order-analytics.service';

describe('OrderAnalyticsService', () => {
  let service: OrderAnalyticsService;
  const tenantId = 'tenant-123';
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-01-31');

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderAnalyticsService();
  });

  describe('calculateMetrics', () => {
    it('should calculate all metrics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100', revenue: '500000' }] }) // totals
        .mockResolvedValueOnce({ rows: [
          { status: 'CONFIRMED', count: '60' },
          { status: 'RESERVED', count: '20' },
          { status: 'EXPIRED', count: '20' },
        ]}) // status breakdown
        .mockResolvedValueOnce({ rows: [
          { event_id: 'event-1', order_count: '50', revenue: '250000' },
          { event_id: 'event-2', order_count: '30', revenue: '150000' },
        ]}); // top events

      const result = await service.calculateMetrics(tenantId, startDate, endDate);

      expect(result.totalOrders).toBe(100);
      expect(result.totalRevenue).toBe(500000);
      expect(result.averageOrderValue).toBe(5000);
      expect(result.conversionRate).toBe(60); // 60 confirmed / 100 total
      expect(result.topEvents).toHaveLength(2);
      expect(result.ordersByStatus).toHaveProperty('CONFIRMED', 60);
    });

    it('should handle zero orders', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0', revenue: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.calculateMetrics(tenantId, startDate, endDate);

      expect(result.totalOrders).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.averageOrderValue).toBe(0);
      expect(result.conversionRate).toBe(0);
      expect(result.topEvents).toHaveLength(0);
    });

    it('should return top 10 events sorted by revenue', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100', revenue: '1000000' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [
          { event_id: 'event-1', order_count: '30', revenue: '300000' },
          { event_id: 'event-2', order_count: '25', revenue: '250000' },
        ]});

      const result = await service.calculateMetrics(tenantId, startDate, endDate);

      expect(result.topEvents[0].eventId).toBe('event-1');
      expect(result.topEvents[0].revenue).toBe(300000);
    });

    it('should calculate conversion rate correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100', revenue: '500000' }] })
        .mockResolvedValueOnce({ rows: [
          { status: 'CONFIRMED', count: '40' },
          { status: 'RESERVED', count: '30' },
          { status: 'EXPIRED', count: '30' },
        ]})
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.calculateMetrics(tenantId, startDate, endDate);

      // 40 confirmed / (40 + 30 + 30) = 40%
      expect(result.conversionRate).toBe(40);
    });

    it('should exclude cancelled orders from totals', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '80', revenue: '400000' }] }) // excludes cancelled
        .mockResolvedValueOnce({ rows: [
          { status: 'CONFIRMED', count: '80' },
          { status: 'CANCELLED', count: '20' },
        ]})
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.calculateMetrics(tenantId, startDate, endDate);

      expect(result.totalOrders).toBe(80);
      expect(result.ordersByStatus['CANCELLED']).toBe(20);
    });
  });
});
