/**
 * Unit Tests for src/services/interServiceClient.ts
 */

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

jest.mock('../../../src/config', () => ({
  config: {
    internalServiceSecret: 'test-secret-key-for-hmac-signing',
    env: 'test',
    services: {
      auth: 'http://auth-service:3001',
      event: 'http://event-service:3003',
      payment: 'http://payment-service:3006',
    },
  },
}));

jest.mock('../../../src/config/service-auth', () => ({
  serviceAuth: {},
  circuitBreaker: {
    allowRequest: jest.fn().mockReturnValue(true),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    getState: jest.fn().mockReturnValue({ state: 'CLOSED', failures: 0 }),
    getAllStates: jest.fn().mockReturnValue({}),
    reset: jest.fn(),
  },
  generateServiceToken: jest.fn().mockReturnValue('mock-jwt-token'),
  computeBodyHash: jest.fn().mockReturnValue('mock-body-hash'),
  SERVICE_CREDENTIALS: {},
  CircuitBreakerState: {},
}));

jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    request: jest.fn(),
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  }),
  isAxiosError: jest.fn().mockReturnValue(false),
}));

import { InterServiceClient } from '../../../src/services/interServiceClient';
import { circuitBreaker } from '../../../src/config/service-auth';

describe('services/interServiceClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifySignature()', () => {
    it('returns false for empty signatures', () => {
      expect(InterServiceClient.verifySignature('', 'abc')).toBe(false);
      expect(InterServiceClient.verifySignature('abc', '')).toBe(false);
    });

    it('returns false for mismatched lengths', () => {
      expect(InterServiceClient.verifySignature('abcd', 'ab')).toBe(false);
    });

    it('returns true for matching signatures', () => {
      const sig = 'a'.repeat(64);
      expect(InterServiceClient.verifySignature(sig, sig)).toBe(true);
    });

    it('returns false for different signatures of same length', () => {
      const sig1 = 'a'.repeat(64);
      const sig2 = 'b'.repeat(64);
      expect(InterServiceClient.verifySignature(sig1, sig2)).toBe(false);
    });
  });

  describe('validateIncomingSignature()', () => {
    it('rejects expired timestamps', () => {
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago

      const result = InterServiceClient.validateIncomingSignature(
        'auth-service',
        oldTimestamp,
        '/api/test',
        'signature'
      );

      expect(result).toBe(false);
    });

    it('rejects invalid timestamps', () => {
      const result = InterServiceClient.validateIncomingSignature(
        'auth-service',
        'not-a-number',
        '/api/test',
        'signature'
      );

      expect(result).toBe(false);
    });
  });

  describe('getCircuitState()', () => {
    it('returns circuit breaker state for service', () => {
      const state = InterServiceClient.getCircuitState('auth');

      expect(circuitBreaker.getState).toHaveBeenCalledWith('auth-service');
    });

    it('handles service names with -service suffix', () => {
      InterServiceClient.getCircuitState('auth-service');

      expect(circuitBreaker.getState).toHaveBeenCalledWith('auth-service');
    });
  });

  describe('getAllCircuitStates()', () => {
    it('returns all circuit states', () => {
      InterServiceClient.getAllCircuitStates();

      expect(circuitBreaker.getAllStates).toHaveBeenCalled();
    });
  });

  describe('resetCircuit()', () => {
    it('resets circuit for specified service', () => {
      InterServiceClient.resetCircuit('auth');

      expect(circuitBreaker.reset).toHaveBeenCalledWith('auth-service');
    });
  });

  describe('isCircuitAllowed()', () => {
    it('checks if circuit allows requests', () => {
      const result = InterServiceClient.isCircuitAllowed('auth');

      expect(circuitBreaker.allowRequest).toHaveBeenCalledWith('auth-service');
      expect(result).toBe(true);
    });
  });

  describe('getHealthStatus()', () => {
    it('returns health status for service', () => {
      const status = InterServiceClient.getHealthStatus('auth');

      expect(typeof status).toBe('boolean');
    });
  });
});
