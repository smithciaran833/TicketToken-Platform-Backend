/**
 * Unit Tests for src/config/service-auth.ts
 */

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Set required env vars before importing
process.env.NODE_ENV = 'test';
process.env.AUTH_SERVICE_SECRET = 'a'.repeat(64);
process.env.EVENT_SERVICE_SECRET = 'b'.repeat(64);
process.env.PAYMENT_SERVICE_SECRET = 'c'.repeat(64);
process.env.NOTIFICATION_SERVICE_SECRET = 'd'.repeat(64);
process.env.VENUE_SERVICE_SECRET = 'e'.repeat(64);
process.env.BLOCKCHAIN_SERVICE_SECRET = 'f'.repeat(64);
process.env.ORDER_SERVICE_SECRET = 'g'.repeat(64);
process.env.SCANNING_SERVICE_SECRET = 'h'.repeat(64);
process.env.TRANSFER_SERVICE_SECRET = 'i'.repeat(64);
process.env.MARKETPLACE_SERVICE_SECRET = 'j'.repeat(64);

import {
  SERVICE_CREDENTIALS,
  ALLOWED_CALLERS,
  ENDPOINT_PERMISSIONS,
  CircuitBreaker,
  generateServiceToken,
  validateServiceToken,
  computeBodyHash,
  isAuthorizedForEndpoint,
  checkCredentialRotation,
  getNonceStoreStats,
  serviceAuth,
} from '../../../src/config/service-auth';

