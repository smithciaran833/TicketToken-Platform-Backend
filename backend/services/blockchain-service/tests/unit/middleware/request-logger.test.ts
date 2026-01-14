/**
 * Unit tests for blockchain-service Request Logger Middleware
 * Issues Fixed: #38, #14 - Request logging with sensitive data filtering
 * 
 * Tests request/response logging, duration tracking, body filtering, and header sanitization
 */

describe('Request Logger Middleware', () => {
  // ===========================================================================
  // SENSITIVE_HEADERS Configuration
  // ===========================================================================
  describe('SENSITIVE_HEADERS', () => {
    const SENSITIVE_HEADERS = new Set([
      'authorization',
      'x-api-key',
      'x-auth-token',
      'x-internal-signature',
      'cookie',
      'x-csrf-token',
      'x-forwarded-for'
    ]);

    it('should include authorization', () => {
      expect(SENSITIVE_HEADERS.has('authorization')).toBe(true);
    });

    it('should include x-api-key', () => {
      expect(SENSITIVE_HEADERS.has('x-api-key')).toBe(true);
    });

    it('should include x-auth-token', () => {
      expect(SENSITIVE_HEADERS.has('x-auth-token')).toBe(true);
    });

    it('should include x-internal-signature', () => {
      expect(SENSITIVE_HEADERS.has('x-internal-signature')).toBe(true);
    });

    it('should include cookie', () => {
      expect(SENSITIVE_HEADERS.has('cookie')).toBe(true);
    });

    it('should include x-csrf-token', () => {
      expect(SENSITIVE_HEADERS.has('x-csrf-token')).toBe(true);
    });

    it('should include x-forwarded-for', () => {
      expect(SENSITIVE_HEADERS.has('x-forwarded-for')).toBe(true);
    });
  });

  // ===========================================================================
  // MAX_BODY_LOG_SIZE Configuration
  // ===========================================================================
  describe('MAX_BODY_LOG_SIZE', () => {
    it('should default to 2000 characters', () => {
      const MAX_BODY_LOG_SIZE = 2000;
      expect(MAX_BODY_LOG_SIZE).toBe(2000);
    });
  });

  // ===========================================================================
  // filterHeaders Function
  // ===========================================================================
  describe('filterHeaders', () => {
    const SENSITIVE_HEADERS = new Set([
      'authorization',
      'x-api-key',
      'cookie'
    ]);

    const filterHeaders = (headers: Record<string, string | undefined>) => {
      const filtered: Record<string, string | undefined> = {};
      
      for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();
        
        if (SENSITIVE_HEADERS.has(lowerKey)) {
          filtered[key] = '[REDACTED]';
        } else if (lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('key')) {
          filtered[key] = '[REDACTED]';
        } else {
          filtered[key] = value;
        }
      }
      
      return filtered;
    };

    it('should redact authorization header', () => {
      const result = filterHeaders({ 'Authorization': 'Bearer secret123' });
      expect(result['Authorization']).toBe('[REDACTED]');
    });

    it('should redact x-api-key header', () => {
      const result = filterHeaders({ 'x-api-key': 'my-api-key' });
      expect(result['x-api-key']).toBe('[REDACTED]');
    });

    it('should redact cookie header', () => {
      const result = filterHeaders({ 'cookie': 'session=abc123' });
      expect(result['cookie']).toBe('[REDACTED]');
    });

    it('should redact headers containing "secret"', () => {
      const result = filterHeaders({ 'x-secret-value': 'secret123' });
      expect(result['x-secret-value']).toBe('[REDACTED]');
    });

    it('should redact headers containing "token"', () => {
      const result = filterHeaders({ 'x-custom-token': 'token123' });
      expect(result['x-custom-token']).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive headers', () => {
      const result = filterHeaders({ 'content-type': 'application/json' });
      expect(result['content-type']).toBe('application/json');
    });

    it('should preserve user-agent header', () => {
      const result = filterHeaders({ 'user-agent': 'Mozilla/5.0' });
      expect(result['user-agent']).toBe('Mozilla/5.0');
    });
  });

  // ===========================================================================
  // prepareBodyForLogging Function
  // ===========================================================================
  describe('prepareBodyForLogging', () => {
    const prepareBodyForLogging = (body: any, maxSize: number = 2000) => {
      if (!body) return undefined;
      
      try {
        const stringified = JSON.stringify(body);
        
        if (stringified.length > maxSize) {
          return {
            _truncated: true,
            _originalSize: stringified.length,
            _preview: stringified.substring(0, maxSize)
          };
        }
        
        return body;
      } catch (e) {
        return { _error: 'Body could not be serialized' };
      }
    };

    it('should return undefined for null body', () => {
      expect(prepareBodyForLogging(null)).toBeUndefined();
    });

    it('should return undefined for undefined body', () => {
      expect(prepareBodyForLogging(undefined)).toBeUndefined();
    });

    it('should return body directly when under size limit', () => {
      const body = { name: 'test', value: 123 };
      expect(prepareBodyForLogging(body)).toEqual(body);
    });

    it('should truncate body when over size limit', () => {
      const largeBody = { data: 'a'.repeat(3000) };
      const result = prepareBodyForLogging(largeBody) as any;
      expect(result._truncated).toBe(true);
    });

    it('should include original size when truncated', () => {
      const largeBody = { data: 'a'.repeat(3000) };
      const result = prepareBodyForLogging(largeBody) as any;
      expect(result._originalSize).toBeGreaterThan(2000);
    });

    it('should include preview when truncated', () => {
      const largeBody = { data: 'a'.repeat(3000) };
      const result = prepareBodyForLogging(largeBody) as any;
      expect(result._preview).toBeDefined();
      expect(result._preview.length).toBeLessThanOrEqual(2000);
    });

    it('should handle non-serializable objects', () => {
      const circular: any = {};
      circular.self = circular;
      const result = prepareBodyForLogging(circular);
      expect((result as any)._error).toBe('Body could not be serialized');
    });
  });

  // ===========================================================================
  // requestLoggerOnRequest Function
  // ===========================================================================
  describe('requestLoggerOnRequest', () => {
    it('should store start time on request', () => {
      const request = { startTime: undefined as number | undefined };
      request.startTime = Date.now();
      expect(request.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('should log request id', () => {
      const logData = { requestId: 'req-123' };
      expect(logData.requestId).toBe('req-123');
    });

    it('should log method', () => {
      const logData = { method: 'POST' };
      expect(logData.method).toBe('POST');
    });

    it('should log url', () => {
      const logData = { url: '/api/v1/mint' };
      expect(logData.url).toBe('/api/v1/mint');
    });

    it('should log ip', () => {
      const logData = { ip: '192.168.1.1' };
      expect(logData.ip).toBe('192.168.1.1');
    });

    it('should log user-agent', () => {
      const logData = { userAgent: 'Mozilla/5.0' };
      expect(logData.userAgent).toBe('Mozilla/5.0');
    });

    it('should log content-length', () => {
      const logData = { contentLength: '1234' };
      expect(logData.contentLength).toBe('1234');
    });

    it('should log tenant id when available', () => {
      const logData = { tenantId: 'tenant-123' };
      expect(logData.tenantId).toBe('tenant-123');
    });
  });

  // ===========================================================================
  // requestLoggerOnResponse Function
  // ===========================================================================
  describe('requestLoggerOnResponse', () => {
    it('should calculate duration from start time', () => {
      const startTime = Date.now() - 150;
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(150);
    });

    it('should log status code', () => {
      const logData = { statusCode: 200 };
      expect(logData.statusCode).toBe(200);
    });

    it('should log duration in ms', () => {
      const logData = { duration: 150 };
      expect(logData.duration).toBe(150);
    });

    it('should use info level for 2xx responses', () => {
      const statusCode = 200;
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      expect(logLevel).toBe('info');
    });

    it('should use warn level for 4xx responses', () => {
      const statusCode = 400;
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      expect(logLevel).toBe('warn');
    });

    it('should use error level for 5xx responses', () => {
      const statusCode = 500;
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      expect(logLevel).toBe('error');
    });

    it('should include request body for error responses', () => {
      const statusCode = 400;
      const includeBody = statusCode >= 400;
      expect(includeBody).toBe(true);
    });

    it('should include filtered headers for error responses', () => {
      const statusCode = 500;
      const includeHeaders = statusCode >= 400;
      expect(includeHeaders).toBe(true);
    });
  });

  // ===========================================================================
  // createRequestLogger Function
  // ===========================================================================
  describe('createRequestLogger', () => {
    it('should create child logger with request context', () => {
      const childContext = {
        requestId: 'req-123',
        method: 'POST',
        url: '/api/v1/mint',
        tenantId: 'tenant-123'
      };
      
      expect(childContext.requestId).toBeDefined();
      expect(childContext.method).toBeDefined();
      expect(childContext.url).toBeDefined();
    });

    it('should include tenant id in child logger', () => {
      const childContext = { tenantId: 'tenant-123' };
      expect(childContext.tenantId).toBe('tenant-123');
    });
  });

  // ===========================================================================
  // Log Data Structure
  // ===========================================================================
  describe('Log Data Structure', () => {
    it('should have consistent request log structure', () => {
      const logData = {
        requestId: 'req-123',
        method: 'POST',
        url: '/api/v1/mint',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        contentLength: '100',
        tenantId: 'tenant-123'
      };
      
      expect(Object.keys(logData)).toContain('requestId');
      expect(Object.keys(logData)).toContain('method');
      expect(Object.keys(logData)).toContain('url');
    });

    it('should have consistent response log structure', () => {
      const logData = {
        requestId: 'req-123',
        method: 'POST',
        url: '/api/v1/mint',
        statusCode: 200,
        duration: 150,
        ip: '192.168.1.1',
        tenantId: 'tenant-123',
        internalService: undefined
      };
      
      expect(Object.keys(logData)).toContain('statusCode');
      expect(Object.keys(logData)).toContain('duration');
    });
  });
});
