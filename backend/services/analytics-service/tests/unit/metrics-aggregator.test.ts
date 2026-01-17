/**
 * Metrics Aggregator Unit Tests
 */

// Mock database before imports
const mockSelect = jest.fn().mockReturnThis();
const mockJoin = jest.fn().mockReturnThis();
const mockWhere = jest.fn().mockReturnThis();
const mockWhereBetween = jest.fn().mockReturnThis();
const mockWhereNotNull = jest.fn().mockReturnThis();
const mockGroupBy = jest.fn().mockReturnThis();
const mockOrderBy = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockReturnThis();
const mockLeftJoin = jest.fn().mockReturnThis();
const mockRaw = jest.fn();

const mockDb = jest.fn(() => ({
  select: mockSelect,
  join: mockJoin,
  leftJoin: mockLeftJoin,
  where: mockWhere,
  whereBetween: mockWhereBetween,
  whereNotNull: mockWhereNotNull,
  groupBy: mockGroupBy,
  orderBy: mockOrderBy,
  limit: mockLimit,
  raw: mockRaw,
}));

mockDb.raw = mockRaw;

jest.mock('../../src/config/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

import { MetricsAggregator, AggregationOptions } from '../../src/analytics-engine/aggregators/metrics-aggregator';

describe('MetricsAggregator', () => {
  let aggregator: MetricsAggregator;

  const baseOptions: AggregationOptions = {
    venueId: 'venue-123',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-31'),
    granularity: 'day',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    aggregator = new MetricsAggregator();

    // Reset mock chain
    mockSelect.mockReturnThis();
    mockJoin.mockReturnThis();
    mockLeftJoin.mockReturnThis();
    mockWhere.mockReturnThis();
    mockWhereBetween.mockReturnThis();
    mockWhereNotNull.mockReturnThis();
    mockGroupBy.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockResolvedValue([]);
  });

  describe('aggregateSalesMetrics', () => {
    it('should validate granularity', async () => {
      const invalidOptions = { ...baseOptions, granularity: 'invalid' as any };

      await expect(aggregator.aggregateSalesMetrics(invalidOptions)).rejects.toThrow(
        'Invalid granularity'
      );
    });

    it('should accept valid granularities', async () => {
      const validGranularities = ['hour', 'day', 'week', 'month'];
      mockOrderBy.mockResolvedValue([]);

      for (const granularity of validGranularities) {
        const options = { ...baseOptions, granularity: granularity as any };
        await expect(aggregator.aggregateSalesMetrics(options)).resolves.not.toThrow();
      }
    });

    it('should return enhanced metrics with growth calculations', async () => {
      mockOrderBy.mockResolvedValueOnce([
        { period: '2024-01-01', tickets_sold: '100', revenue: '5000', unique_customers: '80', avg_ticket_price: '50' },
        { period: '2024-01-02', tickets_sold: '120', revenue: '6000', unique_customers: '90', avg_ticket_price: '50' },
      ]);

      const result = await aggregator.aggregateSalesMetrics(baseOptions);

      expect(result).toHaveLength(2);
      expect(result[0].growth).toBeNull(); // First period has no previous
      expect(result[1].growth).toBeDefined();
      expect(result[1].growth.revenue).toBeDefined();
      expect(result[1].growth.tickets).toBeDefined();
    });

    it('should parse numeric values correctly', async () => {
      mockOrderBy.mockResolvedValueOnce([
        { period: '2024-01-01', tickets_sold: '150', revenue: '7500.50', unique_customers: '100', avg_ticket_price: '50.00' },
      ]);

      const result = await aggregator.aggregateSalesMetrics(baseOptions);

      expect(result[0].ticketsSold).toBe(150);
      expect(result[0].revenue).toBe(7500.50);
      expect(result[0].uniqueCustomers).toBe(100);
      expect(result[0].avgTicketPrice).toBe(50.00);
    });
  });

  describe('aggregateCustomerMetrics', () => {
    it('should calculate customer segments correctly', async () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      const oldDate = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000); // 120 days ago

      mockGroupBy.mockResolvedValueOnce([
        { user_id: 'u1', purchase_count: 1, total_spent: '100', first_purchase: recentDate, last_purchase: recentDate },
        { user_id: 'u2', purchase_count: 5, total_spent: '600', first_purchase: oldDate, last_purchase: oldDate },
        { user_id: 'u3', purchase_count: 2, total_spent: '200', first_purchase: oldDate, last_purchase: recentDate },
      ]);

      const result = await aggregator.aggregateCustomerMetrics(baseOptions);

      expect(result.totalCustomers).toBe(3);
      expect(result.segments).toBeDefined();
      expect(result.segments.newCustomers).toBeGreaterThanOrEqual(0);
      expect(result.segments.vipCustomers).toBeGreaterThanOrEqual(0);
      expect(result.segments.atRiskCustomers).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average order value', async () => {
      mockGroupBy.mockResolvedValueOnce([
        { user_id: 'u1', purchase_count: 2, total_spent: '200', first_purchase: new Date(), last_purchase: new Date() },
        { user_id: 'u2', purchase_count: 3, total_spent: '300', first_purchase: new Date(), last_purchase: new Date() },
      ]);

      const result = await aggregator.aggregateCustomerMetrics(baseOptions);

      expect(result.avgOrderValue).toBe(250); // (200 + 300) / 2
    });

    it('should handle empty customer data', async () => {
      mockGroupBy.mockResolvedValueOnce([]);

      const result = await aggregator.aggregateCustomerMetrics(baseOptions);

      expect(result.totalCustomers).toBe(0);
      expect(result.avgOrderValue).toBe(0);
      expect(result.avgPurchaseFrequency).toBe(0);
    });
  });

  describe('aggregateEventPerformance', () => {
    it('should return formatted event data', async () => {
      mockLimit.mockResolvedValueOnce([
        {
          id: 'e1',
          name: 'Concert A',
          start_date: '2024-01-15',
          capacity: 1000,
          tickets_sold: '800',
          revenue: '40000',
          capacity_utilization: '80.00',
        },
      ]);

      const result = await aggregator.aggregateEventPerformance(
        'venue-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'e1',
        name: 'Concert A',
        date: '2024-01-15',
        capacity: 1000,
        ticketsSold: 800,
        revenue: 40000,
        capacityUtilization: '80.00',
      });
    });

    it('should limit results to 20 events', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await aggregator.aggregateEventPerformance(
        'venue-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(mockLimit).toHaveBeenCalledWith(20);
    });

    it('should order by revenue descending', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await aggregator.aggregateEventPerformance(
        'venue-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(mockOrderBy).toHaveBeenCalledWith('revenue', 'desc');
    });
  });

  describe('getDateTruncExpression', () => {
    it('should return correct expression for hour', () => {
      const expr = (aggregator as any).getDateTruncExpression('hour');
      expect(expr).toContain('hour');
    });

    it('should return correct expression for day', () => {
      const expr = (aggregator as any).getDateTruncExpression('day');
      expect(expr).toContain('day');
    });

    it('should return correct expression for week', () => {
      const expr = (aggregator as any).getDateTruncExpression('week');
      expect(expr).toContain('week');
    });

    it('should return correct expression for month', () => {
      const expr = (aggregator as any).getDateTruncExpression('month');
      expect(expr).toContain('month');
    });

    it('should default to day for unknown granularity', () => {
      const expr = (aggregator as any).getDateTruncExpression('unknown');
      expect(expr).toContain('day');
    });
  });

  describe('enhanceWithCalculatedMetrics', () => {
    it('should calculate growth between periods', () => {
      const results = [
        { period: '2024-01-01', tickets_sold: '100', revenue: '5000', unique_customers: '80', avg_ticket_price: '50' },
        { period: '2024-01-02', tickets_sold: '150', revenue: '7500', unique_customers: '100', avg_ticket_price: '50' },
      ];

      const enhanced = (aggregator as any).enhanceWithCalculatedMetrics(results);

      expect(enhanced[1].growth.revenue).toBe('50.00'); // 50% growth
      expect(enhanced[1].growth.tickets).toBe('50.00'); // 50% growth
    });

    it('should handle zero values in growth calculation', () => {
      const results = [
        { period: '2024-01-01', tickets_sold: '0', revenue: '0', unique_customers: '0', avg_ticket_price: '0' },
        { period: '2024-01-02', tickets_sold: '100', revenue: '5000', unique_customers: '50', avg_ticket_price: '50' },
      ];

      const enhanced = (aggregator as any).enhanceWithCalculatedMetrics(results);

      // Should handle division by zero gracefully (Infinity becomes string)
      expect(enhanced[1].growth).toBeDefined();
    });
  });
});
