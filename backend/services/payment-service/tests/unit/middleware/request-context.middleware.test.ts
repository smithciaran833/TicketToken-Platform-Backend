/**
 * Unit Tests for Request Context Middleware
 * 
 * Tests request context creation, trace propagation, and context-aware utilities.
 */

// Mock dependencies before imports
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

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid-1234-5678-9012-345678901234'),
}));

import {
  getRequestContext,
  getTraceId,
  getRequestId,
  runWithContext,
  requestContextMiddleware,
  getTracePropagationHeaders,
  getServiceCallHeaders,
  createContextLogger,
  RequestContext,
} from '../../../src/middleware/request-context.middleware';

describe('Request Context Middleware', () => {
  describe('requestContextMiddleware', () => {
    let mockRequest: any;
    let mockReply: any;
    let doneFn: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();

      mockRequest = {
        headers: {},
        url: '/api/payments',
        method: 'POST',
        ip: '192.168.1.1',
      };

      mockReply = {
        header: jest.fn(),
      };

      doneFn = jest.fn();
    });

    it('should create request context with generated IDs', () => {
      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context).toBeDefined();
      expect(mockRequest.context.requestId).toBeDefined();
      expect(mockRequest.context.traceId).toBeDefined();
      expect(mockRequest.context.spanId).toBeDefined();
    });

    it('should set response headers', () => {
      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
      expect(mockReply.header).toHaveBeenCalledWith('X-Trace-ID', expect.any(String));
      expect(mockReply.header).toHaveBeenCalledWith('traceparent', expect.stringMatching(/^00-/));
    });

    it('should capture request metadata', () => {
      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.path).toBe('/api/payments');
      expect(mockRequest.context.method).toBe('POST');
      expect(mockRequest.context.clientIp).toBe('192.168.1.1');
    });

    it('should call done callback', () => {
      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(doneFn).toHaveBeenCalled();
    });

    it('should extract traceparent header (W3C format)', () => {
      mockRequest.headers['traceparent'] = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(mockRequest.context.parentSpanId).toBe('b7ad6b7169203331');
    });

    it('should extract x-trace-id header', () => {
      mockRequest.headers['x-trace-id'] = 'custom-trace-123';

      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.traceId).toBe('custom-trace-123');
    });

    it('should extract x-request-id header as trace ID fallback', () => {
      mockRequest.headers['x-request-id'] = 'custom-request-456';

      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.traceId).toBe('custom-request-456');
    });

    it('should extract B3 trace headers', () => {
      mockRequest.headers['x-b3-traceid'] = 'b3-trace-123';
      mockRequest.headers['x-b3-spanid'] = 'b3-span-456';
      mockRequest.headers['x-b3-parentspanid'] = 'b3-parent-789';

      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.traceId).toBe('b3-trace-123');
    });

    it('should capture correlation ID from header', () => {
      mockRequest.headers['x-correlation-id'] = 'corr-abc-123';

      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.correlationId).toBe('corr-abc-123');
    });

    it('should capture user agent', () => {
      mockRequest.headers['user-agent'] = 'Mozilla/5.0 Test Browser';

      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.userAgent).toBe('Mozilla/5.0 Test Browser');
    });

    it('should capture tenant and user IDs if present on request', () => {
      mockRequest.tenantId = 'tenant-123';
      mockRequest.userId = 'user-456';

      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.context.tenantId).toBe('tenant-123');
      expect(mockRequest.context.userId).toBe('user-456');
    });

    it('should record start time', () => {
      const beforeTime = Date.now();
      requestContextMiddleware(mockRequest, mockReply, doneFn);
      const afterTime = Date.now();

      expect(mockRequest.context.startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(mockRequest.context.startTime).toBeLessThanOrEqual(afterTime);
    });

    it('should attach traceId and requestId directly to request', () => {
      requestContextMiddleware(mockRequest, mockReply, doneFn);

      expect(mockRequest.traceId).toBeDefined();
      expect(mockRequest.requestId).toBeDefined();
    });
  });

  describe('runWithContext', () => {
    it('should execute function with provided context', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-456',
        spanId: 'span-789',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      let capturedContext: RequestContext | undefined;

      runWithContext(context, () => {
        capturedContext = getRequestContext();
      });

      expect(capturedContext).toEqual(context);
    });

    it('should return function result', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-456',
        spanId: 'span-789',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      const result = runWithContext(context, () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should isolate context between calls', () => {
      const context1: RequestContext = {
        requestId: 'req-1',
        traceId: 'trace-1',
        spanId: 'span-1',
        startTime: Date.now(),
        path: '/path1',
        method: 'GET',
      };

      const context2: RequestContext = {
        requestId: 'req-2',
        traceId: 'trace-2',
        spanId: 'span-2',
        startTime: Date.now(),
        path: '/path2',
        method: 'POST',
      };

      let captured1: string | undefined;
      let captured2: string | undefined;

      runWithContext(context1, () => {
        captured1 = getRequestContext()?.requestId;
      });

      runWithContext(context2, () => {
        captured2 = getRequestContext()?.requestId;
      });

      expect(captured1).toBe('req-1');
      expect(captured2).toBe('req-2');
    });
  });

  describe('getRequestContext', () => {
    it('should return undefined when no context is set', () => {
      expect(getRequestContext()).toBeUndefined();
    });

    it('should return context when set', () => {
      const context: RequestContext = {
        requestId: 'req-test',
        traceId: 'trace-test',
        spanId: 'span-test',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        expect(getRequestContext()).toEqual(context);
      });
    });
  });

  describe('getTraceId', () => {
    it('should return undefined when no context exists', () => {
      expect(getTraceId()).toBeUndefined();
    });

    it('should return trace ID from context', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'my-trace-id',
        spanId: 'span-123',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        expect(getTraceId()).toBe('my-trace-id');
      });
    });
  });

  describe('getRequestId', () => {
    it('should return undefined when no context exists', () => {
      expect(getRequestId()).toBeUndefined();
    });

    it('should return request ID from context', () => {
      const context: RequestContext = {
        requestId: 'my-request-id',
        traceId: 'trace-123',
        spanId: 'span-123',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        expect(getRequestId()).toBe('my-request-id');
      });
    });
  });

  describe('getTracePropagationHeaders', () => {
    it('should return empty object when no context exists', () => {
      expect(getTracePropagationHeaders()).toEqual({});
    });

    it('should return trace headers when context exists', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-abc',
        spanId: 'span-def',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getTracePropagationHeaders();

        expect(headers['traceparent']).toBe('00-trace-abc-span-def-01');
        expect(headers['x-trace-id']).toBe('trace-abc');
        expect(headers['x-request-id']).toBe('req-123');
        expect(headers['x-b3-traceid']).toBe('trace-abc');
        expect(headers['x-b3-spanid']).toBe('span-def');
      });
    });

    it('should include correlation ID if present', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-abc',
        spanId: 'span-def',
        correlationId: 'corr-xyz',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getTracePropagationHeaders();
        expect(headers['x-correlation-id']).toBe('corr-xyz');
      });
    });

    it('should use request ID as correlation ID fallback', () => {
      const context: RequestContext = {
        requestId: 'req-fallback',
        traceId: 'trace-abc',
        spanId: 'span-def',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getTracePropagationHeaders();
        expect(headers['x-correlation-id']).toBe('req-fallback');
      });
    });

    it('should include parent span ID if present', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-abc',
        spanId: 'span-def',
        parentSpanId: 'parent-ghi',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getTracePropagationHeaders();
        expect(headers['x-b3-parentspanid']).toBe('parent-ghi');
      });
    });
  });

  describe('getServiceCallHeaders', () => {
    it('should return empty object when no context exists', () => {
      expect(getServiceCallHeaders()).toEqual({});
    });

    it('should include trace propagation headers', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-abc',
        spanId: 'span-def',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getServiceCallHeaders();
        expect(headers['x-trace-id']).toBe('trace-abc');
        expect(headers['x-request-id']).toBe('req-123');
      });
    });

    it('should include tenant ID if present', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-abc',
        spanId: 'span-def',
        tenantId: 'tenant-xyz',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getServiceCallHeaders();
        expect(headers['x-tenant-id']).toBe('tenant-xyz');
      });
    });

    it('should include user ID if present', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-abc',
        spanId: 'span-def',
        userId: 'user-123',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getServiceCallHeaders();
        expect(headers['x-user-id']).toBe('user-123');
      });
    });

    it('should not include tenant/user headers if not present', () => {
      const context: RequestContext = {
        requestId: 'req-123',
        traceId: 'trace-abc',
        spanId: 'span-def',
        startTime: Date.now(),
        path: '/test',
        method: 'GET',
      };

      runWithContext(context, () => {
        const headers = getServiceCallHeaders();
        expect(headers['x-tenant-id']).toBeUndefined();
        expect(headers['x-user-id']).toBeUndefined();
      });
    });
  });

  describe('createContextLogger', () => {
    it('should create logger with component name', () => {
      const logger = createContextLogger('TestComponent');
      
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should log without error when no context exists', () => {
      const logger = createContextLogger('NoContext');
      
      expect(() => logger.info({}, 'test message')).not.toThrow();
      expect(() => logger.warn({}, 'test warning')).not.toThrow();
      expect(() => logger.error({}, 'test error')).not.toThrow();
      expect(() => logger.debug({}, 'test debug')).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed traceparent header gracefully', () => {
      const mockRequest: any = {
        headers: { 'traceparent': 'invalid-format' },
        url: '/api/test',
        method: 'GET',
        ip: '127.0.0.1',
      };
      const mockReply: any = { header: jest.fn() };
      const done = jest.fn();

      expect(() => {
        requestContextMiddleware(mockRequest, mockReply, done);
      }).not.toThrow();

      expect(mockRequest.context.traceId).toBeDefined();
    });

    it('should handle empty headers object', () => {
      const mockRequest: any = {
        headers: {},
        url: '/api/test',
        method: 'GET',
        ip: '127.0.0.1',
      };
      const mockReply: any = { header: jest.fn() };
      const done = jest.fn();

      requestContextMiddleware(mockRequest, mockReply, done);

      expect(mockRequest.context.traceId).toBeDefined();
      expect(mockRequest.context.requestId).toBeDefined();
    });

    it('should handle missing IP address', () => {
      const mockRequest: any = {
        headers: {},
        url: '/api/test',
        method: 'GET',
      };
      const mockReply: any = { header: jest.fn() };
      const done = jest.fn();

      requestContextMiddleware(mockRequest, mockReply, done);

      expect(mockRequest.context.clientIp).toBeUndefined();
    });
  });
});
