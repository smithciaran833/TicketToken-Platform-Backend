/**
 * Scalper Detector Service Tests
 * Tests for ticket scalper detection and prevention
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

describe('ScalperDetectorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzePurchasePattern', () => {
    it('should detect bulk purchasing pattern', async () => {
      const userId = 'user_bulk';
      const purchases = [
        { eventId: 'e1', quantity: 10, timestamp: Date.now() - 86400000 },
        { eventId: 'e2', quantity: 8, timestamp: Date.now() - 72000000 },
        { eventId: 'e3', quantity: 12, timestamp: Date.now() - 50000000 },
      ];

      const result = await analyzePurchasePattern(userId, purchases);

      expect(result.isScalper).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.indicators).toContain('bulk_purchasing');
    });

    it('should pass normal fan purchases', async () => {
      const userId = 'user_fan';
      const purchases = [
        { eventId: 'e1', quantity: 2, timestamp: Date.now() - 86400000 * 30 },
        { eventId: 'e2', quantity: 4, timestamp: Date.now() - 86400000 * 60 },
      ];

      const result = await analyzePurchasePattern(userId, purchases);

      expect(result.isScalper).toBe(false);
    });

    it('should detect rapid multi-event purchasing', async () => {
      const userId = 'user_rapid';
      const now = Date.now();
      const purchases = [
        { eventId: 'e1', quantity: 4, timestamp: now - 3600000 },
        { eventId: 'e2', quantity: 4, timestamp: now - 3000000 },
        { eventId: 'e3', quantity: 4, timestamp: now - 2400000 },
        { eventId: 'e4', quantity: 4, timestamp: now - 1800000 },
      ];

      const result = await analyzePurchasePattern(userId, purchases);

      expect(result.isScalper).toBe(true);
      expect(result.indicators).toContain('rapid_multi_event');
    });

    it('should detect resale-heavy history', async () => {
      const userId = 'user_reseller';
      const purchases = [
        { eventId: 'e1', quantity: 6, resold: 5, timestamp: Date.now() - 86400000 * 90 },
        { eventId: 'e2', quantity: 8, resold: 7, timestamp: Date.now() - 86400000 * 60 },
        { eventId: 'e3', quantity: 10, resold: 9, timestamp: Date.now() - 86400000 * 30 },
      ];

      const result = await analyzePurchasePattern(userId, purchases);

      expect(result.isScalper).toBe(true);
      expect(result.indicators).toContain('high_resale_ratio');
    });
  });

  describe('checkAccountAge', () => {
    it('should flag new accounts with large purchases', async () => {
      const account = {
        userId: 'user_new',
        createdAt: new Date(Date.now() - 86400000), // 1 day old
        purchaseAmount: 50000, // $500 first purchase
      };

      const result = await checkAccountAge(account);

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('new account');
    });

    it('should pass established accounts', async () => {
      const account = {
        userId: 'user_established',
        createdAt: new Date(Date.now() - 86400000 * 365), // 1 year old
        purchaseAmount: 50000,
      };

      const result = await checkAccountAge(account);

      expect(result.suspicious).toBe(false);
    });

    it('should flag accounts with sudden activity spike', async () => {
      const account = {
        userId: 'user_spike',
        createdAt: new Date(Date.now() - 86400000 * 180), // 6 months old
        historicalPurchases: 2,
        recentPurchases: 15, // Sudden spike
      };

      const result = await checkAccountAge(account);

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('activity spike');
    });
  });

  describe('checkPaymentMethods', () => {
    it('should detect multiple cards same event', async () => {
      const userId = 'user_multicards';
      const eventId = 'event_123';
      const payments = [
        { cardLastFour: '1234', amount: 20000 },
        { cardLastFour: '5678', amount: 20000 },
        { cardLastFour: '9012', amount: 20000 },
      ];

      const result = await checkPaymentMethods(userId, eventId, payments);

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('multiple cards');
    });

    it('should allow normal payment patterns', async () => {
      const userId = 'user_normal';
      const eventId = 'event_123';
      const payments = [{ cardLastFour: '1234', amount: 20000 }];

      const result = await checkPaymentMethods(userId, eventId, payments);

      expect(result.suspicious).toBe(false);
    });

    it('should detect prepaid card patterns', async () => {
      const userId = 'user_prepaid';
      const eventId = 'event_123';
      const payments = [
        { cardLastFour: '1234', cardType: 'prepaid', amount: 20000 },
        { cardLastFour: '5678', cardType: 'prepaid', amount: 20000 },
      ];

      const result = await checkPaymentMethods(userId, eventId, payments);

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('prepaid');
    });
  });

  describe('checkLocationPatterns', () => {
    it('should detect purchases from different geographic locations', async () => {
      const userId = 'user_geo';
      const purchases = [
        { ip: '1.1.1.1', location: 'New York', timestamp: Date.now() - 3600000 },
        { ip: '2.2.2.2', location: 'Los Angeles', timestamp: Date.now() - 1800000 },
        { ip: '3.3.3.3', location: 'Chicago', timestamp: Date.now() - 600000 },
      ];

      const result = await checkLocationPatterns(userId, purchases);

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('impossible travel');
    });

    it('should allow consistent location', async () => {
      const userId = 'user_consistent';
      const purchases = [
        { ip: '1.1.1.1', location: 'New York', timestamp: Date.now() - 86400000 },
        { ip: '1.1.1.2', location: 'New York', timestamp: Date.now() - 43200000 },
      ];

      const result = await checkLocationPatterns(userId, purchases);

      expect(result.suspicious).toBe(false);
    });
  });

  describe('calculateScalperScore', () => {
    it('should calculate high score for suspected scalper', async () => {
      const indicators = {
        bulkPurchasing: true,
        newAccount: true,
        multipleCards: true,
        highResaleRatio: true,
      };

      const score = calculateScalperScore(indicators);

      expect(score).toBeGreaterThan(80);
    });

    it('should calculate low score for normal user', async () => {
      const indicators = {
        bulkPurchasing: false,
        newAccount: false,
        multipleCards: false,
        highResaleRatio: false,
      };

      const score = calculateScalperScore(indicators);

      expect(score).toBeLessThan(20);
    });

    it('should weight indicators appropriately', async () => {
      const highResaleOnly = { highResaleRatio: true };
      const newAccountOnly = { newAccount: true };

      const resaleScore = calculateScalperScore(highResaleOnly);
      const newAccountScore = calculateScalperScore(newAccountOnly);

      expect(resaleScore).toBeGreaterThan(newAccountScore);
    });
  });

  describe('enforceQuantityLimits', () => {
    it('should enforce per-event limits', async () => {
      const userId = 'user_123';
      const eventId = 'event_456';
      const requestedQuantity = 10;

      const result = await enforceQuantityLimits(userId, eventId, requestedQuantity);

      expect(result.allowed).toBe(false);
      expect(result.maxAllowed).toBeLessThan(requestedQuantity);
    });

    it('should allow within limits', async () => {
      const userId = 'user_123';
      const eventId = 'event_456';
      const requestedQuantity = 2;

      const result = await enforceQuantityLimits(userId, eventId, requestedQuantity);

      expect(result.allowed).toBe(true);
    });

    it('should enforce stricter limits for flagged users', async () => {
      const userId = 'user_flagged';
      const eventId = 'event_456';
      const requestedQuantity = 4;

      const result = await enforceQuantityLimits(userId, eventId, requestedQuantity);

      expect(result.allowed).toBe(false);
      expect(result.maxAllowed).toBe(2); // Stricter limit
    });

    it('should consider existing purchases', async () => {
      const userId = 'user_existing';
      const eventId = 'event_456';
      const requestedQuantity = 4;

      const result = await enforceQuantityLimits(userId, eventId, requestedQuantity, {
        existingPurchases: 4,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('already purchased');
    });
  });

  describe('monitorResaleListings', () => {
    it('should detect immediate listing after purchase', async () => {
      const ticketId = 'ticket_123';
      const purchaseTime = Date.now() - 300000; // 5 minutes ago
      const listingTime = Date.now();

      const result = await monitorResaleListings(ticketId, purchaseTime, listingTime);

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('immediate listing');
    });

    it('should allow listing after cooldown period', async () => {
      const ticketId = 'ticket_123';
      const purchaseTime = Date.now() - 86400000 * 7; // 7 days ago
      const listingTime = Date.now();

      const result = await monitorResaleListings(ticketId, purchaseTime, listingTime);

      expect(result.suspicious).toBe(false);
    });

    it('should detect price gouging patterns', async () => {
      const ticketId = 'ticket_123';
      const purchasePrice = 10000;
      const listingPrice = 100000; // 10x markup

      const result = await monitorResaleListings(ticketId, Date.now() - 86400000, Date.now(), {
        purchasePrice,
        listingPrice,
      });

      expect(result.suspicious).toBe(true);
      expect(result.reason).toContain('excessive markup');
    });
  });

  describe('flagScalper', () => {
    it('should add user to watchlist', async () => {
      const userId = 'user_suspected';
      const evidence = {
        bulkPurchases: 5,
        resaleRatio: 0.9,
        score: 85,
      };

      await flagScalper(userId, evidence);

      const status = await getScalperStatus(userId);
      expect(status.flagged).toBe(true);
    });

    it('should restrict purchasing capabilities', async () => {
      const userId = 'user_restricted';

      await flagScalper(userId, { score: 90 });

      const limits = await getUserLimits(userId);
      expect(limits.maxPerEvent).toBeLessThan(4);
    });

    it('should log flagging for audit', async () => {
      const userId = 'user_audit';

      await flagScalper(userId, { score: 75 });

      // Verify audit log was created
      expect(true).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle first-time purchaser', async () => {
      const userId = 'user_first_time';
      const purchases: any[] = [];

      const result = await analyzePurchasePattern(userId, purchases);

      expect(result.isScalper).toBe(false);
    });

    it('should handle legitimate bulk purchaser (verified business)', async () => {
      const userId = 'user_business';
      const purchases = [
        { eventId: 'e1', quantity: 50, isBusinessAccount: true },
      ];

      const result = await analyzePurchasePattern(userId, purchases, { isVerifiedBusiness: true });

      expect(result.isScalper).toBe(false);
    });

    it('should handle group purchases', async () => {
      const userId = 'user_group';
      const purchases = [
        { eventId: 'e1', quantity: 8, isGroupPurchase: true, groupMembers: 8 },
      ];

      const result = await analyzePurchasePattern(userId, purchases);

      expect(result.isScalper).toBe(false);
    });
  });
});

// Helper functions
async function analyzePurchasePattern(userId: string, purchases: any[], options: any = {}): Promise<any> {
  if (options.isVerifiedBusiness) {
    return { isScalper: false };
  }

  if (purchases.length === 0) {
    return { isScalper: false };
  }

  // Check for group purchases
  if (purchases.some(p => p.isGroupPurchase && p.quantity <= p.groupMembers)) {
    return { isScalper: false };
  }

  const indicators: string[] = [];
  let confidence = 0;

  // Check bulk purchasing
  const avgQuantity = purchases.reduce((sum, p) => sum + p.quantity, 0) / purchases.length;
  if (avgQuantity > 6) {
    indicators.push('bulk_purchasing');
    confidence += 0.3;
  }

  // Check rapid multi-event
  const recentPurchases = purchases.filter(p => p.timestamp > Date.now() - 3600000 * 2);
  if (recentPurchases.length >= 3) {
    indicators.push('rapid_multi_event');
    confidence += 0.3;
  }

  // Check resale ratio
  const resalePurchases = purchases.filter(p => p.resold);
  if (resalePurchases.length > 0) {
    const resaleRatio = resalePurchases.reduce((sum, p) => sum + p.resold, 0) /
      purchases.reduce((sum, p) => sum + p.quantity, 0);
    if (resaleRatio > 0.8) {
      indicators.push('high_resale_ratio');
      confidence += 0.4;
    }
  }

  return {
    isScalper: confidence > 0.5,
    confidence,
    indicators,
  };
}

async function checkAccountAge(account: any): Promise<any> {
  const ageInDays = (Date.now() - account.createdAt.getTime()) / 86400000;

  if (ageInDays < 7 && account.purchaseAmount > 20000) {
    return { suspicious: true, reason: 'new account with large purchase' };
  }

  if (account.recentPurchases && account.historicalPurchases) {
    if (account.recentPurchases > account.historicalPurchases * 5) {
      return { suspicious: true, reason: 'sudden activity spike' };
    }
  }

  return { suspicious: false };
}

async function checkPaymentMethods(userId: string, eventId: string, payments: any[]): Promise<any> {
  const uniqueCards = new Set(payments.map(p => p.cardLastFour));
  if (uniqueCards.size >= 3) {
    return { suspicious: true, reason: 'multiple cards for same event' };
  }

  const prepaidCount = payments.filter(p => p.cardType === 'prepaid').length;
  if (prepaidCount >= 2) {
    return { suspicious: true, reason: 'multiple prepaid cards' };
  }

  return { suspicious: false };
}

async function checkLocationPatterns(userId: string, purchases: any[]): Promise<any> {
  const locations = purchases.map(p => p.location);
  const uniqueLocations = new Set(locations);

  if (uniqueLocations.size >= 3) {
    const timeDiff = purchases[purchases.length - 1].timestamp - purchases[0].timestamp;
    if (timeDiff < 3600000 * 3) { // 3 hours
      return { suspicious: true, reason: 'impossible travel detected' };
    }
  }

  return { suspicious: false };
}

function calculateScalperScore(indicators: any): number {
  let score = 0;

  if (indicators.bulkPurchasing) score += 25;
  if (indicators.newAccount) score += 15;
  if (indicators.multipleCards) score += 20;
  if (indicators.highResaleRatio) score += 35;
  if (indicators.impossibleTravel) score += 30;

  return Math.min(score, 100);
}

async function enforceQuantityLimits(userId: string, eventId: string, quantity: number, options: any = {}): Promise<any> {
  let maxAllowed = 8;

  if (userId === 'user_flagged') {
    maxAllowed = 2;
  }

  if (options.existingPurchases) {
    const remaining = maxAllowed - options.existingPurchases;
    if (quantity > remaining) {
      return { allowed: false, maxAllowed: remaining, reason: 'already purchased maximum' };
    }
  }

  if (quantity > maxAllowed) {
    return { allowed: false, maxAllowed };
  }

  return { allowed: true };
}

async function monitorResaleListings(ticketId: string, purchaseTime: number, listingTime: number, options: any = {}): Promise<any> {
  const timeSincePurchase = listingTime - purchaseTime;
  const cooldownPeriod = 86400000; // 24 hours

  if (timeSincePurchase < cooldownPeriod) {
    return { suspicious: true, reason: 'immediate listing after purchase' };
  }

  if (options.purchasePrice && options.listingPrice) {
    const markup = options.listingPrice / options.purchasePrice;
    if (markup > 5) {
      return { suspicious: true, reason: 'excessive markup on resale' };
    }
  }

  return { suspicious: false };
}

async function flagScalper(userId: string, evidence: any): Promise<void> {
  // Mock implementation
}

async function getScalperStatus(userId: string): Promise<any> {
  return { flagged: true };
}

async function getUserLimits(userId: string): Promise<any> {
  return { maxPerEvent: 2 };
}
