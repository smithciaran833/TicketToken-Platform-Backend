/**
 * Unit Tests for Logger Utility
 *
 * Tests logging utilities and configuration:
 * - safeLog redaction behavior
 * - Child logger creation
 * - Request logger creation
 * - Audit logging
 * - Configuration
 */

import { logger, createChildLogger, createRequestLogger, safeLog, logAuditEvent } from '../../../src/utils/logger';

describe('Logger - Utilities and Configuration', () => {
  describe('Safe Log Utility', () => {
    it('should redact sensitive keys in dynamic objects', () => {
      const unsafeData = {
        username: 'john',
        password: 'secret',
        apiKey: 'key123',
        email: 'john@example.com',
        publicData: 'safe-to-log'
      };

      const safe = safeLog(unsafeData);

      expect(safe.username).toBe('john');
      expect(safe.password).toBe('[REDACTED]');
      expect(safe.apiKey).toBe('[REDACTED]');
      expect(safe.email).toBe('[REDACTED]');
      expect(safe.publicData).toBe('safe-to-log');
    });

    it('should handle nested objects recursively', () => {
      const unsafeData = {
        user: {
          name: 'alice',
          credentials: {
            password: 'nested-secret',
            token: 'nested-token'
          }
        },
        publicInfo: 'visible'
      };

      const safe = safeLog(unsafeData);

      expect((safe.user as any).name).toBe('alice');
      expect((safe.user as any).credentials.password).toBe('[REDACTED]');
      expect((safe.user as any).credentials.token).toBe('[REDACTED]');
      expect(safe.publicInfo).toBe('visible');
    });

    it('should detect sensitive keys case-insensitively', () => {
      const unsafeData = {
        PASSWORD: 'secret1',
        ApiKey: 'secret2',
        SeCrEt: 'secret3',
        Authorization: 'Bearer token',
        normalField: 'safe'
      };

      const safe = safeLog(unsafeData);

      expect(safe.PASSWORD).toBe('[REDACTED]');
      expect(safe.ApiKey).toBe('[REDACTED]');
      expect(safe.SeCrEt).toBe('[REDACTED]');
      expect(safe.Authorization).toBe('[REDACTED]');
      expect(safe.normalField).toBe('safe');
    });

    it('should handle arrays and non-object values', () => {
      const unsafeData = {
        users: [
          { name: 'john', password: 'secret1' },
          { name: 'jane', password: 'secret2' }
        ],
        count: 42,
        enabled: true,
        nothing: null
      };

      const safe = safeLog(unsafeData);

      expect(Array.isArray(safe.users)).toBe(true);
      expect((safe.users as any)[0].name).toBe('john');
      expect((safe.users as any)[0].password).toBe('[REDACTED]');
      expect((safe.users as any)[1].password).toBe('[REDACTED]');
      expect(safe.count).toBe(42);
      expect(safe.enabled).toBe(true);
      expect(safe.nothing).toBeNull();
    });

    it('should redact multiple sensitive key types', () => {
      const data = {
        password: 'pass123',
        secret: 'secret123',
        token: 'token123',
        key: 'key123',
        authorization: 'auth123',
        privateKey: 'private123',
        phone: '555-1234',
        ssn: '123-45-6789',
        normalField: 'visible'
      };

      const safe = safeLog(data);

      expect(safe.password).toBe('[REDACTED]');
      expect(safe.secret).toBe('[REDACTED]');
      expect(safe.token).toBe('[REDACTED]');
      expect(safe.key).toBe('[REDACTED]');
      expect(safe.authorization).toBe('[REDACTED]');
      expect(safe.privateKey).toBe('[REDACTED]');
      expect(safe.phone).toBe('[REDACTED]');
      expect(safe.ssn).toBe('[REDACTED]');
      expect(safe.normalField).toBe('visible');
    });

    it('should handle empty and edge case objects', () => {
      expect(safeLog({})).toEqual({});
      
      const nullData = { value: null, undef: undefined };
      const safe = safeLog(nullData);
      expect(safe.value).toBeNull();
      expect(safe.undef).toBeUndefined();
    });

    it('should handle deeply nested structures', () => {
      const deep = {
        level1: {
          level2: {
            level3: {
              password: 'deep-secret',
              data: 'visible'
            }
          }
        }
      };

      const safe = safeLog(deep);
      expect((safe.level1 as any).level2.level3.password).toBe('[REDACTED]');
      expect((safe.level1 as any).level2.level3.data).toBe('visible');
    });
  });

  describe('Child Logger Creation', () => {
    it('should create child logger with additional context', () => {
      const childLogger = createChildLogger({ module: 'test-module', feature: 'feature-x' });
      
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.error).toBe('function');
      expect(typeof childLogger.warn).toBe('function');
      expect(typeof childLogger.debug).toBe('function');
    });

    it('should create child loggers with different contexts', () => {
      const child1 = createChildLogger({ module: 'auth' });
      const child2 = createChildLogger({ module: 'transfer', submodule: 'blockchain' });
      
      expect(child1).toBeDefined();
      expect(child2).toBeDefined();
      expect(child1).not.toBe(child2);
    });
  });

  describe('Request Logger Creation', () => {
    it('should create request logger with requestId', () => {
      const requestLogger = createRequestLogger('req-123');
      
      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger.info).toBe('function');
      expect(typeof requestLogger.error).toBe('function');
    });

    it('should create request logger with requestId and tenantId', () => {
      const requestLogger = createRequestLogger('req-456', 'tenant-789');
      
      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger.info).toBe('function');
    });

    it('should create different request loggers', () => {
      const req1 = createRequestLogger('req-1', 'tenant-1');
      const req2 = createRequestLogger('req-2', 'tenant-2');
      
      expect(req1).not.toBe(req2);
    });
  });

  describe('Audit Event Logging', () => {
    it('should accept audit event parameters', () => {
      // Should not throw
      expect(() => {
        logAuditEvent('USER_LOGIN', 'user-123', { ip: '192.168.1.1', success: true });
      }).not.toThrow();
    });

    it('should accept audit event with tenantId', () => {
      expect(() => {
        logAuditEvent('TRANSFER_INITIATED', 'user-456', { transferId: 'transfer-789' }, 'tenant-123');
      }).not.toThrow();
    });

    it('should handle sensitive data in audit details via safeLog', () => {
      // logAuditEvent uses safeLog internally, so sensitive data should be redacted
      const details = {
        action: 'password_change',
        oldPassword: 'old-secret',
        newPassword: 'new-secret'
      };

      const safe = safeLog(details);
      expect(safe.action).toBe('password_change');
      expect(safe.oldPassword).toBe('[REDACTED]');
      expect(safe.newPassword).toBe('[REDACTED]');
    });
  });

  describe('Logger Configuration', () => {
    it('should export logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should be silent in test environment', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(logger.level).toBe('silent');
    });

    it('should have required logging methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.trace).toBe('function');
    });
  });

  describe('Logger Methods Exist', () => {
    it('should not throw when calling logger methods', () => {
      // In test env, logger is silent but methods should still exist
      expect(() => logger.info('test')).not.toThrow();
      expect(() => logger.error('test')).not.toThrow();
      expect(() => logger.warn('test')).not.toThrow();
      expect(() => logger.debug('test')).not.toThrow();
    });

    it('should handle objects in log calls', () => {
      expect(() => logger.info({ test: 'data' }, 'message')).not.toThrow();
      expect(() => logger.error({ error: 'details' }, 'error message')).not.toThrow();
    });

    it('should handle sensitive data in log calls', () => {
      // Should not throw, and redaction should happen at pino level
      expect(() => {
        logger.info({ 
          username: 'john',
          password: 'secret',
          data: 'normal'
        }, 'User login');
      }).not.toThrow();
    });
  });

  describe('Integration with Child Loggers', () => {
    it('should allow child logger to log without errors', () => {
      const child = createChildLogger({ module: 'test' });
      
      expect(() => child.info('test message')).not.toThrow();
      expect(() => child.error('error message')).not.toThrow();
    });

    it('should allow request logger to log without errors', () => {
      const reqLogger = createRequestLogger('req-test-123', 'tenant-456');
      
      expect(() => reqLogger.info({ action: 'test' }, 'Request action')).not.toThrow();
      expect(() => reqLogger.error({ error: 'test' }, 'Request error')).not.toThrow();
    });
  });
});
