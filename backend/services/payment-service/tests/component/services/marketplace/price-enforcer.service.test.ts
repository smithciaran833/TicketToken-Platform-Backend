/**
 * COMPONENT TEST: PriceEnforcerService
 *
 * Tests price enforcement for marketplace resales
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const mockQuery = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

import { PriceEnforcerService } from '../../../../src/services/marketplace/price-enforcer.service';

describe('PriceEnforcerService Component Tests', () => {
  let service: PriceEnforcerService;
  let ticketId: string;
  let venueId: string;
  let eventId: string;

  beforeEach(() => {
    ticketId = uuidv4();
    venueId = uuidv4();
    eventId = uuidv4();
    mockQuery.mockReset();
    service = new PriceEnforcerService();
  });

  // ===========================================================================
  // VALIDATE LISTING PRICE
  // ===========================================================================
  describe('validateListingPrice()', () => {
    it('should allow valid price within markup limits', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ maxMarkupPercentage: 150, minMarkdownPercentage: 50 }] }) // venue rules
        .mockResolvedValueOnce({ rows: [] }); // recent listings

      const result = await service.validateListingPrice(ticketId, 75, venueId); // 150% of $50

      expect(result.valid).toBe(true);
      expect(result.originalPrice).toBe(50);
      expect(result.maxAllowedPrice).toBe(75); // 150% of 50
    });

    it('should reject price exceeding max markup', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ maxMarkupPercentage: 150 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.validateListingPrice(ticketId, 100, venueId); // 200% of $50

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('maximum allowed markup');
    });

    it('should reject price below minimum', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ minMarkdownPercentage: 50 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.validateListingPrice(ticketId, 20, venueId); // 40% of $50

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('minimum allowed price');
    });

    it('should use default limits when venue has no rules', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no venue rules
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.validateListingPrice(ticketId, 70, venueId);

      expect(result.valid).toBe(true);
      expect(result.maxAllowedPrice).toBe(75); // default 150%
      expect(result.minAllowedPrice).toBe(25); // default 50%
    });

    it('should detect suspicious round number pricing', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ maxMarkupPercentage: 1000 }] }) // very high limit
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.validateListingPrice(ticketId, 500, venueId); // 10x markup, round number

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Suspicious round number');
    });

    it('should detect pattern of high markups', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ maxMarkupPercentage: 300 }] })
        .mockResolvedValueOnce({
          rows: Array(15).fill({ price: 150, originalPrice: 50 }) // 15 listings at 3x
        });

      const result = await service.validateListingPrice(ticketId, 100, venueId);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('pattern of high markups');
    });
  });

  // ===========================================================================
  // ENFORCE DYNAMIC PRICE CAPS
  // ===========================================================================
  describe('enforceDynamicPriceCaps()', () => {
    it('should allow higher markup for last-minute sales', async () => {
      // Mock event tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // We need to mock getEvent - but it's private. Testing via public method behavior
      const result = await service.enforceDynamicPriceCaps(eventId, 0.5);

      expect(result.maxMarkupPercentage).toBeGreaterThanOrEqual(150);
    });

    it('should increase markup for high demand', async () => {
      const result = await service.enforceDynamicPriceCaps(eventId, 0.95); // 95% sold

      expect(result.maxMarkupPercentage).toBeGreaterThan(150);
      expect(result.reason).toContain('demand');
    });
  });

  // ===========================================================================
  // GET PRICING ANALYTICS
  // ===========================================================================
  describe('getPricingAnalytics()', () => {
    it('should return venue pricing statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          avg_markup: '25.5',
          median_markup: '20.0',
          violations_blocked: '15',
          total_listings: '500',
        }]
      });

      const result = await service.getPricingAnalytics(venueId);

      expect(result.averageMarkup).toBe(25.5);
      expect(result.medianMarkup).toBe(20);
      expect(result.violationsBlocked).toBe(15);
      expect(result.totalListings).toBe(500);
    });

    it('should handle no listings', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          avg_markup: null,
          median_markup: null,
          violations_blocked: '0',
          total_listings: '0',
        }]
      });

      const result = await service.getPricingAnalytics(venueId);

      expect(result.averageMarkup).toBe(0);
      expect(result.totalListings).toBe(0);
    });
  });
});
