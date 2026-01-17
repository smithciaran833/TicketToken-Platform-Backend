// Mock config BEFORE importing logger
jest.mock('../../../src/config/index', () => ({
  getConfig: jest.fn().mockReturnValue({ LOG_LEVEL: 'info' }),
  isProduction: jest.fn().mockReturnValue(false),
}));

// Mock winston properly
// winston.format is both a function AND has static methods
jest.mock('winston', () => {
  // The format function is called like: winston.format((info) => info)
  // It returns a factory function that when called returns a format object
  const formatFn: any = jest.fn().mockImplementation((transformFn: any) => {
    // Return a factory function
    return jest.fn().mockReturnValue({
      transform: transformFn,
    });
  });

  // Add static methods to format
  formatFn.combine = jest.fn().mockReturnValue({});
  formatFn.timestamp = jest.fn().mockReturnValue({});
  formatFn.json = jest.fn().mockReturnValue({});
  formatFn.colorize = jest.fn().mockReturnValue({});
  formatFn.printf = jest.fn().mockReturnValue({});

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };

  return {
    format: formatFn,
    createLogger: jest.fn().mockReturnValue(mockLogger),
    transports: {
      Console: jest.fn(),
    },
  };
});

import { logger, createRequestLogger, logWithContext, safeStringify } from '../../../src/utils/logger';

