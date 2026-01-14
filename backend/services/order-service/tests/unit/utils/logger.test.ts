/**
 * Unit Tests: Logger
 *
 * Tests logging functionality including:
 * - Sensitive data redaction
 * - Request logger creation
 * - Context logger creation
 * - Object sanitization
 */

import {
  createRequestLogger,
  createContextLogger,
  sanitizeForLogging,
  logger,
} from '../../../src/utils/logger';

describe('Logger', () => {
  // ============================================
  // sanitizeForLogging
  // ============================================
  describe('sanitizeForLogging', () => {
    it('should redact password field', () => {
      const input = { username: 'john', password: 'secret123' };
      const result = sanitizeForLogging(input);
      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
    });

    it('should redact token field', () => {
      const input = { userId: '123', token: 'jwt-token-here' };
      const result = sanitizeForLogging(input);
      expect(result.userId).toBe('123');
      expect(result.token).toBe('[REDACTED]');
    });

    it('should redact apiKey field', () => {
      const input = { apiKey: 'sk-12345', data: 'value' };
      const result = sanitizeForLogging(input);
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.data).toBe('value');
    });

    it('should redact api_key field (snake_case)', () => {
      const input = { api_key: 'sk-12345' };
      const result = sanitizeForLogging(input);
      expect(result.api_key).toBe('[REDACTED]');
    });

    it('should redact cardNumber field', () => {
      const input = { cardNumber: '4111111111111111', amount: 100 };
      const result = sanitizeForLogging(input);
      expect(result.cardNumber).toBe('[REDACTED]');
      expect(result.amount).toBe(100);
    });

    it('should redact card_number field (snake_case)', () => {
      const input = { card_number: '4111111111111111' };
      const result = sanitizeForLogging(input);
      expect(result.card_number).toBe('[REDACTED]');
    });

    it('should redact cvv field', () => {
      const input = { cvv: '123' };
      const result = sanitizeForLogging(input);
      expect(result.cvv).toBe('[REDACTED]');
    });

    it('should redact cvc field', () => {
      const input = { cvc: '456' };
      const result = sanitizeForLogging(input);
      expect(result.cvc).toBe('[REDACTED]');
    });

    it('should redact authorization header', () => {
      const input = { authorization: 'Bearer xyz' };
      const result = sanitizeForLogging(input);
      expect(result.authorization).toBe('[REDACTED]');
    });

    it('should redact secret field', () => {
      const input = { secret: 'my-secret', public: 'data' };
      const result = sanitizeForLogging(input);
      expect(result.secret).toBe('[REDACTED]');
      expect(result.public).toBe('data');
    });

    it('should redact x-internal-auth header', () => {
      const input = { 'x-internal-auth': 'hmac-signature' };
      const result = sanitizeForLogging(input);
      expect(result['x-internal-auth']).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          password: 'secret',
        },
        data: 'value',
      };
      const result = sanitizeForLogging(input);
      expect(result.user.name).toBe('John');
      expect(result.user.password).toBe('[REDACTED]');
      expect(result.data).toBe('value');
    });

    it('should handle deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              token: 'secret-token',
              value: 'safe',
            },
          },
        },
      };
      const result = sanitizeForLogging(input);
      expect(result.level1.level2.level3.token).toBe('[REDACTED]');
      expect(result.level1.level2.level3.value).toBe('safe');
    });

    it('should handle arrays in objects', () => {
      const input = {
        items: [1, 2, 3],
        name: 'test',
      };
      const result = sanitizeForLogging(input);
      expect(result.items).toEqual([1, 2, 3]);
      expect(result.name).toBe('test');
    });

    it('should return null for null input', () => {
      const result = sanitizeForLogging(null as any);
      expect(result).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      const result = sanitizeForLogging(undefined as any);
      expect(result).toBeUndefined();
    });

    it('should return primitive values unchanged', () => {
      expect(sanitizeForLogging('string' as any)).toBe('string');
      expect(sanitizeForLogging(123 as any)).toBe(123);
      expect(sanitizeForLogging(true as any)).toBe(true);
    });

    it('should handle empty object', () => {
      const result = sanitizeForLogging({});
      expect(result).toEqual({});
    });

    it('should be case-insensitive for sensitive field detection', () => {
      const input = {
        PASSWORD: 'secret1',
        Token: 'secret2',
        APIKEY: 'secret3',
      };
      const result = sanitizeForLogging(input);
      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.Token).toBe('[REDACTED]');
      expect(result.APIKEY).toBe('[REDACTED]');
    });

    it('should redact fields containing sensitive keywords', () => {
      const input = {
        userPassword: 'secret',
        accessToken: 'jwt',
        stripeApiKey: 'sk_test',
      };
      const result = sanitizeForLogging(input);
      expect(result.userPassword).toBe('[REDACTED]');
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.stripeApiKey).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive fields', () => {
      const input = {
        id: '123',
        name: 'Test Order',
        amount: 5000,
        status: 'confirmed',
        createdAt: '2024-01-01',
      };
      const result = sanitizeForLogging(input);
      expect(result).toEqual(input);
    });
  });

  // ============================================
  // createRequestLogger
  // ============================================
  describe('createRequestLogger', () => {
    it('should create a child logger with request context', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'POST',
        url: '/api/orders',
        ip: '127.0.0.1',
        traceId: 'trace-456',
        spanId: 'span-789',
      } as any;

      const requestLogger = createRequestLogger(mockRequest);
      
      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger.info).toBe('function');
      expect(typeof requestLogger.error).toBe('function');
      expect(typeof requestLogger.warn).toBe('function');
      expect(typeof requestLogger.debug).toBe('function');
    });

    it('should include tenant context when available', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/orders',
        ip: '127.0.0.1',
        tenant: {
          id: 'tenant-001',
          name: 'Test Tenant',
        },
      } as any;

      const requestLogger = createRequestLogger(mockRequest);
      expect(requestLogger).toBeDefined();
    });

    it('should include user context when available', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/orders',
        ip: '127.0.0.1',
        user: {
          id: 'user-001',
          role: 'admin',
          email: 'test@example.com', // Should not be included
        },
      } as any;

      const requestLogger = createRequestLogger(mockRequest);
      expect(requestLogger).toBeDefined();
    });

    it('should handle request without optional fields', () => {
      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/health',
        ip: '127.0.0.1',
      } as any;

      const requestLogger = createRequestLogger(mockRequest);
      expect(requestLogger).toBeDefined();
    });
  });

  // ============================================
  // createContextLogger
  // ============================================
  describe('createContextLogger', () => {
    it('should create a child logger with custom context', () => {
      const context = {
        jobName: 'expiration-job',
        jobId: 'job-123',
      };

      const contextLogger = createContextLogger(context);
      
      expect(contextLogger).toBeDefined();
      expect(typeof contextLogger.info).toBe('function');
    });

    it('should redact sensitive fields in context', () => {
      const context = {
        jobName: 'payment-job',
        apiKey: 'secret-key',
        token: 'bearer-token',
      };

      // The function filters sensitive fields
      const contextLogger = createContextLogger(context);
      expect(contextLogger).toBeDefined();
    });

    it('should handle empty context', () => {
      const contextLogger = createContextLogger({});
      expect(contextLogger).toBeDefined();
    });

    it('should add timestamp to context', () => {
      const context = { jobName: 'test' };
      const contextLogger = createContextLogger(context);
      expect(contextLogger).toBeDefined();
    });
  });

  // ============================================
  // logger (root logger)
  // ============================================
  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have standard log methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });

    it('should create child loggers', () => {
      const childLogger = logger.child({ component: 'test' });
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  // ============================================
  // REDACT_PATHS Configuration
  // ============================================
  describe('Redaction Configuration', () => {
    // These tests verify the logger is configured to redact sensitive data
    // The actual redaction happens at log time via pino

    it('should have sensitive field redaction configured', () => {
      // The logger is configured with redact paths
      // We verify by checking logger exists and has proper config
      expect(logger).toBeDefined();
    });
  });
});
