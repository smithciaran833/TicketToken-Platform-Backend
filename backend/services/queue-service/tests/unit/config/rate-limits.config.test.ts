describe('Config - Rate Limits Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const getModule = () => {
    return require('../../../src/config/rate-limits.config');
  };

  describe('RATE_LIMITS structure', () => {
    it('should be defined', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS).toBeDefined();
    });

    it('should have all provider configurations', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS).toHaveProperty('stripe');
      expect(RATE_LIMITS).toHaveProperty('square');
      expect(RATE_LIMITS).toHaveProperty('sendgrid');
      expect(RATE_LIMITS).toHaveProperty('twilio');
      expect(RATE_LIMITS).toHaveProperty('solana');
      expect(RATE_LIMITS).toHaveProperty('quickbooks');
      expect(RATE_LIMITS).toHaveProperty('internal');
    });

    it('should have exactly 7 provider configurations', () => {
      const { RATE_LIMITS } = getModule();
      expect(Object.keys(RATE_LIMITS)).toHaveLength(7);
    });

    it('should have required properties for all providers', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        expect(config).toHaveProperty('maxPerSecond');
        expect(config).toHaveProperty('maxConcurrent');
      });
    });

    it('should have numeric maxPerSecond for all providers', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        expect(typeof config.maxPerSecond).toBe('number');
      });
    });

    it('should have numeric maxConcurrent for all providers', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        expect(typeof config.maxConcurrent).toBe('number');
      });
    });
  });

  describe('Stripe rate limits', () => {
    it('should have default maxPerSecond of 25', () => {
      delete process.env.RATE_LIMIT_STRIPE;
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.stripe.maxPerSecond).toBe(25);
    });

    it('should parse maxPerSecond from RATE_LIMIT_STRIPE env var', () => {
      process.env.RATE_LIMIT_STRIPE = '50';
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.stripe.maxPerSecond).toBe(50);
    });

    it('should have maxConcurrent of 10', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.stripe.maxConcurrent).toBe(10);
    });

    it('should have burstSize of 50', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.stripe.burstSize).toBe(50);
    });

    it('should have cooldownMs of 1000', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.stripe.cooldownMs).toBe(1000);
    });
  });

  describe('Square rate limits', () => {
    it('should have maxPerSecond of 8', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.square.maxPerSecond).toBe(8);
    });

    it('should have maxConcurrent of 5', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.square.maxConcurrent).toBe(5);
    });

    it('should have burstSize of 20', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.square.burstSize).toBe(20);
    });

    it('should have cooldownMs of 2000', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.square.cooldownMs).toBe(2000);
    });
  });

  describe('SendGrid rate limits', () => {
    it('should have default maxPerSecond of 5', () => {
      delete process.env.RATE_LIMIT_SENDGRID;
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.sendgrid.maxPerSecond).toBe(5);
    });

    it('should parse maxPerSecond from RATE_LIMIT_SENDGRID env var', () => {
      process.env.RATE_LIMIT_SENDGRID = '10';
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.sendgrid.maxPerSecond).toBe(10);
    });

    it('should have maxConcurrent of 20', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.sendgrid.maxConcurrent).toBe(20);
    });

    it('should have burstSize of 100', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.sendgrid.burstSize).toBe(100);
    });

    it('should have cooldownMs of 1000', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.sendgrid.cooldownMs).toBe(1000);
    });
  });

  describe('Twilio rate limits', () => {
    it('should have default maxPerSecond of 1', () => {
      delete process.env.RATE_LIMIT_TWILIO;
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.twilio.maxPerSecond).toBe(1);
    });

    it('should parse maxPerSecond from RATE_LIMIT_TWILIO env var', () => {
      process.env.RATE_LIMIT_TWILIO = '2';
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.twilio.maxPerSecond).toBe(2);
    });

    it('should have maxConcurrent of 5', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.twilio.maxConcurrent).toBe(5);
    });

    it('should have burstSize of 10', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.twilio.burstSize).toBe(10);
    });

    it('should have cooldownMs of 5000', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.twilio.cooldownMs).toBe(5000);
    });

    it('should have most restrictive rate limit (lowest maxPerSecond)', () => {
      const { RATE_LIMITS } = getModule();
      const allRates = Object.values(RATE_LIMITS).map((c: any) => c.maxPerSecond);
      const minRate = Math.min(...allRates);
      expect(RATE_LIMITS.twilio.maxPerSecond).toBe(minRate);
    });
  });

  describe('Solana rate limits', () => {
    it('should have default maxPerSecond of 10', () => {
      delete process.env.RATE_LIMIT_SOLANA;
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.solana.maxPerSecond).toBe(10);
    });

    it('should parse maxPerSecond from RATE_LIMIT_SOLANA env var', () => {
      process.env.RATE_LIMIT_SOLANA = '20';
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.solana.maxPerSecond).toBe(20);
    });

    it('should have maxConcurrent of 5', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.solana.maxConcurrent).toBe(5);
    });

    it('should have burstSize of 30', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.solana.burstSize).toBe(30);
    });

    it('should have cooldownMs of 1000', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.solana.cooldownMs).toBe(1000);
    });
  });

  describe('QuickBooks rate limits', () => {
    it('should have maxPerSecond of 2', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.quickbooks.maxPerSecond).toBe(2);
    });

    it('should have maxConcurrent of 3', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.quickbooks.maxConcurrent).toBe(3);
    });

    it('should have burstSize of 10', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.quickbooks.burstSize).toBe(10);
    });

    it('should have cooldownMs of 3000', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.quickbooks.cooldownMs).toBe(3000);
    });
  });

  describe('Internal rate limits', () => {
    it('should have maxPerSecond of 100', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.internal.maxPerSecond).toBe(100);
    });

    it('should have maxConcurrent of 50', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.internal.maxConcurrent).toBe(50);
    });

    it('should have burstSize of 200', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.internal.burstSize).toBe(200);
    });

    it('should have cooldownMs of 100', () => {
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.internal.cooldownMs).toBe(100);
    });

    it('should have highest rate limits (most permissive)', () => {
      const { RATE_LIMITS } = getModule();
      const allRates = Object.values(RATE_LIMITS).map((c: any) => c.maxPerSecond);
      const maxRate = Math.max(...allRates);
      expect(RATE_LIMITS.internal.maxPerSecond).toBe(maxRate);
    });

    it('should have highest concurrent limit', () => {
      const { RATE_LIMITS } = getModule();
      const allConcurrent = Object.values(RATE_LIMITS).map((c: any) => c.maxConcurrent);
      const maxConcurrent = Math.max(...allConcurrent);
      expect(RATE_LIMITS.internal.maxConcurrent).toBe(maxConcurrent);
    });
  });

  describe('Rate limit patterns', () => {
    it('should have all positive maxPerSecond values', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        expect(config.maxPerSecond).toBeGreaterThan(0);
      });
    });

    it('should have all positive maxConcurrent values', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        expect(config.maxConcurrent).toBeGreaterThan(0);
      });
    });

    it('should have burstSize greater than or equal to maxPerSecond', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        if (config.burstSize !== undefined) {
          expect(config.burstSize).toBeGreaterThanOrEqual(config.maxPerSecond);
        }
      });
    });

    it('should have all positive cooldown values when defined', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        if (config.cooldownMs !== undefined) {
          expect(config.cooldownMs).toBeGreaterThan(0);
        }
      });
    });

    it('should have all integer values', () => {
      const { RATE_LIMITS } = getModule();
      Object.values(RATE_LIMITS).forEach((config: any) => {
        expect(Number.isInteger(config.maxPerSecond)).toBe(true);
        expect(Number.isInteger(config.maxConcurrent)).toBe(true);
        if (config.burstSize !== undefined) {
          expect(Number.isInteger(config.burstSize)).toBe(true);
        }
        if (config.cooldownMs !== undefined) {
          expect(Number.isInteger(config.cooldownMs)).toBe(true);
        }
      });
    });
  });

  describe('RATE_LIMIT_GROUPS', () => {
    it('should be defined', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      expect(RATE_LIMIT_GROUPS).toBeDefined();
    });

    it('should have all provider groups', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      expect(RATE_LIMIT_GROUPS).toHaveProperty('twilio');
      expect(RATE_LIMIT_GROUPS).toHaveProperty('stripe');
      expect(RATE_LIMIT_GROUPS).toHaveProperty('sendgrid');
    });

    it('should have exactly 3 groups', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      expect(Object.keys(RATE_LIMIT_GROUPS)).toHaveLength(3);
    });

    it('should have twilio group with all variants', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      expect(RATE_LIMIT_GROUPS.twilio).toEqual(['twilio-sms', 'twilio-voice', 'twilio-verify']);
    });

    it('should have stripe group with all variants', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      expect(RATE_LIMIT_GROUPS.stripe).toEqual(['stripe-charges', 'stripe-refunds', 'stripe-payouts']);
    });

    it('should have sendgrid group with all variants', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      expect(RATE_LIMIT_GROUPS.sendgrid).toEqual(['sendgrid-transactional', 'sendgrid-marketing']);
    });

    it('should have array values for all groups', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      Object.values(RATE_LIMIT_GROUPS).forEach(group => {
        expect(Array.isArray(group)).toBe(true);
      });
    });

    it('should have non-empty arrays for all groups', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      Object.values(RATE_LIMIT_GROUPS).forEach(group => {
        expect(group.length).toBeGreaterThan(0);
      });
    });

    it('should have string values in all group arrays', () => {
      const { RATE_LIMIT_GROUPS } = getModule();
      Object.values(RATE_LIMIT_GROUPS).forEach(group => {
        group.forEach((item: string) => {
          expect(typeof item).toBe('string');
        });
      });
    });

    it('should match group keys to RATE_LIMITS keys', () => {
      const { RATE_LIMIT_GROUPS, RATE_LIMITS } = getModule();
      Object.keys(RATE_LIMIT_GROUPS).forEach(key => {
        expect(RATE_LIMITS).toHaveProperty(key);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid env var for stripe', () => {
      process.env.RATE_LIMIT_STRIPE = 'invalid';
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.stripe.maxPerSecond).toBeNaN();
    });

    it('should handle negative env var for twilio', () => {
      process.env.RATE_LIMIT_TWILIO = '-5';
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.twilio.maxPerSecond).toBe(-5);
    });

    it('should handle zero env var for solana', () => {
      process.env.RATE_LIMIT_SOLANA = '0';
      const { RATE_LIMITS } = getModule();
      expect(RATE_LIMITS.solana.maxPerSecond).toBe(0);
    });
  });
});