describe('Logger Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRequestLogger', () => {
    it('should create child logger with requestId', () => {
      const childLogger = createRequestLogger('req-123');

      expect(logger.child).toHaveBeenCalledWith({
        requestId: 'req-123',
        tenantId: undefined,
      });
      expect(childLogger).toBeDefined();
    });

    it('should create child logger with requestId and tenantId', () => {
      createRequestLogger('req-456', 'tenant-789');

      expect(logger.child).toHaveBeenCalledWith({
        requestId: 'req-456',
        tenantId: 'tenant-789',
      });
    });

    it('should handle empty requestId', () => {
      createRequestLogger('');

      expect(logger.child).toHaveBeenCalledWith({
        requestId: '',
        tenantId: undefined,
      });
    });
  });

  describe('logWithContext', () => {
    it('should log info with context', () => {
      logWithContext('info', 'Test message', {
        requestId: 'req-123',
        userId: 'user-456',
      });

      expect(logger.log).toHaveBeenCalledWith('info', 'Test message', expect.any(Object));
    });

    it('should log warn with context', () => {
      logWithContext('warn', 'Warning message', {
        requestId: 'req-123',
      });

      expect(logger.log).toHaveBeenCalledWith('warn', 'Warning message', expect.any(Object));
    });

    it('should log error with context', () => {
      logWithContext('error', 'Error message', {
        requestId: 'req-123',
        error: 'Something went wrong',
      });

      expect(logger.log).toHaveBeenCalledWith('error', 'Error message', expect.any(Object));
    });

    it('should log debug with context', () => {
      logWithContext('debug', 'Debug message', {
        data: { foo: 'bar' },
      });

      expect(logger.log).toHaveBeenCalledWith('debug', 'Debug message', expect.any(Object));
    });

    it('should redact sensitive data in context', () => {
      logWithContext('info', 'User action', {
        requestId: 'req-123',
        password: 'secret123',
        apiKey: 'sk_live_abc123',
      });

      expect(logger.log).toHaveBeenCalled();
      const loggedContext = (logger.log as jest.Mock).mock.calls[0][2];
      expect(loggedContext.password).toBe('[REDACTED]');
      expect(loggedContext.apiKey).toBe('[REDACTED]');
    });
  });

  describe('safeStringify', () => {
    it('should stringify simple objects', () => {
      const result = safeStringify({ foo: 'bar', count: 42 });

      expect(result).toBe('{"foo":"bar","count":42}');
    });

    it('should stringify arrays', () => {
      const result = safeStringify([1, 2, 3]);

      expect(result).toBe('[1,2,3]');
    });

    it('should redact sensitive fields', () => {
      const result = safeStringify({
        username: 'john',
        password: 'secret123',
      });

      const parsed = JSON.parse(result);
      expect(parsed.username).toBe('john');
      expect(parsed.password).toBe('[REDACTED]');
    });

    it('should redact API keys in strings', () => {
      const result = safeStringify({
        message: 'Using key sk_test_FAKE_KEY_FOR_UNIT_TEST',
      });

      expect(result).toContain('[STRIPE_SECRET_KEY]');
      expect(result).not.toContain('sk_live_');
    });

    it('should redact JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = safeStringify({
        token: jwt,
        message: `Bearer ${jwt}`,
      });

      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('eyJ');
    });

    it('should redact email addresses', () => {
      const result = safeStringify({
        user: 'john.doe@example.com',
      });

      expect(result).toContain('[EMAIL]');
      expect(result).not.toContain('john.doe@example.com');
    });

    it('should redact credit card numbers', () => {
      const result = safeStringify({
        card: '4111111111111111',
      });

      expect(result).toContain('[CARD_NUMBER]');
      expect(result).not.toContain('4111111111111111');
    });

    it('should redact SSN field (sensitive field takes precedence)', () => {
      // 'ssn' is in SENSITIVE_FIELDS, so it gets [REDACTED] before pattern matching
      const result = safeStringify({
        ssn: '123-45-6789',
      });

      const parsed = JSON.parse(result);
      expect(parsed.ssn).toBe('[REDACTED]');
    });

    it('should redact SSN pattern in non-sensitive field', () => {
      // When SSN pattern appears in a non-sensitive field name, pattern matching applies
      const result = safeStringify({
        taxId: '123-45-6789',
      });

      expect(result).toContain('[SSN]');
      expect(result).not.toContain('123-45-6789');
    });

    it('should handle nested objects', () => {
      const result = safeStringify({
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
            apiKey: 'key123',
          },
        },
      });

      const parsed = JSON.parse(result);
      expect(parsed.user.name).toBe('John');
      expect(parsed.user.credentials.password).toBe('[REDACTED]');
      expect(parsed.user.credentials.apiKey).toBe('[REDACTED]');
    });

    it('should handle deeply nested objects with max depth protection', () => {
      // The redactObject function limits depth to 10 levels
      const obj: any = { foo: 'bar' };
      obj.self = obj;

      const result = safeStringify(obj);

      // Circular refs are handled by depth limiting, not by throwing
      expect(result).toContain('[MAX_DEPTH_EXCEEDED]');
    });

    it('should handle null values', () => {
      const result = safeStringify(null);

      expect(result).toBe('null');
    });

    it('should handle undefined values in objects', () => {
      const result = safeStringify({ foo: undefined, bar: 'baz' });

      expect(result).toBe('{"bar":"baz"}');
    });

    it('should redact database connection strings', () => {
      const result = safeStringify({
        db: 'postgresql://user:password@localhost:5432/mydb',
      });

      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('user:password');
    });

    it('should redact multiple sensitive fields', () => {
      const result = safeStringify({
        accessToken: 'token123',
        refreshToken: 'refresh456',
        clientSecret: 'secret789',
        authorization: 'Bearer xyz',
      });

      const parsed = JSON.parse(result);
      expect(parsed.accessToken).toBe('[REDACTED]');
      expect(parsed.refreshToken).toBe('[REDACTED]');
      expect(parsed.clientSecret).toBe('[REDACTED]');
      expect(parsed.authorization).toBe('[REDACTED]');
    });

    it('should handle arrays with sensitive data', () => {
      const result = safeStringify([
        { email: 'test@example.com' },
        { password: 'secret' },
      ]);

      const parsed = JSON.parse(result);
      expect(parsed[0].email).toBe('[EMAIL]');
      expect(parsed[1].password).toBe('[REDACTED]');
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = safeStringify({ created: date });

      const parsed = JSON.parse(result);
      expect(parsed.created).toBe('2024-01-15T10:30:00.000Z');
    });
  });
});
