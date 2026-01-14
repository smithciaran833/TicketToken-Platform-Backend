/**
 * Unit Tests: Order Report Service
 * Tests order reporting, revenue analytics, and statistics generation
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { OrderReportService } from '../../../src/services/order-report.service';
import { ReportPeriod } from '../../../src/types/report.types';

describe('OrderReportService', () => {
  let service: OrderReportService;
  const tenantId = 'tenant-123';

  const sampleReportSummary = {
    id: 'report-1',
    tenant_id: tenantId,
    period: ReportPeriod.DAILY,
    start_date: new Date('2024-01-01'),
    end_date: new Date('2024-01-01'),
    total_orders: 100,
    total_revenue_cents: 500000,
    average_order_value_cents: 5000,
    total_refunds_cents: 10000,
    orders_by_status: {
      pending: 10,
      reserved: 5,
      confirmed: 70,
      completed: 10,
      cancelled: 3,
      expired: 1,
      refunded: 1,
    },
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderReportService(mockPool as any);
  });

  describe('generateDailySummary', () => {
    const testDate = new Date('2024-01-15');

    it('should generate daily summary successfully', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      const result = await service.generateDailySummary(tenantId, testDate);

      expect(result.id).toBe('report-1');
      expect(result.period).toBe(ReportPeriod.DAILY);
      expect(result.totalOrders).toBe(100);
      expect(result.totalRevenueCents).toBe(500000);
    });

    it('should set correct date range for day', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateDailySummary(tenantId, testDate);

      const queryCall = mockQuery.mock.calls[0];
      const startDate = queryCall[1][2];
      const endDate = queryCall[1][3];

      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });

    it('should use UPSERT to handle duplicate reports', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateDailySummary(tenantId, testDate);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });

    it('should pass correct period type', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateDailySummary(tenantId, testDate);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([tenantId, ReportPeriod.DAILY])
      );
    });

    it('should log successful generation', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateDailySummary(tenantId, testDate);

      expect(mockLogger.info).toHaveBeenCalledWith('Generated daily order summary', expect.any(Object));
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.generateDailySummary(tenantId, testDate)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('generateWeeklySummary', () => {
    const startDate = new Date('2024-01-15');

    it('should generate weekly summary successfully', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ...sampleReportSummary, period: ReportPeriod.WEEKLY }] });

      const result = await service.generateWeeklySummary(tenantId, startDate);

      expect(result.period).toBe(ReportPeriod.WEEKLY);
    });

    it('should set 7-day date range', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateWeeklySummary(tenantId, startDate);

      const queryCall = mockQuery.mock.calls[0];
      const start = queryCall[1][2];
      const end = queryCall[1][3];

      // Code does: end.setDate(start.getDate() + 6)
      // This creates a 7-day range (start + 6 days = 7 days total)
      const daysDiff = Math.round((end - start) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(7); // Actually 7 days difference, not 6
    });

    it('should pass WEEKLY period type', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateWeeklySummary(tenantId, startDate);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([tenantId, ReportPeriod.WEEKLY])
      );
    });

    it('should log successful generation', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateWeeklySummary(tenantId, startDate);

      expect(mockLogger.info).toHaveBeenCalledWith('Generated weekly order summary', expect.any(Object));
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.generateWeeklySummary(tenantId, startDate)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('generateMonthlySummary', () => {
    const month = 3; // March
    const year = 2024;

    it('should generate monthly summary successfully', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ...sampleReportSummary, period: ReportPeriod.MONTHLY }] });

      const result = await service.generateMonthlySummary(tenantId, month, year);

      expect(result.period).toBe(ReportPeriod.MONTHLY);
    });

    it('should set correct month date range', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateMonthlySummary(tenantId, month, year);

      const queryCall = mockQuery.mock.calls[0];
      const start = queryCall[1][2];
      const end = queryCall[1][3];

      expect(start.getMonth()).toBe(2); // March (0-indexed)
      expect(start.getDate()).toBe(1);
      expect(end.getMonth()).toBe(2);
      expect(end.getDate()).toBe(31); // Last day of March
    });

    it('should handle February correctly', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateMonthlySummary(tenantId, 2, 2024); // Feb 2024 (leap year)

      const queryCall = mockQuery.mock.calls[0];
      const end = queryCall[1][3];

      expect(end.getDate()).toBe(29); // Leap year
    });

    it('should pass MONTHLY period type', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateMonthlySummary(tenantId, month, year);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([tenantId, ReportPeriod.MONTHLY])
      );
    });

    it('should log successful generation', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleReportSummary] });

      await service.generateMonthlySummary(tenantId, month, year);

      expect(mockLogger.info).toHaveBeenCalledWith('Generated monthly order summary', expect.any(Object));
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.generateMonthlySummary(tenantId, month, year)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getRevenueByEvent', () => {
    const eventId = 'event-123';
    const period = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    const revenueReport = {
      id: 'revenue-1',
      tenant_id: tenantId,
      entity_type: 'EVENT',
      entity_id: eventId,
      period: ReportPeriod.CUSTOM,
      start_date: period.startDate,
      end_date: period.endDate,
      total_revenue_cents: 100000,
      total_orders: 50,
      total_tickets_sold: 150,
      average_order_value_cents: 2000,
      top_ticket_types: [
        { ticketTypeId: 'ticket-1', quantitySold: 100, revenueCents: 80000 },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should get revenue by event successfully', async () => {
      mockQuery.mockResolvedValue({ rows: [revenueReport] });

      const result = await service.getRevenueByEvent(tenantId, eventId, period);

      expect(result.entityType).toBe('EVENT');
      expect(result.entityId).toBe(eventId);
      expect(result.totalRevenueCents).toBe(100000);
    });

    it('should filter by CONFIRMED and COMPLETED orders only', async () => {
      mockQuery.mockResolvedValue({ rows: [revenueReport] });

      await service.getRevenueByEvent(tenantId, eventId, period);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('CONFIRMED', 'COMPLETED')"),
        expect.any(Array)
      );
    });

    it('should aggregate ticket types', async () => {
      mockQuery.mockResolvedValue({ rows: [revenueReport] });

      const result = await service.getRevenueByEvent(tenantId, eventId, period);

      expect(result.topTicketTypes).toBeDefined();
      expect(Array.isArray(result.topTicketTypes)).toBe(true);
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getRevenueByEvent(tenantId, eventId, period)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getTopEventsByRevenue', () => {
    const limit = 10;
    const period = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    it('should return top events by revenue', async () => {
      const events = [
        {
          id: 'rev-1',
          tenant_id: tenantId,
          entity_type: 'EVENT',
          entity_id: 'event-1',
          period: ReportPeriod.CUSTOM,
          start_date: period.startDate,
          end_date: period.endDate,
          total_revenue_cents: 200000,
          total_orders: 100,
          total_tickets_sold: 300,
          average_order_value_cents: 2000,
          top_ticket_types: [],
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'rev-2',
          tenant_id: tenantId,
          entity_type: 'EVENT',
          entity_id: 'event-2',
          period: ReportPeriod.CUSTOM,
          start_date: period.startDate,
          end_date: period.endDate,
          total_revenue_cents: 150000,
          total_orders: 75,
          total_tickets_sold: 225,
          average_order_value_cents: 2000,
          top_ticket_types: [],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockQuery.mockResolvedValue({ rows: events });

      const result = await service.getTopEventsByRevenue(tenantId, limit, period);

      expect(result).toHaveLength(2);
      expect(result[0].totalRevenueCents).toBe(200000);
      expect(result[1].totalRevenueCents).toBe(150000);
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.getTopEventsByRevenue(tenantId, limit, period);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $5'),
        expect.arrayContaining([limit])
      );
    });

    it('should order by revenue DESC', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.getTopEventsByRevenue(tenantId, limit, period);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY total_revenue_cents DESC'),
        expect.any(Array)
      );
    });

    it('should filter by CONFIRMED and COMPLETED orders', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.getTopEventsByRevenue(tenantId, limit, period);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('CONFIRMED', 'COMPLETED')"),
        expect.any(Array)
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getTopEventsByRevenue(tenantId, limit, period)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getOrderStatsByStatus', () => {
    const period = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    it('should return order statistics', async () => {
      const stats = {
        total_orders: '100',
        total_revenue_cents: '500000',
        average_order_value_cents: '5000',
        orders_by_status: { confirmed: 70, pending: 30 },
        conversion_rate: '75.50',
      };

      mockQuery.mockResolvedValue({ rows: [stats] });

      const result = await service.getOrderStatsByStatus(tenantId, period);

      expect(result.totalOrders).toBe(100);
      expect(result.totalRevenueCents).toBe(500000);
      expect(result.averageOrderValueCents).toBe(5000);
      expect(result.ordersByStatus).toEqual({ confirmed: 70, pending: 30 });
      expect(result.conversionRate).toBe(75.50);
    });

    it('should handle null orders_by_status', async () => {
      const stats = {
        total_orders: '50',
        total_revenue_cents: '250000',
        average_order_value_cents: '5000',
        orders_by_status: null,
        conversion_rate: '80.00',
      };

      mockQuery.mockResolvedValue({ rows: [stats] });

      const result = await service.getOrderStatsByStatus(tenantId, period);

      expect(result.ordersByStatus).toEqual({});
    });

    it('should handle null conversion rate', async () => {
      const stats = {
        total_orders: '50',
        total_revenue_cents: '250000',
        average_order_value_cents: '5000',
        orders_by_status: {},
        conversion_rate: null,
      };

      mockQuery.mockResolvedValue({ rows: [stats] });

      const result = await service.getOrderStatsByStatus(tenantId, period);

      expect(result.conversionRate).toBe(0);
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getOrderStatsByStatus(tenantId, period)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getAverageOrderValue', () => {
    const period = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    it('should return average order value', async () => {
      mockQuery.mockResolvedValue({ rows: [{ average_order_value: '7500' }] });

      const result = await service.getAverageOrderValue(tenantId, period);

      expect(result).toBe(7500);
    });

    it('should filter by CONFIRMED and COMPLETED orders', async () => {
      mockQuery.mockResolvedValue({ rows: [{ average_order_value: '5000' }] });

      await service.getAverageOrderValue(tenantId, period);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('CONFIRMED', 'COMPLETED')"),
        expect.any(Array)
      );
    });

    it('should return 0 when no orders', async () => {
      mockQuery.mockResolvedValue({ rows: [{ average_order_value: '0' }] });

      const result = await service.getAverageOrderValue(tenantId, period);

      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getAverageOrderValue(tenantId, period)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getConversionRate', () => {
    const period = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    };

    it('should calculate conversion rate correctly', async () => {
      mockQuery.mockResolvedValue({ rows: [{ confirmed: '80', reserved: '100' }] });

      const result = await service.getConversionRate(tenantId, period);

      expect(result).toBe(80); // (80/100) * 100
    });

    it('should return 0 when no reserved orders', async () => {
      mockQuery.mockResolvedValue({ rows: [{ confirmed: '50', reserved: '0' }] });

      const result = await service.getConversionRate(tenantId, period);

      expect(result).toBe(0);
    });

    it('should handle zero confirmed orders', async () => {
      mockQuery.mockResolvedValue({ rows: [{ confirmed: '0', reserved: '100' }] });

      const result = await service.getConversionRate(tenantId, period);

      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getConversionRate(tenantId, period)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
