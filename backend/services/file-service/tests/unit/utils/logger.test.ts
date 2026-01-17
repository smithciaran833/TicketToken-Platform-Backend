// Unmock the logger so we test the real implementation
jest.unmock('../../../src/utils/logger');

// Mock pino at the low level
const mockDebug = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockFatal = jest.fn();
const mockChild = jest.fn();

jest.mock('pino', () => {
  const pino: any = jest.fn(() => ({
    debug: mockDebug,
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    fatal: mockFatal,
    child: mockChild,
  }));

  pino.stdTimeFunctions = {
    isoTime: jest.fn(() => `,"time":"${new Date().toISOString()}"`),
    epochTime: jest.fn(() => `,"time":${Date.now()}`),
    unixTime: jest.fn(() => `,"time":${Math.floor(Date.now() / 1000)}`),
    nullTime: jest.fn(() => ''),
  };
  pino.stdSerializers = {
    err: jest.fn((err: any) => ({ message: err.message, stack: err.stack })),
    req: jest.fn(),
    res: jest.fn(),
  };
  return pino;
});

describe('utils/logger', () => {
  let loggerModule: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to get fresh imports with our pino mock
    jest.resetModules();
    
    // Re-mock pino after reset
    jest.doMock('pino', () => {
      const pino: any = jest.fn(() => ({
        debug: mockDebug,
        info: mockInfo,
        warn: mockWarn,
        error: mockError,
        fatal: mockFatal,
        child: mockChild,
      }));

      pino.stdTimeFunctions = {
        isoTime: jest.fn(() => `,"time":"${new Date().toISOString()}"`),
        epochTime: jest.fn(() => `,"time":${Date.now()}`),
        unixTime: jest.fn(() => `,"time":${Math.floor(Date.now() / 1000)}`),
        nullTime: jest.fn(() => ''),
      };
      pino.stdSerializers = {
        err: jest.fn((err: any) => ({ message: err.message, stack: err.stack })),
        req: jest.fn(),
        res: jest.fn(),
      };
      return pino;
    });

    // Now require the real logger module (it will use our mocked pino)
    loggerModule = require('../../../src/utils/logger');

    // Set up child mock to return a logger-like object
    mockChild.mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    });
  });

  describe('logger', () => {
    it('should be defined', () => {
      expect(loggerModule.logger).toBeDefined();
    });

    it('should have logging methods', () => {
      expect(typeof loggerModule.logger.debug).toBe('function');
      expect(typeof loggerModule.logger.info).toBe('function');
      expect(typeof loggerModule.logger.warn).toBe('function');
      expect(typeof loggerModule.logger.error).toBe('function');
      expect(typeof loggerModule.logger.fatal).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof loggerModule.logger.child).toBe('function');
    });
  });

  describe('createChildLogger', () => {
    it('should create child logger with correlation ID', () => {
      const context = { correlationId: 'test-123' };

      loggerModule.createChildLogger(context);

      expect(mockChild).toHaveBeenCalledWith(context);
    });

    it('should include all context properties', () => {
      const context = {
        correlationId: 'cor-123',
        requestId: 'req-456',
        tenantId: 'tenant-789',
        userId: 'user-001',
      };

      loggerModule.createChildLogger(context);

      expect(mockChild).toHaveBeenCalledWith(context);
    });

    it('should handle additional context properties', () => {
      const context = {
        correlationId: 'test-123',
        customField: 'custom-value',
      };

      loggerModule.createChildLogger(context);

      expect(mockChild).toHaveBeenCalledWith(context);
    });

    it('should return logger instance', () => {
      const childLogger = loggerModule.createChildLogger({ correlationId: 'test' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  describe('createRequestLogger', () => {
    it('should create logger with request context', () => {
      const request = {
        correlationId: 'cor-123',
        id: 'req-456',
        tenantId: 'tenant-789',
      };

      loggerModule.createRequestLogger(request);

      expect(mockChild).toHaveBeenCalledWith({
        correlationId: 'cor-123',
        requestId: 'req-456',
        tenantId: 'tenant-789',
      });
    });

    it('should default to "unknown" for missing correlation ID', () => {
      const request = { id: 'req-123' };

      loggerModule.createRequestLogger(request);

      expect(mockChild).toHaveBeenCalledWith({
        correlationId: 'unknown',
        requestId: 'req-123',
        tenantId: undefined,
      });
    });

    it('should handle empty request', () => {
      loggerModule.createRequestLogger({});

      expect(mockChild).toHaveBeenCalledWith({
        correlationId: 'unknown',
        requestId: undefined,
        tenantId: undefined,
      });
    });
  });

  describe('getLogMetrics', () => {
    it('should return metrics object', () => {
      const metrics = loggerModule.getLogMetrics();

      expect(metrics).toHaveProperty('debug');
      expect(metrics).toHaveProperty('info');
      expect(metrics).toHaveProperty('warn');
      expect(metrics).toHaveProperty('error');
      expect(metrics).toHaveProperty('fatal');
    });

    it('should return numbers for all metrics', () => {
      const metrics = loggerModule.getLogMetrics();

      expect(typeof metrics.debug).toBe('number');
      expect(typeof metrics.info).toBe('number');
      expect(typeof metrics.warn).toBe('number');
      expect(typeof metrics.error).toBe('number');
      expect(typeof metrics.fatal).toBe('number');
    });
  });

  describe('loggerWithMetrics', () => {
    it('should have all logging methods', () => {
      expect(typeof loggerModule.loggerWithMetrics.debug).toBe('function');
      expect(typeof loggerModule.loggerWithMetrics.info).toBe('function');
      expect(typeof loggerModule.loggerWithMetrics.warn).toBe('function');
      expect(typeof loggerModule.loggerWithMetrics.error).toBe('function');
      expect(typeof loggerModule.loggerWithMetrics.fatal).toBe('function');
    });

    it('should call logger and increment debug metric', () => {
      const beforeMetrics = loggerModule.getLogMetrics();

      loggerModule.loggerWithMetrics.debug('test message');

      const afterMetrics = loggerModule.getLogMetrics();
      expect(afterMetrics.debug).toBe(beforeMetrics.debug + 1);
      expect(mockDebug).toHaveBeenCalled();
    });

    it('should call logger and increment info metric', () => {
      const beforeMetrics = loggerModule.getLogMetrics();

      loggerModule.loggerWithMetrics.info('test message');

      const afterMetrics = loggerModule.getLogMetrics();
      expect(afterMetrics.info).toBe(beforeMetrics.info + 1);
      expect(mockInfo).toHaveBeenCalled();
    });

    it('should call logger and increment warn metric', () => {
      const beforeMetrics = loggerModule.getLogMetrics();

      loggerModule.loggerWithMetrics.warn('test message');

      const afterMetrics = loggerModule.getLogMetrics();
      expect(afterMetrics.warn).toBe(beforeMetrics.warn + 1);
      expect(mockWarn).toHaveBeenCalled();
    });

    it('should call logger and increment error metric', () => {
      const beforeMetrics = loggerModule.getLogMetrics();

      loggerModule.loggerWithMetrics.error('test message');

      const afterMetrics = loggerModule.getLogMetrics();
      expect(afterMetrics.error).toBe(beforeMetrics.error + 1);
      expect(mockError).toHaveBeenCalled();
    });

    it('should handle string messages', () => {
      expect(() => loggerModule.loggerWithMetrics.info('simple string')).not.toThrow();
    });

    it('should handle object with message', () => {
      expect(() => loggerModule.loggerWithMetrics.info({ data: 'test' }, 'message')).not.toThrow();
    });
  });

  describe('sanitizeForLogging', () => {
    it('should redact password field', () => {
      const obj = { password: 'secret123', username: 'user' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.password).toBe('[REDACTED]');
      expect(result.username).toBe('user');
    });

    it('should redact token field', () => {
      const obj = { token: 'abc123', data: 'public' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.token).toBe('[REDACTED]');
      expect(result.data).toBe('public');
    });

    it('should redact authorization field', () => {
      const obj = { authorization: 'Bearer token', id: '123' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.authorization).toBe('[REDACTED]');
      expect(result.id).toBe('123');
    });

    it('should redact apiKey field', () => {
      const obj = { apiKey: 'key123', name: 'test' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('should redact secret field', () => {
      const obj = { secret: 'shh', value: 'public' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.secret).toBe('[REDACTED]');
    });

    it('should redact privateKey field', () => {
      const obj = { privateKey: 'key', data: 'test' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.privateKey).toBe('[REDACTED]');
    });

    it('should redact ssn field', () => {
      const obj = { ssn: '123-45-6789', name: 'John' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.ssn).toBe('[REDACTED]');
    });

    it('should redact creditCard field', () => {
      const obj = { creditCard: '4111111111111111', amount: 100 };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.creditCard).toBe('[REDACTED]');
    });

    it('should redact cardNumber field', () => {
      const obj = { cardNumber: '4111', cvv: '123' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.cardNumber).toBe('[REDACTED]');
      expect(result.cvv).toBe('[REDACTED]');
    });

    it('should be case insensitive', () => {
      const obj = { PASSWORD: 'secret', Token: 'abc' };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.Token).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          password: 'secret',
          name: 'John',
        },
      };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.user.password).toBe('[REDACTED]');
      expect(result.user.name).toBe('John');
    });

    it('should handle arrays', () => {
      const obj = {
        users: [
          { password: 'secret1', name: 'User1' },
          { password: 'secret2', name: 'User2' },
        ],
      };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.users[0].password).toBe('[REDACTED]');
      expect(result.users[0].name).toBe('User1');
      expect(result.users[1].password).toBe('[REDACTED]');
    });

    it('should handle null values', () => {
      const result = loggerModule.sanitizeForLogging(null as any);
      expect(result).toBeNull();
    });

    it('should handle undefined', () => {
      const result = loggerModule.sanitizeForLogging(undefined as any);
      expect(result).toBeUndefined();
    });

    it('should preserve non-sensitive data', () => {
      const obj = {
        id: 123,
        name: 'Test',
        data: { value: 'public' },
      };
      const result = loggerModule.sanitizeForLogging(obj);

      expect(result.id).toBe(123);
      expect(result.name).toBe('Test');
      expect(result.data.value).toBe('public');
    });
  });

  describe('logAndThrow', () => {
    it('should log error and throw', () => {
      const error = new Error('Test error');

      expect(() => loggerModule.logAndThrow(error)).toThrow('Test error');
      expect(mockError).toHaveBeenCalled();
    });

    it('should include context in log', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };

      expect(() => loggerModule.logAndThrow(error, context)).toThrow();
      expect(mockError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test error',
          userId: '123',
          action: 'test',
        }),
        'Error thrown'
      );
    });

    it('should throw the original error', () => {
      const error = new Error('Specific error');

      try {
        loggerModule.logAndThrow(error);
      } catch (e) {
        expect(e).toBe(error);
        expect((e as Error).message).toBe('Specific error');
      }
    });
  });

  describe('auditLog', () => {
    it('should log audit event', () => {
      const event = {
        action: 'file_upload',
        resource: 'file',
        resourceId: 'file-123',
        tenantId: 'tenant-1',
        userId: 'user-1',
        outcome: 'success' as const,
      };

      loggerModule.auditLog(event);

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audit',
          action: 'file_upload',
          resource: 'file',
          resourceId: 'file-123',
          tenantId: 'tenant-1',
          userId: 'user-1',
          outcome: 'success',
        }),
        expect.any(String)
      );
    });

    it('should include optional fields', () => {
      const event = {
        action: 'delete',
        resource: 'file',
        tenantId: 'tenant-1',
        outcome: 'failure' as const,
        reason: 'Permission denied',
        metadata: { fileSize: 1024 },
      };

      loggerModule.auditLog(event);

      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audit',
          reason: 'Permission denied',
          metadata: { fileSize: 1024 },
        }),
        expect.any(String)
      );
    });

    it('should format message correctly', () => {
      const event = {
        action: 'create',
        resource: 'folder',
        tenantId: 'tenant-1',
        outcome: 'success' as const,
      };

      loggerModule.auditLog(event);

      expect(mockInfo).toHaveBeenCalledWith(
        expect.any(Object),
        'Audit: create on folder'
      );
    });
  });
});
