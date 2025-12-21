import { getRetryStrategy, RETRY_STRATEGIES } from '../../../src/config/retry-strategies.config';

describe('RetryStrategies', () => {
  describe('getRetryStrategy', () => {
    it('should return payment strategy', () => {
      const strategy = getRetryStrategy('payment-process');
      
      expect(strategy).toBeDefined();
      expect(strategy.backoff.type).toBe('exponential');
      expect(strategy.attempts).toBeGreaterThan(0);
    });

    it('should return refund strategy', () => {
      const strategy = getRetryStrategy('refund-process');
      
      expect(strategy).toBeDefined();
      expect(strategy.attempts).toBeGreaterThan(0);
    });

    it('should return email strategy', () => {
      const strategy = getRetryStrategy('send-email');
      
      expect(strategy).toBeDefined();
      expect(strategy.backoff.type).toBe('fixed');
    });

    it('should return default for unknown jobs', () => {
      const strategy = getRetryStrategy('unknown-job-type');
      
      expect(strategy).toBeDefined();
      expect(strategy.attempts).toBe(3);
      expect(strategy.description).toContain('Default');
    });
  });

  describe('RETRY_STRATEGIES', () => {
    it('should have strategies for critical jobs', () => {
      expect(RETRY_STRATEGIES['payment-process']).toBeDefined();
      expect(RETRY_STRATEGIES['refund-process']).toBeDefined();
      expect(RETRY_STRATEGIES['payout-process']).toBeDefined();
    });

    it('should have strategies for blockchain jobs', () => {
      expect(RETRY_STRATEGIES['nft-mint']).toBeDefined();
      expect(RETRY_STRATEGIES['nft-transfer']).toBeDefined();
    });

    it('should have strategies for communication jobs', () => {
      expect(RETRY_STRATEGIES['send-email']).toBeDefined();
      expect(RETRY_STRATEGIES['send-sms']).toBeDefined();
    });

    it('should have valid attempt counts', () => {
      Object.values(RETRY_STRATEGIES).forEach(strategy => {
        expect(strategy.attempts).toBeGreaterThanOrEqual(1);
        expect(strategy.attempts).toBeLessThanOrEqual(50);
      });
    });

    it('should have valid backoff configurations', () => {
      Object.values(RETRY_STRATEGIES).forEach(strategy => {
        expect(['exponential', 'fixed']).toContain(strategy.backoff.type);
        if (strategy.backoff.delay !== undefined) {
          expect(strategy.backoff.delay).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it('should have descriptions', () => {
      Object.values(RETRY_STRATEGIES).forEach(strategy => {
        expect(strategy.description).toBeDefined();
        expect(strategy.description.length).toBeGreaterThan(0);
      });
    });
  });
});
