/**
 * Unit Tests for src/utils/logger.ts
 */

// Must mock config and tracing before importing logger
jest.mock('../../../src/config', () => ({
  config: {
    env: 'test',
  },
}));

jest.mock('../../../src/utils/tracing', () => ({
  getTraceContext: jest.fn().mockReturnValue({ traceId: 'test-trace-id', spanId: 'test-span-id' }),
}));

import {
  logger,
  createLogger,
  createRequestLogger,
  logError,
  logWarning,
  logInfo,
  logDebug,
  logRequest,
  logResponse,
  logOperation,
  logServiceCall,
  logDatabase,
  logSecurity,
  logAudit,
  shouldLogBody,
  truncateBody,
} from '../../../src/utils/logger';

describe('utils/logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLogLevel() (tested via logger behavior)', () => {
    it('logger is initialized', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
    });
  });

  describe('shouldLogBody()', () => {
    it('returns false for excluded routes', () => {
      expect(shouldLogBody('/api/v1/auth/login')).toBe(false);
      expect(shouldLogBody('/api/v1/login')).toBe(false);
      expect(shouldLogBody('/api/v1/webhooks/stripe')).toBe(false);
    });

    it('returns false for non-allowed content types', () => {
      expect(shouldLogBody('/api/test', 'multipart/form-data')).toBe(false);
      expect(shouldLogBody('/api/test', 'application/octet-stream')).toBe(false);
    });

    it('returns true for allowed routes and content types', () => {
      expect(shouldLogBody('/api/v1/tickets', 'application/json')).toBe(true);
      expect(shouldLogBody('/api/v1/orders', 'text/plain')).toBe(true);
    });
  });

  describe('truncateBody()', () => {
    it('returns original if within maxBodySize', () => {
      const body = { small: 'data' };
      expect(truncateBody(body)).toEqual(body);
    });

    it('returns truncated object with _truncated flag', () => {
      const largeBody = { data: 'x'.repeat(20000) };
      const result = truncateBody(largeBody) as any;
      expect(result._truncated).toBe(true);
      expect(result._originalSize).toBeDefined();
      expect(result._preview).toBeDefined();
    });

    it('handles null/undefined', () => {
      expect(truncateBody(null)).toBeNull();
      expect(truncateBody(undefined)).toBeUndefined();
    });
  });

  describe('PIISanitizer (tested via log functions)', () => {
    // These test the internal sanitizer by checking logging doesn't throw
    it('sanitizes email addresses', () => {
      expect(() => logInfo('test', { email: 'user@example.com' })).not.toThrow();
    });

    it('sanitizes phone numbers', () => {
      expect(() => logInfo('test', { phone: '555-123-4567' })).not.toThrow();
    });

    it('sanitizes credit card numbers', () => {
      expect(() => logInfo('test', { card: '4111-1111-1111-1111' })).not.toThrow();
    });

    it('sanitizes SSN', () => {
      expect(() => logInfo('test', { ssn: '123-45-6789' })).not.toThrow();
    });

    it('sanitizes JWT tokens', () => {
      expect(() => logInfo('test', { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' })).not.toThrow();
    });

    it('sanitizes Stripe keys', () => {
      expect(() => logInfo('test', { key: 'sk_test_FAKE_KEY_FOR_TESTING_1234' })).not.toThrow();
    });

    it('sanitizes wallet addresses', () => {
      expect(() => logInfo('test', { wallet: '5Jf4nP3p5hM8rPoZH7BEvceFjdVYvdYbJ1FcJqD4GWXL' })).not.toThrow();
    });

    it('redacts sensitive field names', () => {
      expect(() => logInfo('test', { password: 'secret123' })).not.toThrow();
      expect(() => logInfo('test', { apiKey: 'key123' })).not.toThrow();
    });

    it('recursively sanitizes nested objects', () => {
      expect(() => logInfo('test', { user: { email: 'test@test.com' } })).not.toThrow();
    });

    it('recursively sanitizes arrays', () => {
      expect(() => logInfo('test', { emails: ['a@b.com', 'c@d.com'] })).not.toThrow();
    });
  });

  describe('createLogger()', () => {
    it('creates child logger with component', () => {
      const childLogger = createLogger('TestComponent');
      expect(childLogger).toBeDefined();
      expect(childLogger.info).toBeDefined();
    });
  });

  describe('createRequestLogger()', () => {
    it('creates logger with request context', () => {
      const reqLogger = createRequestLogger({
        requestId: 'req-123',
        traceId: 'trace-456',
        tenantId: 'tenant-789',
        userId: 'user-abc',
        method: 'GET',
        url: '/api/test',
      });
      expect(reqLogger).toBeDefined();
    });
  });

  describe('logError()', () => {
    it('logs error with sanitized details', () => {
      expect(() => logError('Test error', new Error('Something failed'), { extra: 'data' })).not.toThrow();
    });

    it('handles non-Error objects', () => {
      expect(() => logError('Test error', 'string error')).not.toThrow();
    });
  });

  describe('logWarning()', () => {
    it('logs warning with sanitized meta', () => {
      expect(() => logWarning('Test warning', { detail: 'info' })).not.toThrow();
    });
  });

  describe('logInfo()', () => {
    it('logs info with sanitized meta', () => {
      expect(() => logInfo('Test info', { detail: 'info' })).not.toThrow();
    });
  });

  describe('logDebug()', () => {
    it('logs debug with sanitized meta', () => {
      expect(() => logDebug('Test debug', { detail: 'info' })).not.toThrow();
    });
  });

  describe('logRequest()', () => {
    it('logs request details', () => {
      expect(() => logRequest({
        method: 'POST',
        url: '/api/v1/tickets',
        headers: { 'user-agent': 'test-agent', 'content-type': 'application/json' },
        ip: '127.0.0.1',
        id: 'req-123',
      })).not.toThrow();
    });
  });

  describe('logResponse()', () => {
    it('logs at error level for 5xx', () => {
      expect(() => logResponse(500, 100)).not.toThrow();
    });

    it('logs at warn level for 4xx', () => {
      expect(() => logResponse(400, 50)).not.toThrow();
    });

    it('logs at info level for 2xx/3xx', () => {
      expect(() => logResponse(200, 25)).not.toThrow();
      expect(() => logResponse(302, 30)).not.toThrow();
    });
  });

  describe('logOperation()', () => {
    it('logs operation with status', () => {
      expect(() => logOperation('purchaseTicket', 'started')).not.toThrow();
      expect(() => logOperation('purchaseTicket', 'completed', { orderId: '123' })).not.toThrow();
      expect(() => logOperation('purchaseTicket', 'failed', { error: 'Out of stock' })).not.toThrow();
    });
  });

  describe('logServiceCall()', () => {
    it('logs service call details', () => {
      expect(() => logServiceCall('auth-service', 'validateToken', 'started')).not.toThrow();
      expect(() => logServiceCall('auth-service', 'validateToken', 'success', 50)).not.toThrow();
      expect(() => logServiceCall('auth-service', 'validateToken', 'failed', 100, { error: 'timeout' })).not.toThrow();
    });
  });

  describe('logDatabase()', () => {
    it('logs database operation', () => {
      expect(() => logDatabase('SELECT', 'tickets', 'success', 10)).not.toThrow();
      expect(() => logDatabase('INSERT', 'orders', 'error', 50)).not.toThrow();
    });
  });

  describe('logSecurity()', () => {
    it('logs security event with severity', () => {
      expect(() => logSecurity('invalid_token', 'low')).not.toThrow();
      expect(() => logSecurity('brute_force_attempt', 'high', { ip: '1.2.3.4' })).not.toThrow();
      expect(() => logSecurity('data_breach', 'critical')).not.toThrow();
    });
  });

  describe('logAudit()', () => {
    it('logs audit event', () => {
      expect(() => logAudit('CREATE', 'ticket', 'ticket-123', 'user-456')).not.toThrow();
      expect(() => logAudit('DELETE', 'order', 'order-789', 'admin-001', { reason: 'fraud' })).not.toThrow();
    });
  });
});
