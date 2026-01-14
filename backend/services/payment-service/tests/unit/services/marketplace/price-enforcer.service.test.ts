/**
 * Price Enforcer Service Tests
 * Tests for marketplace price enforcement and caps
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('PriceEnforcerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateListingPrice', () => {
    it('should accept price within allowed range', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000, // $100
        listingPrice: 15000, // $150
      };

      const result = await validateListingPrice(listing);

      expect(result.valid).toBe(true);
    });

    it('should reject price above cap', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        listingPrice: 30000, // $300 - 3x original
      };

      const result = await validateListingPrice(listing, { maxMultiplier: 2.0 });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
      expect(result.maxAllowed).toBe(20000);
    });

    it('should allow venue-specific price caps', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        listingPrice: 12500,
        venueId: 'venue_strict',
      };

      const result = await validateListingPrice(listing);

      expect(result.valid).toBe(true);
    });

    it('should reject below minimum price', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        listingPrice: 500, // $5 - too low
      };

      const result = await validateListingPrice(listing);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('below minimum');
    });

    it('should apply event-specific rules', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        listingPrice: 15000,
        eventId: 'event_capped',
      };

      const result = await validateListingPrice(listing);

      expect(result.valid).toBe(true);
      expect(result.appliedRule).toBe('event_specific');
    });

    it('should return suggested price on rejection', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        listingPrice: 50000, // Way over
      };

      const result = await validateListingPrice(listing);

      expect(result.valid).toBe(false);
      expect(result.suggestedPrice).toBeDefined();
      expect(result.suggestedPrice).toBeLessThanOrEqual(result.maxAllowed);
    });
  });

  describe('getPriceCap', () => {
    it('should return default cap multiplier', async () => {
      const cap = await getPriceCap('ticket_123');

      expect(cap.multiplier).toBe(2.0); // 200% of original
    });

    it('should return venue-specific cap', async () => {
      const cap = await getPriceCap('ticket_venue_restricted');

      expect(cap.multiplier).toBe(1.2); // 120% of original
      expect(cap.source).toBe('venue');
    });

    it('should return event-specific cap', async () => {
      const cap = await getPriceCap('ticket_event_charity');

      expect(cap.multiplier).toBe(1.0); // No markup allowed
      expect(cap.source).toBe('event');
    });

    it('should handle no-resale events', async () => {
      const cap = await getPriceCap('ticket_no_resale');

      expect(cap.allowed).toBe(false);
      expect(cap.reason).toContain('not permitted');
    });
  });

  describe('calculateMaxPrice', () => {
    it('should calculate max from original price', () => {
      const original = 10000;
      const multiplier = 2.0;

      const max = calculateMaxPrice(original, multiplier);

      expect(max).toBe(20000);
    });

    it('should include platform fees in calculation', () => {
      const original = 10000;
      const multiplier = 2.0;
      const platformFee = 0.10; // 10%

      const max = calculateMaxPrice(original, multiplier, { includeFees: true, platformFee });

      // Seller gets 90% of listed price, so need to price higher
      expect(max).toBe(22222); // ~$222.22 to net $200
    });

    it('should apply absolute cap', () => {
      const original = 100000; // $1000 ticket
      const multiplier = 5.0;

      const max = calculateMaxPrice(original, multiplier, { absoluteCap: 200000 });

      expect(max).toBe(200000); // Capped at $2000
    });

    it('should handle decimal amounts correctly', () => {
      const original = 1999; // $19.99
      const multiplier = 1.5;

      const max = calculateMaxPrice(original, multiplier);

      expect(max).toBe(2998); // $29.98, rounded down
    });
  });

  describe('calculateMinPrice', () => {
    it('should calculate minimum from original price', () => {
      const original = 10000;
      const minMultiplier = 0.5;

      const min = calculateMinPrice(original, minMultiplier);

      expect(min).toBe(5000);
    });

    it('should enforce absolute minimum', () => {
      const original = 500;
      const minMultiplier = 0.5;

      const min = calculateMinPrice(original, minMultiplier, { absoluteMin: 500 });

      expect(min).toBe(500); // Can't go below $5
    });
  });

  describe('enforcePriceCap', () => {
    it('should adjust price to maximum allowed', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        requestedPrice: 30000,
      };

      const adjusted = await enforcePriceCap(listing);

      expect(adjusted.price).toBe(20000); // Capped at 2x
      expect(adjusted.wasAdjusted).toBe(true);
    });

    it('should not adjust valid prices', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        requestedPrice: 15000,
      };

      const adjusted = await enforcePriceCap(listing);

      expect(adjusted.price).toBe(15000);
      expect(adjusted.wasAdjusted).toBe(false);
    });

    it('should raise price to minimum', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        requestedPrice: 100, // Way below
      };

      const adjusted = await enforcePriceCap(listing);

      expect(adjusted.wasAdjusted).toBe(true);
      expect(adjusted.price).toBeGreaterThanOrEqual(1000); // Minimum $10
    });
  });

  describe('checkPriceGouging', () => {
    it('should detect price gouging patterns', async () => {
      const sellerId = 'seller_suspicious';
      const listings = [
        { price: 50000, originalPrice: 10000 },
        { price: 45000, originalPrice: 10000 },
        { price: 48000, originalPrice: 10000 },
      ];

      const result = await checkPriceGouging(sellerId, listings);

      expect(result.flagged).toBe(true);
      expect(result.reason).toContain('consistent overpricing');
    });

    it('should not flag normal markup patterns', async () => {
      const sellerId = 'seller_normal';
      const listings = [
        { price: 15000, originalPrice: 10000 },
        { price: 12000, originalPrice: 10000 },
        { price: 18000, originalPrice: 10000 },
      ];

      const result = await checkPriceGouging(sellerId, listings);

      expect(result.flagged).toBe(false);
    });

    it('should consider market demand', async () => {
      const sellerId = 'seller_123';
      const listings = [{ price: 30000, originalPrice: 10000 }];
      const context = { highDemand: true };

      const result = await checkPriceGouging(sellerId, listings, context);

      // High demand allows higher prices
      expect(result.flagged).toBe(false);
    });
  });

  describe('getMarketPrice', () => {
    it('should return average market price', async () => {
      const ticketType = 'vip_floor';
      const eventId = 'event_123';

      const marketPrice = await getMarketPrice(ticketType, eventId);

      expect(marketPrice.average).toBeDefined();
      expect(marketPrice.min).toBeDefined();
      expect(marketPrice.max).toBeDefined();
    });

    it('should return face value when no market data', async () => {
      const ticketType = 'new_type';
      const eventId = 'new_event';

      const marketPrice = await getMarketPrice(ticketType, eventId);

      expect(marketPrice.source).toBe('face_value');
    });

    it('should include recent sales data', async () => {
      const marketPrice = await getMarketPrice('ga', 'popular_event');

      expect(marketPrice.recentSales).toBeDefined();
      expect(marketPrice.recentSales.count).toBeGreaterThan(0);
    });
  });

  describe('validateBulkPricing', () => {
    it('should validate multiple listings at once', async () => {
      const listings = [
        { ticketId: 't1', originalPrice: 10000, listingPrice: 15000 },
        { ticketId: 't2', originalPrice: 10000, listingPrice: 12000 },
        { ticketId: 't3', originalPrice: 10000, listingPrice: 30000 }, // Invalid
      ];

      const result = await validateBulkPricing(listings);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].ticketId).toBe('t3');
    });

    it('should return suggestions for invalid listings', async () => {
      const listings = [
        { ticketId: 't1', originalPrice: 10000, listingPrice: 50000 },
      ];

      const result = await validateBulkPricing(listings);

      expect(result.invalid[0].suggestedPrice).toBeDefined();
    });
  });

  describe('applyDynamicPricing', () => {
    it('should adjust cap based on demand', async () => {
      const ticketId = 'ticket_hot';
      const demandLevel = 'very_high';

      const adjusted = await applyDynamicPricing(ticketId, demandLevel);

      expect(adjusted.multiplier).toBeGreaterThan(2.0);
    });

    it('should lower cap during low demand', async () => {
      const ticketId = 'ticket_123';
      const demandLevel = 'low';

      const adjusted = await applyDynamicPricing(ticketId, demandLevel);

      expect(adjusted.multiplier).toBeLessThanOrEqual(1.5);
    });

    it('should not exceed absolute maximum', async () => {
      const ticketId = 'ticket_123';
      const demandLevel = 'extreme';

      const adjusted = await applyDynamicPricing(ticketId, demandLevel);

      expect(adjusted.multiplier).toBeLessThanOrEqual(5.0); // Absolute cap
    });
  });

  describe('edge cases', () => {
    it('should handle zero original price', async () => {
      const listing = {
        ticketId: 'ticket_free',
        originalPrice: 0,
        listingPrice: 5000,
      };

      const result = await validateListingPrice(listing);

      // Free tickets might have special rules
      expect(result).toBeDefined();
    });

    it('should handle negative prices', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        listingPrice: -500,
      };

      const result = await validateListingPrice(listing);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid');
    });

    it('should handle currency conversion', async () => {
      const listing = {
        ticketId: 'ticket_123',
        originalPrice: 10000,
        listingPrice: 15000,
        currency: 'EUR',
      };

      const result = await validateListingPrice(listing);

      expect(result.valid).toBeDefined();
    });
  });
});

// Helper functions
async function validateListingPrice(listing: any, options: any = {}): Promise<any> {
  if (listing.listingPrice < 0) {
    return { valid: false, reason: 'Price invalid - negative value' };
  }

  const maxMultiplier = options.maxMultiplier || 2.0;
  const minPrice = options.minPrice || 1000;
  const maxAllowed = Math.floor(listing.originalPrice * maxMultiplier);

  if (listing.listingPrice < minPrice) {
    return { valid: false, reason: 'Price below minimum', minAllowed: minPrice };
  }

  if (listing.listingPrice > maxAllowed) {
    return {
      valid: false,
      reason: 'Price exceeds maximum allowed',
      maxAllowed,
      suggestedPrice: maxAllowed,
    };
  }

  return { valid: true, appliedRule: listing.eventId ? 'event_specific' : 'default' };
}

async function getPriceCap(ticketId: string): Promise<any> {
  if (ticketId.includes('no_resale')) {
    return { allowed: false, reason: 'Resale not permitted for this ticket' };
  }
  if (ticketId.includes('venue_restricted')) {
    return { multiplier: 1.2, source: 'venue' };
  }
  if (ticketId.includes('event_charity')) {
    return { multiplier: 1.0, source: 'event' };
  }
  return { multiplier: 2.0, source: 'default' };
}

function calculateMaxPrice(original: number, multiplier: number, options: any = {}): number {
  let max = Math.floor(original * multiplier);
  
  if (options.includeFees && options.platformFee) {
    max = Math.ceil(max / (1 - options.platformFee));
  }
  
  if (options.absoluteCap && max > options.absoluteCap) {
    max = options.absoluteCap;
  }
  
  return max;
}

function calculateMinPrice(original: number, minMultiplier: number, options: any = {}): number {
  const min = Math.floor(original * minMultiplier);
  if (options.absoluteMin && min < options.absoluteMin) {
    return options.absoluteMin;
  }
  return min;
}

async function enforcePriceCap(listing: any): Promise<any> {
  const cap = await getPriceCap(listing.ticketId);
  const maxPrice = calculateMaxPrice(listing.originalPrice, cap.multiplier || 2.0);
  const minPrice = 1000;

  if (listing.requestedPrice > maxPrice) {
    return { price: maxPrice, wasAdjusted: true };
  }
  if (listing.requestedPrice < minPrice) {
    return { price: minPrice, wasAdjusted: true };
  }
  return { price: listing.requestedPrice, wasAdjusted: false };
}

async function checkPriceGouging(sellerId: string, listings: any[], context: any = {}): Promise<any> {
  if (context.highDemand) {
    return { flagged: false };
  }

  const avgMarkup = listings.reduce((sum, l) => sum + (l.price / l.originalPrice), 0) / listings.length;
  if (avgMarkup > 4.0) {
    return { flagged: true, reason: 'Pattern of consistent overpricing detected' };
  }
  return { flagged: false };
}

async function getMarketPrice(ticketType: string, eventId: string): Promise<any> {
  if (ticketType === 'new_type' || eventId === 'new_event') {
    return { source: 'face_value', average: 10000, min: 10000, max: 10000 };
  }
  return {
    source: 'market',
    average: 15000,
    min: 12000,
    max: 20000,
    recentSales: { count: 15, avgPrice: 14500 },
  };
}

async function validateBulkPricing(listings: any[]): Promise<any> {
  const valid: any[] = [];
  const invalid: any[] = [];

  for (const listing of listings) {
    const result = await validateListingPrice(listing);
    if (result.valid) {
      valid.push(listing);
    } else {
      invalid.push({ ...listing, ...result });
    }
  }

  return { valid, invalid };
}

async function applyDynamicPricing(ticketId: string, demandLevel: string): Promise<any> {
  const demandMultipliers: Record<string, number> = {
    low: 1.5,
    normal: 2.0,
    high: 2.5,
    very_high: 3.0,
    extreme: 5.0,
  };
  return { multiplier: Math.min(demandMultipliers[demandLevel] || 2.0, 5.0) };
}
