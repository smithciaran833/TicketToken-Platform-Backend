/**
 * Comprehensive Unit Tests for src/middleware/request-id.ts
 *
 * Tests request ID extraction and propagation
 */

// Mock uuid
const mockUuidv4 = jest.fn(() => 'generated-uuid-1234');
jest.mock('uuid', () => ({
  v4: mockUuidv4,
}));

import {
  registerRequestId,
  getCorrelationHeaders,
  createRequestContext,
} from '../../../src/middleware/request-id';

describe('src/middleware/request-id.ts - Comprehensive Unit Tests', () => {
  let mockApp: any;
  let mockRequest: any;
  let mockReply: any;
  let onRequestHook: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApp = {
      addHook: jest.fn((hookName, handler) => {
        if (hookName === 'onRequest') {
          onRequestHook = handler;
        }
      }),
    };

    mockRequest = {
      headers: {},
    };

    mockReply = {
      header: jest.fn().mockReturnThis(),
    };
  });

  // =============================================================================
  // REGISTER REQUEST ID
  // =============================================================================

  describe('registerRequestId()', () => {
    it('should register onRequest hook', async () => {
      await registerRequestId(mockApp);

      expect(mockApp.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    });

    it('should generate UUID when no request ID header present', async () => {
      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockUuidv4).toHaveBeenCalled();
      expect(mockRequest.requestId).toBe('generated-uuid-1234');
      expect(mockRequest.correlationId).toBe('generated-uuid-1234');
    });

    it('should extract from x-request-id header', async () => {
      mockRequest.headers['x-request-id'] = 'req-from-header';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('req-from-header');
      expect(mockRequest.correlationId).toBe('req-from-header');
      expect(mockUuidv4).not.toHaveBeenCalled();
    });

    it('should extract from x-correlation-id header', async () => {
      mockRequest.headers['x-correlation-id'] = 'corr-from-header';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('corr-from-header');
      expect(mockRequest.correlationId).toBe('corr-from-header');
    });

    it('should extract from x-trace-id header', async () => {
      mockRequest.headers['x-trace-id'] = 'trace-from-header';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('trace-from-header');
    });

    it('should extract from request-id header', async () => {
      mockRequest.headers['request-id'] = 'simple-req-id';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('simple-req-id');
    });

    it('should set response headers', async () => {
      mockRequest.headers['x-request-id'] = 'test-id';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'test-id');
      expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', 'test-id');
    });

    it('should prefer x-request-id over other headers', async () => {
      mockRequest.headers['x-request-id'] = 'priority-id';
      mockRequest.headers['x-correlation-id'] = 'other-id';
      mockRequest.headers['x-trace-id'] = 'another-id';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('priority-id');
    });

    it('should skip empty string headers', async () => {
      mockRequest.headers['x-request-id'] = '';
      mockRequest.headers['x-correlation-id'] = 'valid-id';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('valid-id');
    });

    it('should skip non-string headers', async () => {
      mockRequest.headers['x-request-id'] = ['array', 'value'];
      mockRequest.headers['x-correlation-id'] = 'valid-id';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('valid-id');
    });

    it('should handle undefined headers', async () => {
      mockRequest.headers['x-request-id'] = undefined;

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('generated-uuid-1234');
    });
  });

  // =============================================================================
  // GET CORRELATION HEADERS
  // =============================================================================

  describe('getCorrelationHeaders()', () => {
    it('should return correlation headers', () => {
      const headers = getCorrelationHeaders('test-request-id');

      expect(headers).toEqual({
        'X-Request-ID': 'test-request-id',
        'X-Correlation-ID': 'test-request-id',
      });
    });

    it('should work with UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const headers = getCorrelationHeaders(uuid);

      expect(headers).toEqual({
        'X-Request-ID': uuid,
        'X-Correlation-ID': uuid,
      });
    });

    it('should work with custom request ID format', () => {
      const customId = 'req-2024-001';
      const headers = getCorrelationHeaders(customId);

      expect(headers).toEqual({
        'X-Request-ID': customId,
        'X-Correlation-ID': customId,
      });
    });
  });

  // =============================================================================
  // CREATE REQUEST CONTEXT
  // =============================================================================

  describe('createRequestContext()', () => {
    it('should create request context object', () => {
      const context = createRequestContext('test-request-id');

      expect(context).toEqual({
        requestId: 'test-request-id',
        correlationId: 'test-request-id',
      });
    });

    it('should work with UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = createRequestContext(uuid);

      expect(context).toEqual({
        requestId: uuid,
        correlationId: uuid,
      });
    });

    it('should work with custom request ID format', () => {
      const customId = 'req-2024-001';
      const context = createRequestContext(customId);

      expect(context).toEqual({
        requestId: customId,
        correlationId: customId,
      });
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle complete flow with incoming request ID', async () => {
      mockRequest.headers['x-request-id'] = 'incoming-id-123';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      // Request should have ID set
      expect(mockRequest.requestId).toBe('incoming-id-123');
      expect(mockRequest.correlationId).toBe('incoming-id-123');

      // Response should have headers
      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'incoming-id-123');
      expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', 'incoming-id-123');

      // Should be able to get headers for downstream
      const headers = getCorrelationHeaders(mockRequest.requestId);
      expect(headers['X-Request-ID']).toBe('incoming-id-123');

      // Should be able to create context
      const context = createRequestContext(mockRequest.requestId);
      expect(context.requestId).toBe('incoming-id-123');
    });

    it('should handle complete flow without incoming request ID', async () => {
      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      // Request should have generated ID
      expect(mockRequest.requestId).toBe('generated-uuid-1234');
      expect(mockRequest.correlationId).toBe('generated-uuid-1234');

      // Response should have headers with generated ID
      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'generated-uuid-1234');

      // Should be able to propagate to downstream
      const headers = getCorrelationHeaders(mockRequest.requestId);
      expect(headers['X-Request-ID']).toBe('generated-uuid-1234');
    });

    it('should maintain same ID throughout request lifecycle', async () => {
      mockRequest.headers['x-correlation-id'] = 'lifecycle-test-id';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      const requestId = mockRequest.requestId;
      const headers = getCorrelationHeaders(requestId);
      const context = createRequestContext(requestId);

      // All should use same ID
      expect(mockRequest.requestId).toBe('lifecycle-test-id');
      expect(mockRequest.correlationId).toBe('lifecycle-test-id');
      expect(headers['X-Request-ID']).toBe('lifecycle-test-id');
      expect(headers['X-Correlation-ID']).toBe('lifecycle-test-id');
      expect(context.requestId).toBe('lifecycle-test-id');
      expect(context.correlationId).toBe('lifecycle-test-id');
    });
  });

  // =============================================================================
  // HEADER PRIORITY ORDER
  // =============================================================================

  describe('Header Priority Order', () => {
    it('should check headers in correct priority order', async () => {
      // Set all headers with different values
      mockRequest.headers['x-request-id'] = 'first';
      mockRequest.headers['x-correlation-id'] = 'second';
      mockRequest.headers['x-trace-id'] = 'third';
      mockRequest.headers['request-id'] = 'fourth';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      // Should use first valid header (x-request-id)
      expect(mockRequest.requestId).toBe('first');
    });

    it('should fallback to next header if first is empty', async () => {
      mockRequest.headers['x-request-id'] = '';
      mockRequest.headers['x-correlation-id'] = 'second';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('second');
    });

    it('should fallback to third header if first two are invalid', async () => {
      mockRequest.headers['x-request-id'] = '';
      mockRequest.headers['x-correlation-id'] = undefined;
      mockRequest.headers['x-trace-id'] = 'third';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('third');
    });

    it('should fallback to last header if others are invalid', async () => {
      mockRequest.headers['x-request-id'] = '';
      mockRequest.headers['x-correlation-id'] = undefined;
      mockRequest.headers['x-trace-id'] = null;
      mockRequest.headers['request-id'] = 'fourth';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('fourth');
    });

    it('should generate UUID if all headers are invalid', async () => {
      mockRequest.headers['x-request-id'] = '';
      mockRequest.headers['x-correlation-id'] = undefined;
      mockRequest.headers['x-trace-id'] = null;
      mockRequest.headers['request-id'] = '';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('generated-uuid-1234');
      expect(mockUuidv4).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle very long request IDs', async () => {
      const longId = 'a'.repeat(1000);
      mockRequest.headers['x-request-id'] = longId;

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe(longId);
    });

    it('should handle request IDs with special characters', async () => {
      const specialId = 'req-123!@#$%^&*()_+-={}[]|;:,.<>?';
      mockRequest.headers['x-request-id'] = specialId;

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe(specialId);
    });

    it('should handle unicode in request IDs', async () => {
      const unicodeId = 'req-世界-🌍-123';
      mockRequest.headers['x-request-id'] = unicodeId;

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe(unicodeId);
    });

    it('should handle numeric request IDs', async () => {
      mockRequest.headers['x-request-id'] = '123456789';

      await registerRequestId(mockApp);
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.requestId).toBe('123456789');
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export registerRequestId function', () => {
      expect(typeof registerRequestId).toBe('function');
    });

    it('should export getCorrelationHeaders function', () => {
      expect(typeof getCorrelationHeaders).toBe('function');
    });

    it('should export createRequestContext function', () => {
      expect(typeof createRequestContext).toBe('function');
    });
  });
});