describe('config/service-auth', () => {
  describe('SERVICE_CREDENTIALS', () => {
    it('has credentials for all expected services', () => {
      expect(SERVICE_CREDENTIALS).toHaveProperty('auth-service');
      expect(SERVICE_CREDENTIALS).toHaveProperty('event-service');
      expect(SERVICE_CREDENTIALS).toHaveProperty('payment-service');
      expect(SERVICE_CREDENTIALS).toHaveProperty('order-service');
    });

    it('each service has secret and enabled flag', () => {
      for (const [name, creds] of Object.entries(SERVICE_CREDENTIALS)) {
        expect(creds.secret).toBeDefined();
        expect(typeof creds.enabled).toBe('boolean');
      }
    });

    it('each service has rate limit config', () => {
      for (const [name, creds] of Object.entries(SERVICE_CREDENTIALS)) {
        expect(creds.rateLimit).toBeDefined();
        expect(creds.rateLimit?.maxRequests).toBeGreaterThan(0);
        expect(creds.rateLimit?.windowMs).toBeGreaterThan(0);
      }
    });
  });

  describe('ALLOWED_CALLERS', () => {
    it('is an array of service names', () => {
      expect(Array.isArray(ALLOWED_CALLERS)).toBe(true);
      expect(ALLOWED_CALLERS.length).toBeGreaterThan(0);
    });

    it('includes expected services', () => {
      expect(ALLOWED_CALLERS).toContain('auth-service');
      expect(ALLOWED_CALLERS).toContain('event-service');
      expect(ALLOWED_CALLERS).toContain('payment-service');
    });
  });

  describe('ENDPOINT_PERMISSIONS', () => {
    it('has permissions for ticket endpoints', () => {
      expect(ENDPOINT_PERMISSIONS).toHaveProperty('GET:/api/v1/tickets');
      expect(ENDPOINT_PERMISSIONS).toHaveProperty('POST:/api/v1/tickets');
    });

    it('has permissions for purchase endpoints', () => {
      expect(ENDPOINT_PERMISSIONS).toHaveProperty('POST:/api/v1/purchase');
    });

    it('has permissions for health endpoints', () => {
      expect(ENDPOINT_PERMISSIONS).toHaveProperty('GET:/health');
    });

    it('health endpoints allow all services', () => {
      expect(ENDPOINT_PERMISSIONS['GET:/health'].allowedServices).toContain('*');
    });
  });

  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker(3, 1000, 2);
    });

    describe('getState()', () => {
      it('returns CLOSED state initially', () => {
        const state = breaker.getState('test-service');
        expect(state.state).toBe('CLOSED');
        expect(state.failures).toBe(0);
      });
    });

    describe('allowRequest()', () => {
      it('allows requests when CLOSED', () => {
        expect(breaker.allowRequest('test-service')).toBe(true);
      });

      it('blocks requests when OPEN', () => {
        // Force to OPEN
        for (let i = 0; i < 3; i++) {
          breaker.recordFailure('test-service');
        }
        expect(breaker.allowRequest('test-service')).toBe(false);
      });
    });

    describe('recordSuccess()', () => {
      it('decrements failure count when CLOSED', () => {
        breaker.recordFailure('test-service');
        breaker.recordSuccess('test-service');
        expect(breaker.getState('test-service').failures).toBe(0);
      });
    });

    describe('recordFailure()', () => {
      it('increments failure count', () => {
        breaker.recordFailure('test-service');
        expect(breaker.getState('test-service').failures).toBe(1);
      });

      it('opens circuit after threshold', () => {
        for (let i = 0; i < 3; i++) {
          breaker.recordFailure('test-service');
        }
        expect(breaker.getState('test-service').state).toBe('OPEN');
      });
    });

    describe('reset()', () => {
      it('resets circuit to CLOSED', () => {
        for (let i = 0; i < 3; i++) {
          breaker.recordFailure('test-service');
        }
        breaker.reset('test-service');
        expect(breaker.getState('test-service').state).toBe('CLOSED');
      });
    });

    describe('getAllStates()', () => {
      it('returns all circuit states', () => {
        breaker.getState('service-a');
        breaker.getState('service-b');
        const states = breaker.getAllStates();
        expect(states).toHaveProperty('service-a');
        expect(states).toHaveProperty('service-b');
      });
    });
  });

  describe('computeBodyHash()', () => {
    it('returns empty string for null/undefined', () => {
      expect(computeBodyHash(null)).toBe('');
      expect(computeBodyHash(undefined)).toBe('');
    });

    it('hashes string body', () => {
      const hash = computeBodyHash('test body');
      expect(hash).toHaveLength(64); // SHA256 hex
    });

    it('hashes object body', () => {
      const hash = computeBodyHash({ foo: 'bar' });
      expect(hash).toHaveLength(64);
    });

    it('produces consistent hashes', () => {
      const hash1 = computeBodyHash({ a: 1 });
      const hash2 = computeBodyHash({ a: 1 });
      expect(hash1).toBe(hash2);
    });
  });

  describe('isAuthorizedForEndpoint()', () => {
    it('returns authorized for allowed service/endpoint', () => {
      const result = isAuthorizedForEndpoint('event-service', 'GET', '/api/v1/tickets');
      expect(result.authorized).toBe(true);
    });

    it('returns unauthorized for disallowed service', () => {
      const result = isAuthorizedForEndpoint('unknown-service', 'GET', '/api/v1/tickets');
      expect(result.authorized).toBe(false);
    });

    it('returns authorized for wildcard endpoints', () => {
      const result = isAuthorizedForEndpoint('any-service', 'GET', '/health');
      expect(result.authorized).toBe(true);
    });

    it('returns unauthorized for unconfigured endpoint', () => {
      const result = isAuthorizedForEndpoint('event-service', 'GET', '/unconfigured/path');
      expect(result.authorized).toBe(false);
    });

    it('normalizes UUID params in path', () => {
      const result = isAuthorizedForEndpoint(
        'event-service',
        'GET',
        '/api/v1/tickets/550e8400-e29b-41d4-a716-446655440000'
      );
      expect(result.authorized).toBe(true);
    });
  });

  describe('checkCredentialRotation()', () => {
    it('executes without throwing in test env', () => {
      expect(() => checkCredentialRotation()).not.toThrow();
    });
  });

  describe('getNonceStoreStats()', () => {
    it('returns size and optionally oldest entry', () => {
      const stats = getNonceStoreStats();
      expect(stats).toHaveProperty('size');
      expect(typeof stats.size).toBe('number');
    });
  });

  describe('serviceAuth export', () => {
    it('exports all expected functions', () => {
      expect(serviceAuth.generateToken).toBe(generateServiceToken);
      expect(serviceAuth.validateToken).toBe(validateServiceToken);
      expect(serviceAuth.computeBodyHash).toBe(computeBodyHash);
      expect(serviceAuth.isAuthorized).toBe(isAuthorizedForEndpoint);
    });

    it('exports credentials and config', () => {
      expect(serviceAuth.credentials).toBe(SERVICE_CREDENTIALS);
      expect(serviceAuth.allowedCallers).toBe(ALLOWED_CALLERS);
      expect(serviceAuth.endpointPermissions).toBe(ENDPOINT_PERMISSIONS);
    });
  });
});
