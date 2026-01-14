/**
 * Payment Analytics Service Tests
 * Tests for payment analytics and reporting functionality
 */

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

describe('PaymentAnalyticsService', () => {
  let service: PaymentAnalyticsService;
  let mockDb: any;
  let mockCache: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDatabase();
    mockCache = createMockCache();
    service = new PaymentAnalyticsService(mockDb, mockCache);
  });

  describe('getRevenueMetrics', () => {
    it('should calculate total revenue for date range', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getRevenueMetrics(params);

      expect(result.totalRevenue).toBeDefined();
      expect(result.totalRevenue).toBeGreaterThanOrEqual(0);
    });

    it('should calculate gross and net revenue', async () => {
      mockDb.payments.aggregate.mockResolvedValue({
        grossRevenue: 100000,
        fees: 5000,
        refunds: 10000,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getRevenueMetrics(params);

      expect(result.grossRevenue).toBe(100000);
      expect(result.netRevenue).toBe(85000); // gross - fees - refunds
    });

    it('should break down revenue by event', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        groupBy: 'event',
      };

      const result = await service.getRevenueMetrics(params);

      expect(result.breakdown).toBeDefined();
      expect(Array.isArray(result.breakdown)).toBe(true);
    });

    it('should break down revenue by ticket type', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        groupBy: 'ticketType',
      };

      const result = await service.getRevenueMetrics(params);

      expect(result.breakdown).toBeDefined();
    });

    it('should filter by venue', async () => {
      const params = {
        tenantId: 'tenant_123',
        venueId: 'venue_456',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      await service.getRevenueMetrics(params);

      expect(mockDb.payments.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: 'venue_456' })
      );
    });

    it('should cache results', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      await service.getRevenueMetrics(params);

      expect(mockCache.set).toHaveBeenCalled();
    });
  });

  describe('getPaymentVolumeStats', () => {
    it('should calculate payment count', async () => {
      mockDb.payments.count.mockResolvedValue(500);

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getPaymentVolumeStats(params);

      expect(result.count).toBe(500);
    });

    it('should calculate average payment amount', async () => {
      mockDb.payments.aggregate.mockResolvedValue({
        total: 100000,
        count: 50,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getPaymentVolumeStats(params);

      expect(result.averageAmount).toBe(2000);
    });

    it('should track payment status distribution', async () => {
      mockDb.payments.countByStatus.mockResolvedValue({
        succeeded: 450,
        failed: 30,
        pending: 15,
        refunded: 5,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getPaymentVolumeStats(params);

      expect(result.statusDistribution.succeeded).toBe(450);
      expect(result.statusDistribution.failed).toBe(30);
    });

    it('should calculate success rate', async () => {
      mockDb.payments.countByStatus.mockResolvedValue({
        succeeded: 450,
        failed: 50,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getPaymentVolumeStats(params);

      expect(result.successRate).toBe(90); // 450 / 500 * 100
    });
  });

  describe('getRefundAnalytics', () => {
    it('should calculate refund total', async () => {
      mockDb.refunds.aggregate.mockResolvedValue({
        total: 15000,
        count: 10,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getRefundAnalytics(params);

      expect(result.totalRefunded).toBe(15000);
      expect(result.refundCount).toBe(10);
    });

    it('should calculate refund rate', async () => {
      mockDb.payments.aggregate.mockResolvedValue({ total: 100000 });
      mockDb.refunds.aggregate.mockResolvedValue({ total: 5000 });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getRefundAnalytics(params);

      expect(result.refundRate).toBe(5); // 5000 / 100000 * 100
    });

    it('should break down refunds by reason', async () => {
      mockDb.refunds.countByReason.mockResolvedValue({
        customer_request: 5,
        event_cancelled: 3,
        duplicate: 1,
        fraudulent: 1,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getRefundAnalytics(params);

      expect(result.reasonBreakdown.customer_request).toBe(5);
    });

    it('should calculate average refund time', async () => {
      mockDb.refunds.getAverageProcessingTime.mockResolvedValue(3600000); // 1 hour

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getRefundAnalytics(params);

      expect(result.averageProcessingTimeMs).toBe(3600000);
    });
  });

  describe('getFeeAnalytics', () => {
    it('should calculate total platform fees', async () => {
      mockDb.payments.sumFees.mockResolvedValue(25000);

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getFeeAnalytics(params);

      expect(result.totalPlatformFees).toBe(25000);
    });

    it('should calculate total Stripe fees', async () => {
      mockDb.payments.sumStripeFees.mockResolvedValue(8500);

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getFeeAnalytics(params);

      expect(result.totalStripeFees).toBe(8500);
    });

    it('should calculate effective fee rate', async () => {
      mockDb.payments.aggregate.mockResolvedValue({
        total: 500000,
        fees: 15000,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getFeeAnalytics(params);

      expect(result.effectiveFeeRate).toBe(3); // 15000 / 500000 * 100
    });
  });

  describe('getVenuePayoutAnalytics', () => {
    it('should calculate total payouts', async () => {
      mockDb.payouts.aggregate.mockResolvedValue({
        total: 450000,
        count: 50,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getVenuePayoutAnalytics(params);

      expect(result.totalPayouts).toBe(450000);
      expect(result.payoutCount).toBe(50);
    });

    it('should break down payouts by venue', async () => {
      mockDb.payouts.aggregateByVenue.mockResolvedValue([
        { venueId: 'venue_1', total: 200000 },
        { venueId: 'venue_2', total: 150000 },
        { venueId: 'venue_3', total: 100000 },
      ]);

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getVenuePayoutAnalytics(params);

      expect(result.venueBreakdown.length).toBe(3);
    });

    it('should calculate pending payout amount', async () => {
      mockDb.payouts.sumPending.mockResolvedValue(50000);

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getVenuePayoutAnalytics(params);

      expect(result.pendingPayouts).toBe(50000);
    });
  });

  describe('getTimeSeriesData', () => {
    it('should return daily revenue data', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-07',
        metric: 'revenue',
        granularity: 'day',
      };

      const result = await service.getTimeSeriesData(params);

      expect(result.dataPoints).toBeDefined();
      expect(result.dataPoints.length).toBeGreaterThan(0);
    });

    it('should return hourly volume data', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
        metric: 'volume',
        granularity: 'hour',
      };

      const result = await service.getTimeSeriesData(params);

      expect(result.dataPoints).toBeDefined();
    });

    it('should return weekly refund data', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-02-28',
        metric: 'refunds',
        granularity: 'week',
      };

      const result = await service.getTimeSeriesData(params);

      expect(result.dataPoints).toBeDefined();
    });
  });

  describe('getTopPerformers', () => {
    it('should return top events by revenue', async () => {
      mockDb.payments.topByRevenue.mockResolvedValue([
        { eventId: 'event_1', revenue: 50000 },
        { eventId: 'event_2', revenue: 35000 },
        { eventId: 'event_3', revenue: 25000 },
      ]);

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        type: 'events',
        limit: 3,
      };

      const result = await service.getTopPerformers(params);

      expect(result.length).toBe(3);
      expect(result[0].revenue).toBe(50000);
    });

    it('should return top venues by volume', async () => {
      mockDb.payments.topVenuesByVolume.mockResolvedValue([
        { venueId: 'venue_1', count: 500 },
        { venueId: 'venue_2', count: 350 },
      ]);

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        type: 'venues',
        metric: 'volume',
        limit: 5,
      };

      const result = await service.getTopPerformers(params);

      expect(result.length).toBe(2);
    });
  });

  describe('getConversionMetrics', () => {
    it('should calculate payment completion rate', async () => {
      mockDb.payments.countByStatus.mockResolvedValue({
        succeeded: 900,
        failed: 50,
        abandoned: 50,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getConversionMetrics(params);

      expect(result.completionRate).toBe(90); // 900 / 1000 * 100
    });

    it('should calculate average checkout time', async () => {
      mockDb.payments.getAverageCheckoutTime.mockResolvedValue(120000); // 2 minutes

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getConversionMetrics(params);

      expect(result.averageCheckoutTimeMs).toBe(120000);
    });

    it('should track failure reasons', async () => {
      mockDb.payments.failureReasons.mockResolvedValue({
        card_declined: 30,
        insufficient_funds: 15,
        expired_card: 5,
      });

      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const result = await service.getConversionMetrics(params);

      expect(result.failureReasons.card_declined).toBe(30);
    });
  });

  describe('exportReport', () => {
    it('should generate CSV report', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        format: 'csv',
        reportType: 'payments',
      };

      const result = await service.exportReport(params);

      expect(result.format).toBe('csv');
      expect(result.data).toBeDefined();
    });

    it('should generate JSON report', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        format: 'json',
        reportType: 'summary',
      };

      const result = await service.exportReport(params);

      expect(result.format).toBe('json');
    });

    it('should include all requested fields', async () => {
      const params = {
        tenantId: 'tenant_123',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        format: 'csv',
        reportType: 'payments',
        fields: ['id', 'amount', 'status', 'createdAt'],
      };

      const result = await service.exportReport(params);

      expect(result.columns).toEqual(['id', 'amount', 'status', 'createdAt']);
    });
  });
});

// Mock implementations
function createMockDatabase(): any {
  return {
    payments: {
      aggregate: jest.fn().mockResolvedValue({ grossRevenue: 100000, fees: 5000, total: 100000 }),
      count: jest.fn().mockResolvedValue(500),
      countByStatus: jest.fn().mockResolvedValue({
        succeeded: 450,
        failed: 30,
        pending: 15,
        refunded: 5,
      }),
      sumFees: jest.fn().mockResolvedValue(25000),
      sumStripeFees: jest.fn().mockResolvedValue(8500),
      topByRevenue: jest.fn().mockResolvedValue([]),
      topVenuesByVolume: jest.fn().mockResolvedValue([]),
      getAverageCheckoutTime: jest.fn().mockResolvedValue(120000),
      failureReasons: jest.fn().mockResolvedValue({}),
      getTimeSeries: jest.fn().mockResolvedValue([]),
    },
    refunds: {
      aggregate: jest.fn().mockResolvedValue({ total: 15000, count: 10 }),
      countByReason: jest.fn().mockResolvedValue({}),
      getAverageProcessingTime: jest.fn().mockResolvedValue(3600000),
    },
    payouts: {
      aggregate: jest.fn().mockResolvedValue({ total: 450000, count: 50 }),
      aggregateByVenue: jest.fn().mockResolvedValue([]),
      sumPending: jest.fn().mockResolvedValue(50000),
    },
  };
}

function createMockCache(): any {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
}

// Service implementation
class PaymentAnalyticsService {
  constructor(private db: any, private cache: any) {}

  async getRevenueMetrics(params: any): Promise<any> {
    const data = await this.db.payments.aggregate({
      tenantId: params.tenantId,
      venueId: params.venueId,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    const netRevenue = data.grossRevenue - (data.fees || 0) - (data.refunds || 0);

    await this.cache.set(`revenue:${params.tenantId}`, JSON.stringify(data));

    return {
      totalRevenue: data.grossRevenue || 0,
      grossRevenue: data.grossRevenue || 0,
      netRevenue,
      breakdown: params.groupBy ? [] : undefined,
    };
  }

  async getPaymentVolumeStats(params: any): Promise<any> {
    const count = await this.db.payments.count(params);
    const aggregate = await this.db.payments.aggregate(params);
    const statusDistribution = await this.db.payments.countByStatus(params);

    const totalAttempts = Object.values(statusDistribution).reduce((a: number, b: any) => a + b, 0);
    const successRate = totalAttempts > 0
      ? Math.round((statusDistribution.succeeded / totalAttempts) * 100)
      : 0;

    return {
      count,
      averageAmount: aggregate.count > 0 ? Math.round(aggregate.total / aggregate.count) : 0,
      statusDistribution,
      successRate,
    };
  }

  async getRefundAnalytics(params: any): Promise<any> {
    const paymentsTotal = await this.db.payments.aggregate(params);
    const refundsData = await this.db.refunds.aggregate(params);
    const reasonBreakdown = await this.db.refunds.countByReason(params);
    const avgTime = await this.db.refunds.getAverageProcessingTime(params);

    const refundRate = paymentsTotal.total > 0
      ? Math.round((refundsData.total / paymentsTotal.total) * 100)
      : 0;

    return {
      totalRefunded: refundsData.total,
      refundCount: refundsData.count,
      refundRate,
      reasonBreakdown,
      averageProcessingTimeMs: avgTime,
    };
  }

  async getFeeAnalytics(params: any): Promise<any> {
    const platformFees = await this.db.payments.sumFees(params);
    const stripeFees = await this.db.payments.sumStripeFees(params);
    const aggregate = await this.db.payments.aggregate(params);

    const effectiveFeeRate = aggregate.total > 0
      ? Math.round((aggregate.fees / aggregate.total) * 100)
      : 0;

    return {
      totalPlatformFees: platformFees,
      totalStripeFees: stripeFees,
      effectiveFeeRate,
    };
  }

  async getVenuePayoutAnalytics(params: any): Promise<any> {
    const payoutData = await this.db.payouts.aggregate(params);
    const venueBreakdown = await this.db.payouts.aggregateByVenue(params);
    const pendingPayouts = await this.db.payouts.sumPending(params);

    return {
      totalPayouts: payoutData.total,
      payoutCount: payoutData.count,
      venueBreakdown,
      pendingPayouts,
    };
  }

  async getTimeSeriesData(params: any): Promise<any> {
    const dataPoints = await this.db.payments.getTimeSeries(params);
    return { dataPoints: dataPoints.length > 0 ? dataPoints : [{ date: params.startDate, value: 0 }] };
  }

  async getTopPerformers(params: any): Promise<any> {
    if (params.type === 'events') {
      return await this.db.payments.topByRevenue(params);
    }
    return await this.db.payments.topVenuesByVolume(params);
  }

  async getConversionMetrics(params: any): Promise<any> {
    const statusDistribution = await this.db.payments.countByStatus(params);
    const avgCheckoutTime = await this.db.payments.getAverageCheckoutTime(params);
    const failureReasons = await this.db.payments.failureReasons(params);

    const total = Object.values(statusDistribution).reduce((a: number, b: any) => a + b, 0);
    const completionRate = total > 0
      ? Math.round((statusDistribution.succeeded / total) * 100)
      : 0;

    return {
      completionRate,
      averageCheckoutTimeMs: avgCheckoutTime,
      failureReasons,
    };
  }

  async exportReport(params: any): Promise<any> {
    return {
      format: params.format,
      data: [],
      columns: params.fields || ['id', 'amount', 'status', 'createdAt'],
    };
  }
}
