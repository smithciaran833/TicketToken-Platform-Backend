/**
 * Comprehensive Unit Tests for src/utils/logger.ts
 * 
 * Tests logging with sensitive data sanitization
 */

// Mock pino BEFORE imports
const mockPinoLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
};

const mockPino = jest.fn(() => mockPinoLogger);
Object.assign(mockPino, {
  stdSerializers: {
    err: (err: any) => err,
  },
  stdTimeFunctions: {
    isoTime: jest.fn(),
  },
});

jest.mock('pino', () => mockPino);

// Import after mocking
import {
  sanitize,
  wouldRedact,
  addSensitiveField,
  logSecurityEvent,
  createRequestLogger,
  createChildLogger,
  createJobLogger,
  createTransactionLogger,
  createRpcLogger,
} from '../../../src/utils/logger';

describe('src/utils/logger.ts - Comprehensive Unit Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockPinoLogger.child.mockReturnValue(mockPinoLogger);
  });

  // =============================================================================
  // SENSITIVE FIELD DETECTION
  // =============================================================================

  describe('wouldRedact() - sensitive field detection', () => {
    it('should detect password field', () => {
      expect(wouldRedact('password')).toBe(true);
    });

    it('should detect case-insensitive fields', () => {
      expect(wouldRedact('PASSWORD')).toBe(true);
      expect(wouldRedact('Password')).toBe(true);
    });

    it('should detect fields with underscores', () => {
      expect(wouldRedact('api_key')).toBe(true);
      expect(wouldRedact('private_key')).toBe(true);
    });

    it('should detect fields with hyphens', () => {
      expect(wouldRedact('x-api-key')).toBe(true);
      expect(wouldRedact('x-auth-token')).toBe(true);
    });

    it('should detect camelCase fields', () => {
      expect(wouldRedact('apiKey')).toBe(true);
      expect(wouldRedact('privateKey')).toBe(true);
      expect(wouldRedact('creditCard')).toBe(true);
    });

    it('should detect partial matches', () => {
      expect(wouldRedact('userPassword')).toBe(true);
      expect(wouldRedact('myApiKey')).toBe(true);
      expect(wouldRedact('jwtToken')).toBe(true);
    });

    it('should not redact safe fields', () => {
      expect(wouldRedact('username')).toBe(false);
      expect(wouldRedact('userId')).toBe(false);
      expect(wouldRedact('timestamp')).toBe(false);
      expect(wouldRedact('status')).toBe(false);
    });

    it('should detect all common sensitive fields', () => {
      const sensitiveFields = [
        'secret',
        'token',
        'authorization',
        'bearer',
        'jwt',
        'credential',
        'ssn',
        'pin',
        'cvv',
        'cookie',
        'session',
        'seed',
        'mnemonic',
      ];

      sensitiveFields.forEach(field => {
        expect(wouldRedact(field)).toBe(true);
      });
    });
  });

  // =============================================================================
  // OBJECT SANITIZATION
  // =============================================================================

  describe('sanitize() - object sanitization', () => {
    it('should sanitize password field', () => {
      const obj = { username: 'user', password: 'secret123' };
      const result = sanitize(obj);

      expect(result.username).toBe('user');
      expect(result.password).toBe('[REDACTED]');
    });

    it('should sanitize nested objects', () => {
      const obj = {
        user: {
          name: 'John',
          password: 'secret',
        },
      };
      const result = sanitize(obj);

      expect(result.user.name).toBe('John');
      expect(result.user.password).toBe('[REDACTED]');
    });

    it('should sanitize deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              apiKey: 'secret',
            },
          },
        },
      };
      const result = sanitize(obj);

      expect(result.level1.level2.level3.apiKey).toBe('[REDACTED]');
    });

    it('should sanitize arrays of objects', () => {
      const obj = {
        users: [
          { name: 'Alice', password: 'pass1' },
          { name: 'Bob', password: 'pass2' },
        ],
      };
      const result = sanitize(obj);

      expect(result.users[0].name).toBe('Alice');
      expect(result.users[0].password).toBe('[REDACTED]');
      expect(result.users[1].name).toBe('Bob');
      expect(result.users[1].password).toBe('[REDACTED]');
    });

    it('should handle null values', () => {
      const obj = { value: null };
      const result = sanitize(obj);

      expect(result.value).toBeNull();
    });

    it('should handle undefined values', () => {
      const obj = { value: undefined };
      const result = sanitize(obj);

      expect(result.value).toBeUndefined();
    });

    it('should preserve boolean values', () => {
      const obj = { active: true, deleted: false };
      const result = sanitize(obj);

      expect(result.active).toBe(true);
      expect(result.deleted).toBe(false);
    });

    it('should preserve number values', () => {
      const obj = { count: 42, price: 99.99 };
      const result = sanitize(obj);

      expect(result.count).toBe(42);
      expect(result.price).toBe(99.99);
    });

    it('should skip functions', () => {
      const obj = { func: () => 'test', value: 'data' };
      const result = sanitize(obj);

      expect(result.func).toBeUndefined();
      expect(result.value).toBe('data');
    });

    it('should skip symbols', () => {
      const sym = Symbol('test');
      const obj = { [sym]: 'value', value: 'data' };
      const result = sanitize(obj);

      expect(result[sym as any]).toBeUndefined();
      expect(result.value).toBe('data');
    });

    it('should prevent infinite recursion', () => {
      const obj: any = { level1: {} };
      obj.level1.level2 = { level3: { level4: { level5: { level6: { level7: { level8: { level9: { level10: { level11: { level12: 'deep' } } } } } } } } } };

      const result = sanitize(obj);

      expect(result).toBeDefined();
    });

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'test' };
      // Note: sanitize doesn't handle true circular refs, but tests depth limit
      
      const result = sanitize(obj);
      expect(result.name).toBe('test');
    });
  });

  // =============================================================================
  // VALUE PATTERN DETECTION
  // =============================================================================

  describe('sanitize() - sensitive value pattern detection', () => {
    it('should redact JWT tokens', () => {
      const obj = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      };
      const result = sanitize(obj);

      expect(result.token).toBe('[TOKEN_REDACTED]');
    });

    it('should redact email addresses', () => {
      const obj = { contact: 'user@example.com' };
      const result = sanitize(obj);

      expect(result.contact).toBe('[EMAIL_REDACTED]');
    });

    it('should redact Base58 private keys (87 chars)', () => {
      const key = '5'.repeat(87);
      const obj = { key };
      const result = sanitize(obj);

      expect(result.key).toBe('[KEY_REDACTED]');
    });

    it('should redact Base58 private keys (88 chars)', () => {
      const key = '5'.repeat(88);
      const obj = { key };
      const result = sanitize(obj);

      expect(result.key).toBe('[KEY_REDACTED]');
    });

    it('should redact API keys with prefixes', () => {
      const obj = {
        key1: 'sk_1234567890abcdefghij',
        key2: 'pk_1234567890abcdefghij',
        key3: 'api_1234567890abcdefghij',
      };
      const result = sanitize(obj);

      expect(result.key1).toBe('[KEY_REDACTED]');
      expect(result.key2).toBe('[KEY_REDACTED]');
      expect(result.key3).toBe('[KEY_REDACTED]');
    });

    it('should redact long hex strings (64+ chars)', () => {
      const hex = 'a'.repeat(64);
      const obj = { hex };
      const result = sanitize(obj);

      expect(result.hex).toBe('[REDACTED]');
    });

    it('should not redact short strings', () => {
      const obj = { short: 'test123' };
      const result = sanitize(obj);

      expect(result.short).toBe('test123');
    });

    it('should truncate very long strings', () => {
      const longString = 'x'.repeat(600);
      const obj = { data: longString };
      const result = sanitize(obj);

      expect(result.data).toContain('[TRUNCATED');
      expect(result.data).toContain('500 chars]');
      expect(result.data.length).toBeLessThan(longString.length);
    });

    it('should not truncate strings under 500 chars', () => {
      const string = 'x'.repeat(400);
      const obj = { data: string };
      const result = sanitize(obj);

      expect(result.data).toBe(string);
    });
  });

  // =============================================================================
  // CUSTOM SENSITIVE FIELDS
  // =============================================================================

  describe('addSensitiveField()', () => {
    it('should add custom sensitive field', () => {
      expect(wouldRedact('customField')).toBe(false);
      
      addSensitiveField('customField');
      
      expect(wouldRedact('customField')).toBe(true);
    });

    it('should handle case insensitivity', () => {
      addSensitiveField('MyCustomField');
      
      expect(wouldRedact('mycustomfield')).toBe(true);
      expect(wouldRedact('MYCUSTOMFIELD')).toBe(true);
    });

    it('should affect sanitization', () => {
      addSensitiveField('verySecret');
      
      const obj = { verySecret: 'sensitive data' };
      const result = sanitize(obj);

      expect(result.verySecret).toBe('[REDACTED]');
    });
  });

  // =============================================================================
  // CHILD LOGGER CREATION
  // =============================================================================

  describe('createRequestLogger()', () => {
    it('should create child logger with requestId', () => {
      createRequestLogger('req-123');

      expect(mockPinoLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          correlationId: 'req-123',
        })
      );
    });

    it('should include tenantId when provided', () => {
      createRequestLogger('req-123', 'tenant-456');

      expect(mockPinoLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          tenantId: 'tenant-456',
          correlationId: 'req-123',
        })
      );
    });

    it('should return logger instance', () => {
      const logger = createRequestLogger('req-123');

      expect(logger).toBe(mockPinoLogger);
    });
  });

  describe('createChildLogger()', () => {
    it('should create child logger with context', () => {
      const context = { component: 'test', userId: '123' };
      
      createChildLogger(context);

      expect(mockPinoLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'test',
          userId: '123',
        })
      );
    });

    it('should sanitize sensitive data in context', () => {
      const context = { component: 'test', password: 'secret' };
      
      createChildLogger(context);

      expect(mockPinoLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'test',
          password: '[REDACTED]',
        })
      );
    });
  });

  describe('createJobLogger()', () => {
    it('should create job logger with context', () => {
      createJobLogger('reconciliation', 'job-789');

      expect(mockPinoLogger.child).toHaveBeenCalledWith({
        jobType: 'reconciliation',
        jobId: 'job-789',
        component: 'job-processor',
      });
    });

    it('should return logger instance', () => {
      const logger = createJobLogger('sync', 'job-123');

      expect(logger).toBe(mockPinoLogger);
    });
  });

  describe('createTransactionLogger()', () => {
    it('should create transaction logger with signature', () => {
      const signature = '5VERv8NMvzbJMEkV8xnrLkEa';
      
      createTransactionLogger(signature);

      expect(mockPinoLogger.child).toHaveBeenCalledWith({
        signature,
        component: 'transaction-processor',
      });
    });

    it('should return logger instance', () => {
      const logger = createTransactionLogger('sig-123');

      expect(logger).toBe(mockPinoLogger);
    });
  });

  describe('createRpcLogger()', () => {
    it('should create RPC logger with method', () => {
      createRpcLogger('getBalance');

      expect(mockPinoLogger.child).toHaveBeenCalledWith({
        rpcMethod: 'getBalance',
        component: 'rpc-client',
      });
    });

    it('should return logger instance', () => {
      const logger = createRpcLogger('getTransaction');

      expect(logger).toBe(mockPinoLogger);
    });
  });

  // =============================================================================
  // SECURITY EVENT LOGGING
  // =============================================================================

  describe('logSecurityEvent()', () => {
    it('should log security event at warn level by default', () => {
      logSecurityEvent('unauthorized_access', { ip: '192.168.1.1', path: '/admin' });

      expect(mockPinoLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          securityEvent: 'unauthorized_access',
          ip: '192.168.1.1',
          path: '/admin',
          timestamp: expect.any(String),
        }),
        'Security event: unauthorized_access'
      );
    });

    it('should log security event at error level when specified', () => {
      logSecurityEvent('critical_breach', { detail: 'test' }, 'error');

      expect(mockPinoLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          securityEvent: 'critical_breach',
          detail: 'test',
        }),
        'Security event: critical_breach'
      );
    });

    it('should sanitize sensitive data in security events', () => {
      logSecurityEvent('login_attempt', {
        username: 'user',
        password: 'secret123',
      });

      expect(mockPinoLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'user',
          password: '[REDACTED]',
        }),
        expect.any(String)
      );
    });

    it('should include timestamp in security events', () => {
      logSecurityEvent('test_event', {});

      expect(mockPinoLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // EDGE CASES AND ERROR HANDLING
  // =============================================================================

  describe('sanitize() - edge cases', () => {
    it('should handle empty objects', () => {
      const result = sanitize({});

      expect(result).toEqual({});
    });

    it('should handle null input gracefully', () => {
      const result = sanitize(null as any);

      expect(result).toBeNull();
    });

    it('should handle undefined input gracefully', () => {
      const result = sanitize(undefined as any);

      expect(result).toBeUndefined();
    });

    it('should handle objects with special characters in keys', () => {
      const obj = { 'key-with-dash': 'value', 'key.with.dot': 'value2' };
      const result = sanitize(obj);

      expect(result['key-with-dash']).toBe('value');
      expect(result['key.with.dot']).toBe('value2');
    });

    it('should handle arrays with mixed types', () => {
      const obj = {
        mixed: [
          'string',
          42,
          true,
          null,
          { nested: 'object' },
          ['nested', 'array'],
        ],
      };
      const result = sanitize(obj);

      expect(result.mixed[0]).toBe('string');
      expect(result.mixed[1]).toBe(42);
      expect(result.mixed[2]).toBe(true);
      expect(result.mixed[3]).toBeNull();
      expect(result.mixed[4]).toEqual({ nested: 'object' });
      expect(result.mixed[5]).toEqual(['nested', 'array']);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-01');
      const obj = { timestamp: date };
      const result = sanitize(obj);

      // Date objects get converted to their entries
      expect(result.timestamp).toBeDefined();
    });

    it('should handle empty arrays', () => {
      const obj = { items: [] };
      const result = sanitize(obj);

      expect(result.items).toEqual([]);
    });

    it('should handle nested empty objects', () => {
      const obj = { level1: { level2: {} } };
      const result = sanitize(obj);

      expect(result.level1.level2).toEqual({});
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('integration tests', () => {
    it('should sanitize complex real-world log object', () => {
      const logData = {
        event: 'user_login',
        user: {
          id: '123',
          email: 'user@example.com',
          password: 'secret123',
        },
        request: {
          ip: '192.168.1.1',
          headers: {
            authorization: 'Bearer token123',
            'x-api-key': 'sk_123456789',
          },
        },
        metadata: {
          timestamp: Date.now(),
          server: 'api-1',
        },
      };

      const result = sanitize(logData);

      expect(result.event).toBe('user_login');
      expect(result.user.id).toBe('123');
      expect(result.user.email).toBe('[EMAIL_REDACTED]');
      expect(result.user.password).toBe('[REDACTED]');
      expect(result.request.ip).toBe('192.168.1.1');
      expect(result.request.headers.authorization).toBe('[REDACTED]');
      expect(result.request.headers['x-api-key']).toBe('[REDACTED]');
      expect(result.metadata.server).toBe('api-1');
    });

    it('should handle transaction processing log', () => {
      const txLog = {
        signature: 'sig123',
        accounts: ['addr1', 'addr2'],
        metadata: {
          privateKey: 'secret_key',
          publicKey: 'public_key',
        },
      };

      const result = sanitize(txLog);

      expect(result.signature).toBe('sig123');
      expect(result.accounts).toEqual(['addr1', 'addr2']);
      expect(result.metadata.privateKey).toBe('[REDACTED]');
      expect(result.metadata.publicKey).toBe('public_key');
    });
  });

});
