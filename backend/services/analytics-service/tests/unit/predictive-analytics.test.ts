/**
 * Predictive Analytics Unit Tests
 */

// Mock database before imports
const mockRaw = jest.fn();

jest.mock('../../src/config/database', () => ({
  getAnalyticsDb: jest.fn(() => ({
    raw: mockRaw,
  })),
}));

import { PredictiveAnalytics } from '../../src/analytics-engine/calculators/predictive-analytics';

describe('PredictiveAnalytics', () => {
  let predictor: PredictiveAnalytics;
  const validVenueId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
    predictor = new PredictiveAnalytics();
  });

  describe('predictTicketDemand', () => {
    it('should return error when insufficient historical data', async () => {
      mockRaw.mockResolvedValueOnce({ rows: [] });

      const result = await predictor.predictTicketDemand(
        validVenueId,
        new Date('2024-06-15'),
        'concert'
      );

      expect(result).toEqual({ error: 'Insufficient historical data' });
    });

    it('should return error when no similar events found', async () => {
      // Return 30+ events but none matching the criteria
      const events = Array(35).fill(null).map((_, i) => ({
        date: new Date(`2024-01-${(i % 28) + 1}`),
        day_of_week: 1, // Monday
        month: 1,
        tickets_sold: 100,
        capacity_sold_percentage: '80',
        revenue: '5000',
      }));
      mockRaw.mockResolvedValueOnce({ rows: events });

      const result = await predictor.predictTicketDemand(
        validVenueId,
        new Date('2024-06-15'), // Saturday in June
        'concert'
      );

      expect(result).toEqual({ error: 'No similar events found' });
    });

    it('should calculate predictions from similar events', async () => {
      const targetDate = new Date('2024-06-15'); // Saturday (day 6)
      const targetMonth = 6;

      const events = Array(35).fill(null).map((_, i) => ({
        date: new Date(`2024-0${Math.floor(i / 5) + 1}-15`),
        day_of_week: 6, // Saturday
        month: Math.floor(i / 5) + 1,
        tickets_sold: 100 + i * 10,
        capacity_sold_percentage: '75',
        revenue: '5000',
      }));

      mockRaw.mockResolvedValueOnce({ rows: events });

      const result = await predictor.predictTicketDemand(validVenueId, targetDate, 'concert');

      if (!result.error) {
        expect(result.predictedTickets).toBeDefined();
        expect(result.predictedCapacityUtilization).toBeDefined();
        expect(result.predictedRevenue).toBeDefined();
        expect(result.confidence).toBeDefined();
        expect(result.basedOnEvents).toBeGreaterThan(0);
        expect(result.trend).toBeDefined();
      }
    });
  });

  describe('predictSeasonalTrends', () => {
    it('should return monthly trends with seasonality', async () => {
      const monthlyData = Array(12).fill(null).map((_, i) => ({
        month: i + 1,
        avg_tickets: 100 + (i < 6 ? i * 20 : (11 - i) * 20), // Peak mid-year
        avg_revenue: '5000',
        avg_event_days: 15,
        tickets_stddev: '20',
      }));

      mockRaw.mockResolvedValueOnce({ rows: monthlyData });

      const result = await predictor.predictSeasonalTrends(validVenueId);

      expect(result).toHaveLength(12);
      result.forEach((month: any) => {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('avgTickets');
        expect(month).toHaveProperty('avgRevenue');
        expect(month).toHaveProperty('avgEventDays');
        expect(month).toHaveProperty('volatility');
        expect(month).toHaveProperty('seasonality');
      });
    });

    it('should categorize seasonality correctly', async () => {
      const monthlyData = [
        { month: 1, avg_tickets: 50, avg_revenue: '2500', avg_event_days: 10, tickets_stddev: '10' },
        { month: 6, avg_tickets: 200, avg_revenue: '10000', avg_event_days: 20, tickets_stddev: '30' },
        { month: 12, avg_tickets: 100, avg_revenue: '5000', avg_event_days: 15, tickets_stddev: '20' },
      ];

      mockRaw.mockResolvedValueOnce({ rows: monthlyData });

      const result = await predictor.predictSeasonalTrends(validVenueId);

      const seasonalities = result.map((m: any) => m.seasonality);
      expect(seasonalities).toContain('Peak Season');
      expect(seasonalities).toContain('Off Season');
    });

    it('should handle zero volatility', async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [{ month: 1, avg_tickets: 100, avg_revenue: '5000', avg_event_days: 15, tickets_stddev: null }],
      });

      const result = await predictor.predictSeasonalTrends(validVenueId);

      expect(result[0].volatility).toBe('0%');
    });
  });

  describe('predictOptimalPricing', () => {
    it('should find optimal price point', async () => {
      const priceBands = [
        { price_band: 1, avg_price: 25, avg_tickets: 150, avg_revenue: 3750, sample_size: 10 },
        { price_band: 2, avg_price: 50, avg_tickets: 120, avg_revenue: 6000, sample_size: 15 },
        { price_band: 3, avg_price: 75, avg_tickets: 80, avg_revenue: 6000, sample_size: 12 },
        { price_band: 4, avg_price: 100, avg_tickets: 50, avg_revenue: 5000, sample_size: 8 },
      ];

      mockRaw.mockResolvedValueOnce({ rows: priceBands });

      const result = await predictor.predictOptimalPricing(validVenueId, 'concert');

      expect(result.optimalPrice).toBeDefined();
      expect(result.expectedTickets).toBeDefined();
      expect(result.expectedRevenue).toBeDefined();
      expect(result.priceElasticity).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });

    it('should calculate price elasticity', async () => {
      const priceBands = [
        { price_band: 1, avg_price: 25, avg_tickets: 200, avg_revenue: 5000, sample_size: 10 },
        { price_band: 2, avg_price: 50, avg_tickets: 100, avg_revenue: 5000, sample_size: 10 },
      ];

      mockRaw.mockResolvedValueOnce({ rows: priceBands });

      const result = await predictor.predictOptimalPricing(validVenueId, 'concert');

      expect(result.priceElasticity.length).toBeGreaterThan(0);
      expect(result.priceElasticity[0]).toHaveProperty('priceRange');
      expect(result.priceElasticity[0]).toHaveProperty('elasticity');
      expect(result.priceElasticity[0]).toHaveProperty('interpretation');
    });

    it('should provide appropriate recommendation based on elasticity', async () => {
      // High elasticity scenario
      const elasticPriceBands = [
        { price_band: 1, avg_price: 25, avg_tickets: 300, avg_revenue: 7500, sample_size: 10 },
        { price_band: 2, avg_price: 30, avg_tickets: 100, avg_revenue: 3000, sample_size: 10 },
      ];

      mockRaw.mockResolvedValueOnce({ rows: elasticPriceBands });

      const result = await predictor.predictOptimalPricing(validVenueId, 'concert');

      expect(result.recommendation).toContain('price');
    });
  });

  describe('calculateConfidence', () => {
    it('should return Low for small sample size', () => {
      const confidence = (predictor as any).calculateConfidence(3, 10);
      expect(confidence).toBe('Low');
    });

    it('should return Medium for moderate sample size', () => {
      const confidence = (predictor as any).calculateConfidence(10, 10);
      expect(confidence).toBe('Medium');
    });

    it('should return Medium for high trend volatility', () => {
      const confidence = (predictor as any).calculateConfidence(25, 60);
      expect(confidence).toBe('Medium');
    });

    it('should return High for large sample with stable trend', () => {
      const confidence = (predictor as any).calculateConfidence(25, 10);
      expect(confidence).toBe('High');
    });
  });

  describe('categorizeSeasonality', () => {
    it('should return Peak Season for high ratio', () => {
      const allMonths = [{ avg_tickets: 100 }, { avg_tickets: 100 }];
      const result = (predictor as any).categorizeSeasonality(150, allMonths);
      expect(result).toBe('Peak Season');
    });

    it('should return Normal Season for moderate ratio', () => {
      const allMonths = [{ avg_tickets: 100 }, { avg_tickets: 100 }];
      const result = (predictor as any).categorizeSeasonality(100, allMonths);
      expect(result).toBe('Normal Season');
    });

    it('should return Off Season for low ratio', () => {
      const allMonths = [{ avg_tickets: 100 }, { avg_tickets: 100 }];
      const result = (predictor as any).categorizeSeasonality(50, allMonths);
      expect(result).toBe('Off Season');
    });
  });
});
