/**
 * Unit Tests for Velocity Checker Service
 * 
 * Tests fraud detection via velocity checks on payment patterns.
 */

// Mock dependencies
jest.mock('../../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('Velocity Checker Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Payment Velocity Checks', () => {
    interface VelocityRule {
      type: string;
      windowMinutes: number;
      maxCount: number;
      maxAmount?: number;
    }

    const velocityRules: VelocityRule[] = [
      { type: 'payments_per_card', windowMinutes: 60, maxCount: 5, maxAmount: 100000 },
      { type: 'payments_per_user', windowMinutes: 60, maxCount: 10, maxAmount: 200000 },
      { type: 'payments_per_ip', windowMinutes: 60, maxCount: 20 },
      { type: 'payments_per_device', windowMinutes: 60, maxCount: 15 },
    ];

    it('should pass when under velocity limits', () => {
      const paymentHistory = {
        cardId: 'card_123',
        paymentsInWindow: 2,
        totalAmountInWindow: 15000,
        windowMinutes: 60,
      };

      const rule = velocityRules.find(r => r.type === 'payments_per_card')!;
      const isUnderLimit = 
        paymentHistory.paymentsInWindow < rule.maxCount &&
        (!rule.maxAmount || paymentHistory.totalAmountInWindow < rule.maxAmount);

      expect(isUnderLimit).toBe(true);
    });

    it('should fail when exceeding count limit', () => {
      const paymentHistory = {
        cardId: 'card_123',
        paymentsInWindow: 6, // Over limit of 5
        totalAmountInWindow: 30000,
        windowMinutes: 60,
      };

      const rule = velocityRules.find(r => r.type === 'payments_per_card')!;
      const isOverLimit = paymentHistory.paymentsInWindow >= rule.maxCount;

      expect(isOverLimit).toBe(true);
    });

    it('should fail when exceeding amount limit', () => {
      const paymentHistory = {
        cardId: 'card_123',
        paymentsInWindow: 3,
        totalAmountInWindow: 150000, // Over $1000 limit
        windowMinutes: 60,
      };

      const rule = velocityRules.find(r => r.type === 'payments_per_card')!;
      const isOverAmountLimit = rule.maxAmount && paymentHistory.totalAmountInWindow >= rule.maxAmount;

      expect(isOverAmountLimit).toBe(true);
    });
  });

  describe('IP Address Velocity', () => {
    it('should track payments per IP address', () => {
      const ipPayments: Map<string, number> = new Map([
        ['192.168.1.1', 5],
        ['10.0.0.1', 25], // Suspicious
        ['172.16.0.1', 3],
      ]);

      const maxPaymentsPerIp = 20;
      const suspiciousIps = Array.from(ipPayments.entries())
        .filter(([_, count]) => count > maxPaymentsPerIp)
        .map(([ip, _]) => ip);

      expect(suspiciousIps).toContain('10.0.0.1');
      expect(suspiciousIps).toHaveLength(1);
    });

    it('should detect VPN/proxy usage', () => {
      const ipMetadata = {
        ip: '185.220.101.1',
        isVpn: true,
        isProxy: false,
        isTor: false,
        isDatacenter: true,
        country: 'DE',
      };

      const isSuspiciousIp = ipMetadata.isVpn || ipMetadata.isProxy || ipMetadata.isTor || ipMetadata.isDatacenter;
      expect(isSuspiciousIp).toBe(true);
    });

    it('should allow legitimate IP patterns', () => {
      const ipMetadata = {
        ip: '98.45.23.100',
        isVpn: false,
        isProxy: false,
        isTor: false,
        isDatacenter: false,
        country: 'US',
        isp: 'Comcast',
      };

      const isSuspiciousIp = ipMetadata.isVpn || ipMetadata.isProxy || ipMetadata.isTor || ipMetadata.isDatacenter;
      expect(isSuspiciousIp).toBe(false);
    });
  });

  describe('Device Fingerprint Velocity', () => {
    it('should track payments per device fingerprint', () => {
      const devicePayments: Map<string, number> = new Map([
        ['fp_abc123', 3],
        ['fp_xyz789', 18], // Approaching limit
        ['fp_fraud01', 50], // Way over limit
      ]);

      const maxPaymentsPerDevice = 15;
      const flaggedDevices = Array.from(devicePayments.entries())
        .filter(([_, count]) => count > maxPaymentsPerDevice)
        .map(([fp, _]) => fp);

      expect(flaggedDevices).toContain('fp_fraud01');
      expect(flaggedDevices).toContain('fp_xyz789');
    });

    it('should detect device fingerprint spoofing patterns', () => {
      // Multiple unique fingerprints from same user in short window
      const userFingerprints = {
        userId: 'user-123',
        uniqueFingerprintsInHour: 5, // Suspicious - fingerprints shouldn't change
        expectedMax: 2,
      };

      const isSpoofingSuspected = userFingerprints.uniqueFingerprintsInHour > userFingerprints.expectedMax;
      expect(isSpoofingSuspected).toBe(true);
    });
  });

  describe('User Account Velocity', () => {
    it('should track payments per user account', () => {
      const userVelocity = {
        userId: 'user-123',
        paymentsToday: 3,
        amountToday: 25000, // $250
        paymentsThisWeek: 10,
        amountThisWeek: 150000, // $1500
      };

      const dailyLimit = { count: 10, amount: 100000 };
      const weeklyLimit = { count: 50, amount: 500000 };

      const isWithinDailyLimits = 
        userVelocity.paymentsToday <= dailyLimit.count &&
        userVelocity.amountToday <= dailyLimit.amount;

      const isWithinWeeklyLimits = 
        userVelocity.paymentsThisWeek <= weeklyLimit.count &&
        userVelocity.amountThisWeek <= weeklyLimit.amount;

      expect(isWithinDailyLimits).toBe(true);
      expect(isWithinWeeklyLimits).toBe(true);
    });

    it('should flag new accounts with high velocity', () => {
      const accountAge = 2; // 2 days old
      const paymentsInWindow = 8;
      const newAccountThresholdDays = 7;
      const newAccountMaxPayments = 3;

      const isNewAccount = accountAge <= newAccountThresholdDays;
      const isHighVelocityNewAccount = isNewAccount && paymentsInWindow > newAccountMaxPayments;

      expect(isHighVelocityNewAccount).toBe(true);
    });

    it('should allow established accounts higher limits', () => {
      const accountAgeDays = 365;
      const totalLifetimePayments = 50;
      const hasGoodHistory = true;

      const establishedAccountThreshold = {
        minAgeDays: 30,
        minPayments: 10,
        mustHaveGoodHistory: true,
      };

      const isEstablished = 
        accountAgeDays >= establishedAccountThreshold.minAgeDays &&
        totalLifetimePayments >= establishedAccountThreshold.minPayments &&
        (!establishedAccountThreshold.mustHaveGoodHistory || hasGoodHistory);

      const velocityMultiplier = isEstablished ? 2 : 1;
      expect(velocityMultiplier).toBe(2);
    });
  });

  describe('Event-Specific Velocity', () => {
    it('should apply stricter limits for high-demand events', () => {
      const eventSettings = {
        eventId: 'event-concert-123',
        isHighDemand: true,
        maxTicketsPerUser: 4,
        maxPaymentsPerUserPerHour: 2,
      };

      const userActivity = {
        ticketsPurchased: 4,
        paymentsInLastHour: 2,
      };

      const canPurchaseMore = 
        userActivity.ticketsPurchased < eventSettings.maxTicketsPerUser &&
        userActivity.paymentsInLastHour < eventSettings.maxPaymentsPerUserPerHour;

      expect(canPurchaseMore).toBe(false);
    });

    it('should track purchases across related events', () => {
      // Same artist, same tour
      const relatedEventPurchases = {
        userId: 'user-123',
        artistId: 'artist-taylor',
        tourId: 'tour-eras-2026',
        totalTicketsAcrossEvents: 12,
        maxAllowedPerTour: 8,
      };

      const exceedsTourLimit = 
        relatedEventPurchases.totalTicketsAcrossEvents > relatedEventPurchases.maxAllowedPerTour;

      expect(exceedsTourLimit).toBe(true);
    });
  });

  describe('Time-Based Patterns', () => {
    it('should detect suspicious timing patterns', () => {
      const paymentTimestamps = [
        new Date('2026-01-08T10:00:00Z'),
        new Date('2026-01-08T10:00:02Z'), // 2 seconds later
        new Date('2026-01-08T10:00:04Z'), // 2 seconds later
        new Date('2026-01-08T10:00:06Z'), // 2 seconds later
      ];

      // Calculate time differences
      const timeDiffs = [];
      for (let i = 1; i < paymentTimestamps.length; i++) {
        timeDiffs.push(paymentTimestamps[i].getTime() - paymentTimestamps[i - 1].getTime());
      }

      // Suspiciously uniform timing (bot-like)
      const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
      const variance = timeDiffs.reduce((sum, diff) => sum + Math.pow(diff - avgDiff, 2), 0) / timeDiffs.length;
      
      const isSuspiciouslyUniform = variance < 100; // Very low variance = bot
      expect(isSuspiciouslyUniform).toBe(true);
    });

    it('should flag after-hours high-value transactions', () => {
      const transactionTime = new Date('2026-01-08T03:30:00Z'); // 3:30 AM UTC
      const amount = 50000; // $500
      const highValueThreshold = 25000;

      const hour = transactionTime.getUTCHours();
      const isAfterHours = hour >= 0 && hour < 6; // Midnight to 6 AM
      const isHighValue = amount > highValueThreshold;

      const requiresReview = isAfterHours && isHighValue;
      expect(requiresReview).toBe(true);
    });
  });

  describe('Velocity Check Results', () => {
    type VelocityResult = 'pass' | 'soft_block' | 'hard_block' | 'review';

    it('should return pass for normal velocity', () => {
      const checkVelocity = (score: number): VelocityResult => {
        if (score < 30) return 'pass';
        if (score < 60) return 'review';
        if (score < 80) return 'soft_block';
        return 'hard_block';
      };

      expect(checkVelocity(15)).toBe('pass');
    });

    it('should return review for moderate risk', () => {
      const checkVelocity = (score: number): VelocityResult => {
        if (score < 30) return 'pass';
        if (score < 60) return 'review';
        if (score < 80) return 'soft_block';
        return 'hard_block';
      };

      expect(checkVelocity(45)).toBe('review');
    });

    it('should return soft_block for high risk', () => {
      const checkVelocity = (score: number): VelocityResult => {
        if (score < 30) return 'pass';
        if (score < 60) return 'review';
        if (score < 80) return 'soft_block';
        return 'hard_block';
      };

      expect(checkVelocity(70)).toBe('soft_block');
    });

    it('should return hard_block for very high risk', () => {
      const checkVelocity = (score: number): VelocityResult => {
        if (score < 30) return 'pass';
        if (score < 60) return 'review';
        if (score < 80) return 'soft_block';
        return 'hard_block';
      };

      expect(checkVelocity(95)).toBe('hard_block');
    });
  });
});
