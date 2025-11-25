import { DEFAULT_CONFIG, ENVIRONMENTS } from '../../../src/types/config';

describe('Config Types', () => {
  describe('ENVIRONMENTS', () => {
    it('should have production environment URL', () => {
      expect(ENVIRONMENTS.production).toBe('https://api.tickettoken.com');
    });

    it('should have staging environment URL', () => {
      expect(ENVIRONMENTS.staging).toBe('https://api-staging.tickettoken.com');
    });

    it('should have development environment URL', () => {
      expect(ENVIRONMENTS.development).toBe('http://localhost:3000');
    });

    it('should be read-only object', () => {
      expect(() => {
        // @ts-ignore - testing runtime immutability
        ENVIRONMENTS.production = 'https://hacked.com';
      }).toThrow();
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CONFIG.environment).toBe('production');
      expect(DEFAULT_CONFIG.timeout).toBe(30000);
      expect(DEFAULT_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_CONFIG.debug).toBe(false);
      expect(DEFAULT_CONFIG.headers).toEqual({});
    });

    it('should have production as default environment', () => {
      expect(DEFAULT_CONFIG.environment).toBe('production');
    });

    it('should have reasonable timeout', () => {
      expect(DEFAULT_CONFIG.timeout).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.timeout).toBeLessThanOrEqual(60000);
    });

    it('should have positive max retries', () => {
      expect(DEFAULT_CONFIG.maxRetries).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.maxRetries).toBeLessThanOrEqual(5);
    });
  });
});
