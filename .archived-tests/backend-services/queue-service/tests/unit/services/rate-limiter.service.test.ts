import { RateLimiterService } from '../../../src/services/rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeAll(() => {
    service = RateLimiterService.getInstance();
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const instance1 = RateLimiterService.getInstance();
      const instance2 = RateLimiterService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('acquire and release', () => {
    it('should acquire rate limit permission', async () => {
      await expect(service.acquire('stripe', 5)).resolves.not.toThrow();
    });

    it('should release rate limit slot', () => {
      expect(() => service.release('stripe')).not.toThrow();
    });

    it('should track concurrent requests', async () => {
      await service.acquire('stripe');
      const status = service.getStatus();
      
      expect(status.stripe).toBeDefined();
      expect(status.stripe.concurrent).toBeGreaterThanOrEqual(0);
      
      service.release('stripe');
    });
  });

  describe('getStatus', () => {
    it('should return status for all services', () => {
      const status = service.getStatus();
      
      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
    });

    it('should include tokens available', () => {
      const status = service.getStatus();
      
      Object.values(status).forEach(serviceStatus => {
        expect(serviceStatus.tokensAvailable).toBeDefined();
        expect(serviceStatus.tokensAvailable).toBeGreaterThanOrEqual(0);
      });
    });

    it('should include concurrent info', () => {
      const status = service.getStatus();
      
      Object.values(status).forEach(serviceStatus => {
        expect(serviceStatus.concurrent).toBeDefined();
        expect(serviceStatus.maxConcurrent).toBeDefined();
        expect(serviceStatus.concurrent).toBeLessThanOrEqual(serviceStatus.maxConcurrent);
      });
    });
  });

  describe('isRateLimited', () => {
    it('should check if service is rate limited', async () => {
      const limited = await service.isRateLimited('stripe');
      expect(typeof limited).toBe('boolean');
    });
  });

  describe('getWaitTime', () => {
    it('should return wait time', () => {
      const waitTime = service.getWaitTime('stripe');
      expect(typeof waitTime).toBe('number');
      expect(waitTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    it('should reset rate limiter', () => {
      expect(() => service.reset('stripe')).not.toThrow();
    });
  });

  describe('emergency operations', () => {
    it('should handle emergency stop', () => {
      expect(() => service.emergencyStop()).not.toThrow();
    });

    it('should handle resume', () => {
      expect(() => service.resume()).not.toThrow();
    });
  });

  afterAll(() => {
    service.stop();
  });
});
