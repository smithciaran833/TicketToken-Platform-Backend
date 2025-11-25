import { getCircuitBreaker } from '../../src/middleware/circuit-breaker.middleware';

describe('Circuit Breaker Middleware', () => {
  describe('Circuit Breaker Configuration', () => {
    it('should have circuit breakers for all 19 services', () => {
      const services = [
        'auth-service',
        'venue-service',
        'event-service',
        'ticket-service',
        'payment-service',
        'marketplace-service',
        'analytics-service',
        'notification-service',
        'integration-service',
        'compliance-service',
        'queue-service',
        'search-service',
        'file-service',
        'monitoring-service',
        'blockchain-service',
        'order-service',
        'scanning-service',
        'minting-service',
        'transfer-service',
      ];

      services.forEach((service) => {
        const cb = getCircuitBreaker(service);
        expect(cb).toBeDefined();
        expect(cb.name).toBe(service);
      });
    });

    it('should configure fast timeouts for high-speed services', () => {
      const fastServices = ['notification-service', 'queue-service', 'scanning-service', 'monitoring-service'];
      
      fastServices.forEach((service) => {
        const cb = getCircuitBreaker(service);
        expect(cb.options.timeout).toBeLessThanOrEqual(5000);
      });
    });

    it('should configure long timeouts for blockchain services', () => {
      const slowServices = ['blockchain-service', 'minting-service'];
      
      slowServices.forEach((service) => {
        const cb = getCircuitBreaker(service);
        expect(cb.options.timeout).toBeGreaterThanOrEqual(60000);
      });
    });

    it('should configure stricter error threshold for compliance service', () => {
      const cb = getCircuitBreaker('compliance-service');
      expect(cb.options.errorThresholdPercentage).toBeLessThanOrEqual(40);
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should open circuit after threshold is reached', async () => {
      const cb = getCircuitBreaker('test-service');
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service down'));

      // Trigger multiple failures
      for (let i = 0; i < 10; i++) {
        try {
          await cb.fire(failingFunction);
        } catch (e) {
          // Expected to fail
        }
      }

      // Circuit should now be open
      expect(cb.opened).toBe(true);
    });

    it('should reject fast when circuit is open', async () => {
      const cb = getCircuitBreaker('test-service-2');
      
      // Force circuit open
      cb.open();

      const slowFunction = jest.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const start = Date.now();
      try {
        await cb.fire(slowFunction);
      } catch (e) {
        const duration = Date.now() - start;
        // Should fail fast (< 100ms), not wait for timeout
        expect(duration).toBeLessThan(100);
      }
    });

    it('should attempt half-open state after reset timeout', async () => {
      const cb = getCircuitBreaker('test-service-3');
      
      // Open circuit
      cb.open();
      expect(cb.opened).toBe(true);

      // Wait for reset timeout (mocked shorter)
      await new Promise((resolve) => setTimeout(resolve, cb.options.resetTimeout + 100));

      // Should transition to half-open
      expect(cb.halfOpen).toBe(true);
    });
  });

  describe('Service-Specific Configurations', () => {
    it('should configure payment service with longer timeout', () => {
      const cb = getCircuitBreaker('payment-service');
      expect(cb.options.timeout).toBe(30000);
    });

    it('should configure file service with longer timeout for uploads', () => {
      const cb = getCircuitBreaker('file-service');
      expect(cb.options.timeout).toBe(30000);
    });

    it('should configure analytics service with higher error tolerance', () => {
      const cb = getCircuitBreaker('analytics-service');
      expect(cb.options.errorThresholdPercentage).toBe(60);
    });
  });
});
