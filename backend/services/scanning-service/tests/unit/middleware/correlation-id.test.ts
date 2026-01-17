// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/correlation-id.ts
 */

jest.mock('../../../src/utils/logger');
jest.mock('crypto');

describe('src/middleware/correlation-id.ts - Comprehensive Unit Tests', () => {
  let correlationId: any;
  let crypto: any;
  let logger: any;
  let mockRequest: any;
  let mockReply: any;
  let mockFastify: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock crypto
    crypto = require('crypto');
    crypto.randomUUID = jest.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000');

    // Mock logger
    logger = require('../../../src/utils/logger').default;

    // Import module under test
    correlationId = require('../../../src/middleware/correlation-id');

    // Mock request
    mockRequest = {
      headers: {},
      url: '/api/test',
      method: 'GET',
      user: undefined,
      tenantId: undefined,
      correlationId: undefined,
    };

    // Mock reply
    mockReply = {
      header: jest.fn().mockReturnThis(),
      statusCode: 200,
      elapsedTime: 50,
    };

    // Mock Fastify instance
    mockFastify = {
      addHook: jest.fn(),
    };
  });

  // =============================================================================
  // generateCorrelationId()
  // =============================================================================

  describe('generateCorrelationId()', () => {
    it('should generate a UUID v4 correlation ID', () => {
      const id = correlationId.generateCorrelationId();

      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(crypto.randomUUID).toHaveBeenCalled();
    });

    it('should generate unique IDs', () => {
      crypto.randomUUID
        .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440000')
        .mockReturnValueOnce('660e8400-e29b-41d4-a716-446655440001');

      const id1 = correlationId.generateCorrelationId();
      const id2 = correlationId.generateCorrelationId();

      expect(id1).not.toBe(id2);
    });
  });

  // =============================================================================
  // extractCorrelationId()
  // =============================================================================

  describe('extractCorrelationId()', () => {
    it('should extract from x-correlation-id header', () => {
      mockRequest.headers['x-correlation-id'] = 'corr-123';

      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBe('corr-123');
    });

    it('should extract from x-request-id header', () => {
      mockRequest.headers['x-request-id'] = 'req-456';

      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBe('req-456');
    });

    it('should extract from x-trace-id header', () => {
      mockRequest.headers['x-trace-id'] = 'trace-789';

      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBe('trace-789');
    });

    it('should extract from traceparent header', () => {
      mockRequest.headers['traceparent'] = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBe('4bf92f3577b34da6a3ce929d0e0e4736'); // Extracted trace-id
    });

    it('should handle array of header values', () => {
      mockRequest.headers['x-correlation-id'] = ['corr-1', 'corr-2'];

      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBe('corr-1'); // Takes first value
    });

    it('should return undefined when no correlation headers present', () => {
      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBeUndefined();
    });

    it('should prioritize headers in order', () => {
      mockRequest.headers['x-request-id'] = 'req-123';
      mockRequest.headers['x-correlation-id'] = 'corr-456';

      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBe('corr-456'); // x-correlation-id comes first in priority
    });

    it('should handle malformed traceparent', () => {
      mockRequest.headers['traceparent'] = 'invalid-format';

      const id = correlationId.extractCorrelationId(mockRequest);

      expect(id).toBe('invalid-format'); // Returns as-is
    });
  });

  // =============================================================================
  // isValidCorrelationId()
  // =============================================================================

  describe('isValidCorrelationId()', () => {
    it('should accept valid UUID', () => {
      expect(correlationId.isValidCorrelationId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should accept alphanumeric with hyphens', () => {
      expect(correlationId.isValidCorrelationId('abc123-def456-ghi789')).toBe(true);
    });

    it('should accept hex strings', () => {
      expect(correlationId.isValidCorrelationId('4bf92f3577b34da6a3ce929d0e0e4736')).toBe(true);
    });

    it('should reject IDs shorter than 8 characters', () => {
      expect(correlationId.isValidCorrelationId('short')).toBe(false);
    });

    it('should reject IDs longer than 128 characters', () => {
      const longId = 'a'.repeat(129);
      expect(correlationId.isValidCorrelationId(longId)).toBe(false);
    });

    it('should accept IDs at boundary lengths', () => {
      expect(correlationId.isValidCorrelationId('12345678')).toBe(true); // Min 8
      expect(correlationId.isValidCorrelationId('a'.repeat(128))).toBe(true); // Max 128
    });

    it('should reject IDs with special characters', () => {
      expect(correlationId.isValidCorrelationId('abc@123')).toBe(false);
      expect(correlationId.isValidCorrelationId('abc.123')).toBe(false);
      expect(correlationId.isValidCorrelationId('abc/123')).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(correlationId.isValidCorrelationId(null)).toBe(false);
      expect(correlationId.isValidCorrelationId(undefined)).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(correlationId.isValidCorrelationId(123456789)).toBe(false);
      expect(correlationId.isValidCorrelationId({})).toBe(false);
    });

    it('should reject empty string', () => {
      expect(correlationId.isValidCorrelationId('')).toBe(false);
    });
  });

  // =============================================================================
  // correlationIdMiddleware()
  // =============================================================================

  describe('correlationIdMiddleware()', () => {
    it('should extract existing valid correlation ID', async () => {
      mockRequest.headers['x-correlation-id'] = 'existing-corr-id-12345';

      await correlationId.correlationIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.correlationId).toBe('existing-corr-id-12345');
      expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', 'existing-corr-id-12345');
    });

    it('should generate new ID when no header present', async () => {
      await correlationId.correlationIdMiddleware(mockRequest, mockReply);

      expect(mockRequest.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', '550e8400-e29b-41d4-a716-446655440000');
    });

    it('should generate new ID when existing ID is invalid', async () => {
      mockRequest.headers['x-correlation-id'] = 'bad@id';

      await correlationId.correlationIdMiddleware(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith('Invalid correlation ID received, generating new one', expect.any(Object));
      expect(mockRequest.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should log only prefix of invalid ID for safety', async () => {
      mockRequest.headers['x-correlation-id'] = 'a'.repeat(100) + '@invalid';

      await correlationId.correlationIdMiddleware(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid correlation ID received, generating new one',
        expect.objectContaining({
          receivedId: expect.stringMatching(/^.{20}$/), // Only 20 chars
        })
      );
    });

    it('should set response header', async () => {
      mockRequest.headers['x-correlation-id'] = 'test-id-12345678';

      await correlationId.correlationIdMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', 'test-id-12345678');
    });
  });

  // =============================================================================
  // registerCorrelationIdMiddleware()
  // =============================================================================

  describe('registerCorrelationIdMiddleware()', () => {
    it('should register onRequest hook', async () => {
      await correlationId.registerCorrelationIdMiddleware(mockFastify);

      expect(mockFastify.addHook).toHaveBeenCalledWith('onRequest', correlationId.correlationIdMiddleware);
    });

    it('should register onResponse hook', async () => {
      await correlationId.registerCorrelationIdMiddleware(mockFastify);

      expect(mockFastify.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
    });

    it('should log on response for regular endpoints', async () => {
      await correlationId.registerCorrelationIdMiddleware(mockFastify);

      const onResponseHandler = mockFastify.addHook.mock.calls[1][1];
      mockRequest.correlationId = 'corr-123';
      mockRequest.url = '/api/scan';

      await onResponseHandler(mockRequest, mockReply);

      expect(logger.debug).toHaveBeenCalledWith('Request completed', expect.objectContaining({
        correlationId: 'corr-123',
        method: 'GET',
        url: '/api/scan',
        statusCode: 200,
      }));
    });

    it('should not log for health endpoints', async () => {
      await correlationId.registerCorrelationIdMiddleware(mockFastify);

      const onResponseHandler = mockFastify.addHook.mock.calls[1][1];
      mockRequest.url = '/health';

      await onResponseHandler(mockRequest, mockReply);

      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should not log for metrics endpoints', async () => {
      await correlationId.registerCorrelationIdMiddleware(mockFastify);

      const onResponseHandler = mockFastify.addHook.mock.calls[1][1];
      mockRequest.url = '/metrics';

      await onResponseHandler(mockRequest, mockReply);

      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // createServiceContext()
  // =============================================================================

  describe('createServiceContext()', () => {
    it('should create context with correlation ID from request', () => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.tenantId = 'tenant-456';
      mockRequest.user = { userId: 'user-789' };

      const context = correlationId.createServiceContext(mockRequest);

      expect(context).toEqual({
        correlationId: 'corr-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
        timestamp: expect.any(String),
      });
    });

    it('should generate correlation ID if not in request', () => {
      const context = correlationId.createServiceContext(mockRequest);

      expect(context.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should handle missing user', () => {
      mockRequest.correlationId = 'corr-123';

      const context = correlationId.createServiceContext(mockRequest);

      expect(context.userId).toBeUndefined();
    });

    it('should include ISO timestamp', () => {
      const context = correlationId.createServiceContext(mockRequest);

      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  // =============================================================================
  // getCorrelationHeaders()
  // =============================================================================

  describe('getCorrelationHeaders()', () => {
    it('should include correlation ID header', () => {
      mockRequest.correlationId = 'corr-123';

      const headers = correlationId.getCorrelationHeaders(mockRequest);

      expect(headers['x-correlation-id']).toBe('corr-123');
    });

    it('should include tenant ID header', () => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.tenantId = 'tenant-456';

      const headers = correlationId.getCorrelationHeaders(mockRequest);

      expect(headers['x-tenant-id']).toBe('tenant-456');
    });

    it('should forward authorization header', () => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.headers.authorization = 'Bearer token-xyz';

      const headers = correlationId.getCorrelationHeaders(mockRequest);

      expect(headers['authorization']).toBe('Bearer token-xyz');
    });

    it('should return empty object when no headers to propagate', () => {
      const headers = correlationId.getCorrelationHeaders(mockRequest);

      expect(headers).toEqual({});
    });

    it('should not include authorization if array', () => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.headers.authorization = ['Bearer token1', 'Bearer token2'];

      const headers = correlationId.getCorrelationHeaders(mockRequest);

      expect(headers['authorization']).toBeUndefined();
    });

    it('should include all available headers', () => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.tenantId = 'tenant-456';
      mockRequest.headers.authorization = 'Bearer token-xyz';

      const headers = correlationId.getCorrelationHeaders(mockRequest);

      expect(headers).toEqual({
        'x-correlation-id': 'corr-123',
        'x-tenant-id': 'tenant-456',
        'authorization': 'Bearer token-xyz',
      });
    });
  });

  // =============================================================================
  // getCurrentCorrelationId()
  // =============================================================================

  describe('getCurrentCorrelationId()', () => {
    it('should return undefined when not in async context', () => {
      const id = correlationId.getCurrentCorrelationId();

      expect(id).toBeUndefined();
    });

    it('should return correlation ID from async context', () => {
      let capturedId;

      correlationId.runWithCorrelation(
        { correlationId: 'context-corr-123' },
        () => {
          capturedId = correlationId.getCurrentCorrelationId();
        }
      );

      expect(capturedId).toBe('context-corr-123');
    });
  });

  // =============================================================================
  // runWithCorrelation()
  // =============================================================================

  describe('runWithCorrelation()', () => {
    it('should execute function with correlation context', () => {
      const fn = jest.fn(() => 'result');
      const context = { correlationId: 'corr-123', tenantId: 'tenant-456' };

      const result = correlationId.runWithCorrelation(context, fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should make context available in function', () => {
      let capturedContext;

      correlationId.runWithCorrelation(
        { correlationId: 'corr-123', tenantId: 'tenant-456', userId: 'user-789' },
        () => {
          capturedContext = correlationId.correlationStorage.getStore();
        }
      );

      expect(capturedContext).toEqual({
        correlationId: 'corr-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
      });
    });

    it('should isolate contexts in nested calls', () => {
      const contexts: any[] = [];

      correlationId.runWithCorrelation({ correlationId: 'outer' }, () => {
        contexts.push(correlationId.getCurrentCorrelationId());

        correlationId.runWithCorrelation({ correlationId: 'inner' }, () => {
          contexts.push(correlationId.getCurrentCorrelationId());
        });

        contexts.push(correlationId.getCurrentCorrelationId());
      });

      expect(contexts).toEqual(['outer', 'inner', 'outer']);
    });
  });

  // =============================================================================
  // createCorrelatedLogger()
  // =============================================================================

  describe('createCorrelatedLogger()', () => {
    it('should add correlation ID to info logs', () => {
      correlationId.runWithCorrelation({ correlationId: 'corr-123' }, () => {
        const corLogger = correlationId.createCorrelatedLogger(logger);

        corLogger.info('Test message', { key: 'value' });

        expect(logger.info).toHaveBeenCalledWith('Test message', {
          key: 'value',
          correlationId: 'corr-123',
        });
      });
    });

    it('should add correlation ID to warn logs', () => {
      correlationId.runWithCorrelation({ correlationId: 'corr-456' }, () => {
        const corLogger = correlationId.createCorrelatedLogger(logger);

        corLogger.warn('Warning message');

        expect(logger.warn).toHaveBeenCalledWith('Warning message', {
          correlationId: 'corr-456',
        });
      });
    });

    it('should add correlation ID to error logs', () => {
      correlationId.runWithCorrelation({ correlationId: 'corr-789' }, () => {
        const corLogger = correlationId.createCorrelatedLogger(logger);

        corLogger.error('Error message', { error: 'details' });

        expect(logger.error).toHaveBeenCalledWith('Error message', {
          error: 'details',
          correlationId: 'corr-789',
        });
      });
    });

    it('should add correlation ID to debug logs', () => {
      correlationId.runWithCorrelation({ correlationId: 'corr-abc' }, () => {
        const corLogger = correlationId.createCorrelatedLogger(logger);

        corLogger.debug('Debug message');

        expect(logger.debug).toHaveBeenCalledWith('Debug message', {
          correlationId: 'corr-abc',
        });
      });
    });

    it('should not override explicitly provided correlation ID', () => {
      correlationId.runWithCorrelation({ correlationId: 'context-id' }, () => {
        const corLogger = correlationId.createCorrelatedLogger(logger);

        corLogger.info('Test', { correlationId: 'explicit-id' });

        expect(logger.info).toHaveBeenCalledWith('Test', {
          correlationId: 'explicit-id',
        });
      });
    });

    it('should work without async context', () => {
      const corLogger = correlationId.createCorrelatedLogger(logger);

      corLogger.info('Test message');

      expect(logger.info).toHaveBeenCalledWith('Test message', {
        correlationId: undefined,
      });
    });

    it('should handle logs without metadata', () => {
      correlationId.runWithCorrelation({ correlationId: 'corr-123' }, () => {
        const corLogger = correlationId.createCorrelatedLogger(logger);

        corLogger.info('Simple message');

        expect(logger.info).toHaveBeenCalledWith('Simple message', {
          correlationId: 'corr-123',
        });
      });
    });
  });
});
