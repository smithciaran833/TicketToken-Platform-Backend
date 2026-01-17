describe('Config - Retry Strategies Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleWarnSpy.mockRestore();
  });

  const getModule = () => {
    return require('../../../src/config/retry-strategies.config');
  };

  describe('RETRY_STRATEGIES structure', () => {
    it('should be defined', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES).toBeDefined();
    });

    it('should have all job type strategies', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES).toHaveProperty('payment-process');
      expect(RETRY_STRATEGIES).toHaveProperty('refund-process');
      expect(RETRY_STRATEGIES).toHaveProperty('payout-process');
      expect(RETRY_STRATEGIES).toHaveProperty('nft-mint');
      expect(RETRY_STRATEGIES).toHaveProperty('nft-transfer');
      expect(RETRY_STRATEGIES).toHaveProperty('send-email');
      expect(RETRY_STRATEGIES).toHaveProperty('send-sms');
      expect(RETRY_STRATEGIES).toHaveProperty('analytics-event');
      expect(RETRY_STRATEGIES).toHaveProperty('report-generation');
      expect(RETRY_STRATEGIES).toHaveProperty('cache-warming');
    });

    it('should have exactly 10 job type strategies', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(Object.keys(RETRY_STRATEGIES)).toHaveLength(10);
    });

    it('should have required properties for all strategies', () => {
      const { RETRY_STRATEGIES } = getModule();
      Object.values(RETRY_STRATEGIES).forEach((strategy: any) => {
        expect(strategy).toHaveProperty('attempts');
        expect(strategy).toHaveProperty('backoff');
        expect(strategy).toHaveProperty('description');
      });
    });

    it('should have backoff with type and delay for all strategies', () => {
      const { RETRY_STRATEGIES } = getModule();
      Object.values(RETRY_STRATEGIES).forEach((strategy: any) => {
        expect(strategy.backoff).toHaveProperty('type');
        expect(strategy.backoff).toHaveProperty('delay');
      });
    });

    it('should have valid backoff types', () => {
      const { RETRY_STRATEGIES } = getModule();
      Object.values(RETRY_STRATEGIES).forEach((strategy: any) => {
        expect(['exponential', 'fixed']).toContain(strategy.backoff.type);
      });
    });
  });

  describe('Payment processing strategies', () => {
    it('should have default payment-process attempts of 10', () => {
      delete process.env.RETRY_PAYMENT;
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payment-process'].attempts).toBe(10);
    });

    it('should parse payment-process attempts from RETRY_PAYMENT env var', () => {
      process.env.RETRY_PAYMENT = '15';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payment-process'].attempts).toBe(15);
    });

    it('should have exponential backoff with 2000ms delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payment-process'].backoff.type).toBe('exponential');
      expect(RETRY_STRATEGIES['payment-process'].backoff.delay).toBe(2000);
    });

    it('should have descriptive text', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payment-process'].description).toBeDefined();
      expect(typeof RETRY_STRATEGIES['payment-process'].description).toBe('string');
    });

    it('should have refund-process with same config as payment-process', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['refund-process'].attempts).toBe(RETRY_STRATEGIES['payment-process'].attempts);
      expect(RETRY_STRATEGIES['refund-process'].backoff.delay).toBe(2000);
      expect(RETRY_STRATEGIES['refund-process'].backoff.type).toBe('exponential');
    });

    it('should have default payout-process attempts of 8', () => {
      delete process.env.RETRY_PAYOUT;
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payout-process'].attempts).toBe(8);
    });

    it('should parse payout-process attempts from RETRY_PAYOUT env var', () => {
      process.env.RETRY_PAYOUT = '12';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payout-process'].attempts).toBe(12);
    });

    it('should have payout-process with 3000ms delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payout-process'].backoff.delay).toBe(3000);
    });
  });

  describe('Blockchain strategies', () => {
    it('should have default nft-mint attempts of 5', () => {
      delete process.env.RETRY_NFT_MINT;
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['nft-mint'].attempts).toBe(5);
    });

    it('should parse nft-mint attempts from RETRY_NFT_MINT env var', () => {
      process.env.RETRY_NFT_MINT = '7';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['nft-mint'].attempts).toBe(7);
    });

    it('should have exponential backoff with 5000ms delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['nft-mint'].backoff.type).toBe('exponential');
      expect(RETRY_STRATEGIES['nft-mint'].backoff.delay).toBe(5000);
    });

    it('should have nft-transfer using same env var as nft-mint', () => {
      process.env.RETRY_NFT_MINT = '7';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['nft-transfer'].attempts).toBe(7);
    });

    it('should have nft-transfer with same config as nft-mint', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['nft-transfer'].backoff.delay).toBe(5000);
      expect(RETRY_STRATEGIES['nft-transfer'].backoff.type).toBe('exponential');
    });
  });

  describe('Communication strategies', () => {
    it('should have default send-email attempts of 5', () => {
      delete process.env.RETRY_EMAIL;
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-email'].attempts).toBe(5);
    });

    it('should parse send-email attempts from RETRY_EMAIL env var', () => {
      process.env.RETRY_EMAIL = '8';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-email'].attempts).toBe(8);
    });

    it('should have fixed backoff with 5000ms delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-email'].backoff.type).toBe('fixed');
      expect(RETRY_STRATEGIES['send-email'].backoff.delay).toBe(5000);
    });

    it('should have default send-sms attempts of 3', () => {
      delete process.env.RETRY_SMS;
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-sms'].attempts).toBe(3);
    });

    it('should parse send-sms attempts from RETRY_SMS env var', () => {
      process.env.RETRY_SMS = '5';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-sms'].attempts).toBe(5);
    });

    it('should have fixed backoff with 10000ms delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-sms'].backoff.type).toBe('fixed');
      expect(RETRY_STRATEGIES['send-sms'].backoff.delay).toBe(10000);
    });
  });

  describe('Background job strategies', () => {
    it('should have default analytics-event attempts of 2', () => {
      delete process.env.RETRY_ANALYTICS;
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['analytics-event'].attempts).toBe(2);
    });

    it('should parse analytics-event attempts from RETRY_ANALYTICS env var', () => {
      process.env.RETRY_ANALYTICS = '4';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['analytics-event'].attempts).toBe(4);
    });

    it('should have fixed backoff with 10000ms delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['analytics-event'].backoff.type).toBe('fixed');
      expect(RETRY_STRATEGIES['analytics-event'].backoff.delay).toBe(10000);
    });

    it('should have report-generation using same env var as analytics', () => {
      process.env.RETRY_ANALYTICS = '4';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['report-generation'].attempts).toBe(4);
    });

    it('should have report-generation with 15000ms delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['report-generation'].backoff.delay).toBe(15000);
    });

    it('should have cache-warming with 1 attempt (no retries)', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['cache-warming'].attempts).toBe(1);
    });

    it('should have cache-warming with 0 delay', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['cache-warming'].backoff.delay).toBe(0);
    });
  });

  describe('Strategy patterns', () => {
    it('should use exponential backoff for critical money operations', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payment-process'].backoff.type).toBe('exponential');
      expect(RETRY_STRATEGIES['refund-process'].backoff.type).toBe('exponential');
      expect(RETRY_STRATEGIES['payout-process'].backoff.type).toBe('exponential');
    });

    it('should use exponential backoff for blockchain operations', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['nft-mint'].backoff.type).toBe('exponential');
      expect(RETRY_STRATEGIES['nft-transfer'].backoff.type).toBe('exponential');
    });

    it('should use fixed backoff for communication', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-email'].backoff.type).toBe('fixed');
      expect(RETRY_STRATEGIES['send-sms'].backoff.type).toBe('fixed');
    });

    it('should use fixed backoff for background jobs', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['analytics-event'].backoff.type).toBe('fixed');
      expect(RETRY_STRATEGIES['report-generation'].backoff.type).toBe('fixed');
      expect(RETRY_STRATEGIES['cache-warming'].backoff.type).toBe('fixed');
    });

    it('should have highest attempts for critical operations', () => {
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payment-process'].attempts).toBeGreaterThanOrEqual(RETRY_STRATEGIES['send-email'].attempts);
      expect(RETRY_STRATEGIES['payment-process'].attempts).toBeGreaterThanOrEqual(RETRY_STRATEGIES['analytics-event'].attempts);
    });

    it('should have all non-negative attempts', () => {
      const { RETRY_STRATEGIES } = getModule();
      Object.values(RETRY_STRATEGIES).forEach((strategy: any) => {
        expect(strategy.attempts).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have all non-negative delays', () => {
      const { RETRY_STRATEGIES } = getModule();
      Object.values(RETRY_STRATEGIES).forEach((strategy: any) => {
        expect(strategy.backoff.delay).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getRetryStrategy function', () => {
    it('should be defined', () => {
      const { getRetryStrategy } = getModule();
      expect(getRetryStrategy).toBeDefined();
      expect(typeof getRetryStrategy).toBe('function');
    });

    it('should return strategy for known job type', () => {
      const { getRetryStrategy, RETRY_STRATEGIES } = getModule();
      const strategy = getRetryStrategy('payment-process');
      expect(strategy).toEqual(RETRY_STRATEGIES['payment-process']);
    });

    it('should return default strategy for unknown job type', () => {
      const { getRetryStrategy } = getModule();
      const strategy = getRetryStrategy('unknown-job');
      expect(strategy.attempts).toBe(3);
      expect(strategy.backoff.type).toBe('exponential');
      expect(strategy.backoff.delay).toBe(1000);
      expect(strategy.description).toBe('Default retry strategy');
    });

    it('should return default strategy for empty string', () => {
      const { getRetryStrategy } = getModule();
      const strategy = getRetryStrategy('');
      expect(strategy.attempts).toBe(3);
    });

    it('should return consistent default strategy', () => {
      const { getRetryStrategy } = getModule();
      const strategy1 = getRetryStrategy('unknown-1');
      const strategy2 = getRetryStrategy('unknown-2');
      expect(strategy1).toEqual(strategy2);
    });
  });

  describe('getAllRetryStrategies function', () => {
    it('should be defined', () => {
      const { getAllRetryStrategies } = getModule();
      expect(getAllRetryStrategies).toBeDefined();
      expect(typeof getAllRetryStrategies).toBe('function');
    });

    it('should return all strategies', () => {
      const { getAllRetryStrategies, RETRY_STRATEGIES } = getModule();
      const allStrategies = getAllRetryStrategies();
      expect(Object.keys(allStrategies)).toHaveLength(Object.keys(RETRY_STRATEGIES).length);
    });

    it('should return a copy of strategies (not reference)', () => {
      const { getAllRetryStrategies, RETRY_STRATEGIES } = getModule();
      const allStrategies = getAllRetryStrategies();
      expect(allStrategies).not.toBe(RETRY_STRATEGIES);
      expect(allStrategies).toEqual(RETRY_STRATEGIES);
    });

    it('should return object with all job types', () => {
      const { getAllRetryStrategies } = getModule();
      const allStrategies = getAllRetryStrategies();
      expect(allStrategies).toHaveProperty('payment-process');
      expect(allStrategies).toHaveProperty('nft-mint');
      expect(allStrategies).toHaveProperty('send-email');
    });
  });

  describe('validateRetryStrategies function', () => {
    it('should be defined', () => {
      const { validateRetryStrategies } = getModule();
      expect(validateRetryStrategies).toBeDefined();
      expect(typeof validateRetryStrategies).toBe('function');
    });

    it('should not warn for valid strategies', () => {
      getModule();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should warn for attempts over 50', () => {
      process.env.RETRY_PAYMENT = '100';
      getModule();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unusual retry attempt count')
      );
    });

    it('should warn for negative attempts', () => {
      process.env.RETRY_PAYMENT = '-5';
      getModule();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unusual retry attempt count')
      );
    });

    it('should warn for delay over 300000ms (5 minutes)', () => {
      const { RETRY_STRATEGIES, validateRetryStrategies } = getModule();
      RETRY_STRATEGIES['test-job'] = {
        attempts: 3,
        backoff: { type: 'fixed', delay: 400000 },
        description: 'Test'
      };
      consoleWarnSpy.mockClear();
      validateRetryStrategies();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unusual backoff delay')
      );
    });

    it('should warn for negative delay', () => {
      const { RETRY_STRATEGIES, validateRetryStrategies } = getModule();
      RETRY_STRATEGIES['test-job'] = {
        attempts: 3,
        backoff: { type: 'fixed', delay: -1000 },
        description: 'Test'
      };
      consoleWarnSpy.mockClear();
      validateRetryStrategies();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unusual backoff delay')
      );
    });

    it('should be called automatically on module import', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      jest.resetModules();
      process.env.RETRY_PAYMENT = '100';
      require('../../../src/config/retry-strategies.config');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid env var (NaN)', () => {
      process.env.RETRY_PAYMENT = 'invalid';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['payment-process'].attempts).toBeNaN();
    });

    it('should handle zero attempts', () => {
      process.env.RETRY_EMAIL = '0';
      const { RETRY_STRATEGIES } = getModule();
      expect(RETRY_STRATEGIES['send-email'].attempts).toBe(0);
    });

    it('should have kebab-case job type keys', () => {
      const { RETRY_STRATEGIES } = getModule();
      Object.keys(RETRY_STRATEGIES).forEach(key => {
        expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });
  });
});
