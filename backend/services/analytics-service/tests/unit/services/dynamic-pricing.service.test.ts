/**
 * Dynamic Pricing Service Unit Tests
 */

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

const mockDb = { raw: jest.fn() };

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

const mockDemandTrackerService = {
  calculateDemand: jest.fn(),
};

jest.mock('../../../src/services/demand-tracker.service', () => ({
  demandTrackerService: mockDemandTrackerService,
}));

import { DynamicPricingService, dynamicPricingService } from '../../../src/services/dynamic-pricing.service';

describe('DynamicPricingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DynamicPricingService.getInstance();
      const instance2 = DynamicPricingService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('calculateOptimalPrice', () => {
    const defaultRules = { enabled: true, minMultiplier: 0.8, maxMultiplier: 1.5, adjustmentFrequency: 60, requireApproval: false, aggressiveness: 0.5 };

    it('should return base price when dynamic pricing is disabled', async () => {
      const rules = { ...defaultRules, enabled: false };

      const result = await dynamicPricingService.calculateOptimalPrice('event-123', 10000, rules);

      expect(result).toEqual(expect.objectContaining({
        eventId: 'event-123',
        currentPrice: 10000,
        recommendedPrice: 10000,
        confidence: 1.0,
        reasoning: ['Dynamic pricing disabled'],
      }));
    });

    it('should increase price for high demand', async () => {
      mockDemandTrackerService.calculateDemand.mockResolvedValue({
        salesVelocity: 10,
        sellThroughRate: 0.8,
        timeUntilEvent: 20,
        priceElasticity: 1.0,
        ticketsSold: 800,
      });

      const result = await dynamicPricingService.calculateOptimalPrice('event-123', 10000, defaultRules);

      expect(result.recommendedPrice).toBeGreaterThan(10000);
      expect(result.demandScore).toBeGreaterThan(70);
      expect(result.reasoning).toContain(expect.stringContaining('High'));
    });

    it('should decrease price for low demand', async () => {
      mockDemandTrackerService.calculateDemand.mockResolvedValue({
        salesVelocity: 0.5,
        sellThroughRate: 0.2,
        timeUntilEvent: 200,
        priceElasticity: 1.0,
        ticketsSold: 50,
      });

      const result = await dynamicPricingService.calculateOptimalPrice('event-123', 10000, defaultRules);

      expect(result.recommendedPrice).toBeLessThan(10000);
      expect(result.demandScore).toBeLessThan(30);
    });

    it('should respect min/max multiplier bounds', async () => {
      mockDemandTrackerService.calculateDemand.mockResolvedValue({
        salesVelocity: 50,
        sellThroughRate: 0.99,
        timeUntilEvent: 2,
        priceElasticity: 0.5,
        ticketsSold: 990,
      });

      const rules = { ...defaultRules, maxMultiplier: 1.2 };
      const result = await dynamicPricingService.calculateOptimalPrice('event-123', 10000, rules);

      expect(result.recommendedPrice).toBeLessThanOrEqual(12000);
    });

    it('should adjust for high price elasticity', async () => {
      mockDemandTrackerService.calculateDemand.mockResolvedValue({
        salesVelocity: 8,
        sellThroughRate: 0.7,
        timeUntilEvent: 48,
        priceElasticity: 2.0,
        ticketsSold: 700,
      });

      const result = await dynamicPricingService.calculateOptimalPrice('event-123', 10000, defaultRules);

      expect(result.reasoning).toContain('High price sensitivity detected');
    });

    it('should factor in time until event', async () => {
      mockDemandTrackerService.calculateDemand.mockResolvedValue({
        salesVelocity: 5,
        sellThroughRate: 0.5,
        timeUntilEvent: 12,
        priceElasticity: 1.0,
        ticketsSold: 500,
      });

      const result = await dynamicPricingService.calculateOptimalPrice('event-123', 10000, defaultRules);

      expect(result.reasoning).toContain(expect.stringContaining('Event in'));
    });
  });

  describe('getVenuePricingRules', () => {
    it('should return pricing rules from database', async () => {
      mockDb.raw.mockResolvedValue({
        rows: [{
          dynamic_pricing_enabled: true,
          price_min_multiplier: 0.85,
          price_max_multiplier: 1.8,
          price_adjustment_frequency: 30,
          price_require_approval: true,
          price_aggressiveness: 0.7,
        }],
      });

      const result = await dynamicPricingService.getVenuePricingRules('venue-123');

      expect(result).toEqual({
        enabled: true,
        minMultiplier: 0.85,
        maxMultiplier: 1.8,
        adjustmentFrequency: 30,
        requireApproval: true,
        aggressiveness: 0.7,
      });
    });

    it('should return default rules when venue not found', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });

      const result = await dynamicPricingService.getVenuePricingRules('nonexistent');

      expect(result).toEqual({
        enabled: false,
        minMultiplier: 0.9,
        maxMultiplier: 2.0,
        adjustmentFrequency: 60,
        requireApproval: true,
        aggressiveness: 0.5,
      });
    });

    it('should handle database errors', async () => {
      mockDb.raw.mockRejectedValue(new Error('Database error'));

      await expect(dynamicPricingService.getVenuePricingRules('venue-123')).rejects.toThrow('Database error');
    });
  });

  describe('applyPriceChange', () => {
    it('should insert price history and update event', async () => {
      mockDb.raw.mockResolvedValue({ rowCount: 1 });

      await dynamicPricingService.applyPriceChange('event-123', 12000, 'High demand');

      expect(mockDb.raw).toHaveBeenCalledTimes(2);
      expect(mockDb.raw).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO price_history'),
        ['event-123', 12000, 'High demand']
      );
      expect(mockDb.raw).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE events SET price_cents'),
        [12000, 'event-123']
      );
    });

    it('should handle errors during price change', async () => {
      mockDb.raw.mockRejectedValue(new Error('Update failed'));

      await expect(dynamicPricingService.applyPriceChange('event-123', 12000, 'Test'))
        .rejects.toThrow('Update failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
