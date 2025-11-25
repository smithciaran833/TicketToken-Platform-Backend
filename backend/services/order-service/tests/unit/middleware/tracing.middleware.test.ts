import { FastifyRequest, FastifyReply } from 'fastify';
import { tracingMiddleware } from '../../../src/middleware/tracing.middleware';
import { logger, createRequestLogger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger');

describe('Tracing Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let headerMock: jest.Mock;
  let addHookMock: jest.Mock;
  let mockRequestLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    headerMock = jest.fn().mockReturnThis();
    addHookMock = jest.fn();
    mockRequestLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

    (createRequestLogger as jest.Mock).mockReturnValue(mockRequestLogger);

    mockRequest = {
      headers: {},
      method: 'GET',
      url: '/api/orders',
      ip: '192.168.1.1',
    } as Partial<FastifyRequest>;

    mockReply = {
      header: headerMock,
      addHook: addHookMock,
      statusCode: 200,
    } as Partial<FastifyReply>;
  });

  describe('Trace ID Generation', () => {
    it('should generate new trace ID when not provided', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext).toBeDefined();
      expect(mockRequest.traceContext?.traceId).toMatch(/^trace-\d+-[a-z0-9]+$/);
    });

    it('should use existing x-trace-id header if provided', async () => {
      mockRequest.headers = { 'x-trace-id': 'existing-trace-123' };

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext?.traceId).toBe('existing-trace-123');
    });

    it('should use x-request-id as fallback for trace ID', async () => {
      mockRequest.headers = { 'x-request-id': 'request-id-456' };

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext?.traceId).toBe('request-id-456');
    });

    it('should prefer x-trace-id over x-request-id', async () => {
      mockRequest.headers = {
        'x-trace-id': 'trace-123',
        'x-request-id': 'request-456',
      };

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext?.traceId).toBe('trace-123');
    });
  });

  describe('Span ID Generation', () => {
    it('should generate unique span ID', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext?.spanId).toMatch(/^span-\d+-[a-z0-9]+$/);
    });

    it('should generate different span IDs for different requests', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      const firstSpanId = mockRequest.traceContext?.spanId;

      // Reset for second request
      mockRequest.traceContext = undefined;

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      const secondSpanId = mockRequest.traceContext?.spanId;

      expect(firstSpanId).not.toBe(secondSpanId);
    });
  });

  describe('Parent Span Handling', () => {
    it('should extract parent span ID from headers', async () => {
      mockRequest.headers = { 'x-parent-span-id': 'parent-span-789' };

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext?.parentSpanId).toBe('parent-span-789');
    });

    it('should handle requests without parent span', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext?.parentSpanId).toBeUndefined();
    });
  });

  describe('Trace Context', () => {
    it('should create complete trace context', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext).toEqual({
        traceId: expect.any(String),
        spanId: expect.any(String),
        parentSpanId: undefined,
        serviceName: 'order-service',
        startTime: expect.any(Number),
      });
    });

    it('should record start time', async () => {
      const beforeTime = Date.now();

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const afterTime = Date.now();

      expect(mockRequest.traceContext?.startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(mockRequest.traceContext?.startTime).toBeLessThanOrEqual(afterTime);
    });

    it('should set service name to order-service', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.traceContext?.serviceName).toBe('order-service');
    });
  });

  describe('Response Headers', () => {
    it('should add x-trace-id to response headers', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith(
        'x-trace-id',
        mockRequest.traceContext?.traceId
      );
    });

    it('should add x-span-id to response headers', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith(
        'x-span-id',
        mockRequest.traceContext?.spanId
      );
    });
  });

  describe('Request-Scoped Logger', () => {
    it('should create request-scoped logger', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(createRequestLogger).toHaveBeenCalledWith(mockRequest);
      expect((mockRequest as any).log).toBe(mockRequestLogger);
    });
  });

  describe('Request Logging', () => {
    it('should log incoming request with trace context', async () => {
      mockRequest.headers = { 'user-agent': 'Mozilla/5.0' };

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith('Incoming request', {
        traceId: mockRequest.traceContext?.traceId,
        spanId: mockRequest.traceContext?.spanId,
        parentSpanId: undefined,
        method: 'GET',
        url: '/api/orders',
        userAgent: 'Mozilla/5.0',
        ip: '192.168.1.1',
      });
    });

    it('should log incoming request with parent span', async () => {
      mockRequest.headers = { 'x-parent-span-id': 'parent-123' };

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          parentSpanId: 'parent-123',
        })
      );
    });
  });

  describe('Response Timing', () => {
    it('should register onSend hook for response timing', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(addHookMock).toHaveBeenCalledWith('onSend', expect.any(Function));
    });

    it('should log response with duration', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Get the onSend callback
      const onSendCallback = addHookMock.mock.calls[0][1];

      // Simulate some time passing
      if (mockRequest.traceContext) {
        mockRequest.traceContext.startTime = Date.now() - 150;
      }

      // Call the onSend hook
      const payload = { data: 'test' };
      await onSendCallback(mockRequest, mockReply, payload);

      expect(logger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          traceId: mockRequest.traceContext?.traceId,
          spanId: mockRequest.traceContext?.spanId,
          statusCode: 200,
          duration: expect.any(Number),
          method: 'GET',
          url: '/api/orders',
        })
      );
    });

    it('should add x-response-time header', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];
      const payload = { data: 'test' };
      await onSendCallback(mockRequest, mockReply, payload);

      expect(headerMock).toHaveBeenCalledWith(
        'x-response-time',
        expect.any(String)
      );
    });

    it('should calculate correct duration', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];

      // Set start time to 200ms ago
      if (mockRequest.traceContext) {
        mockRequest.traceContext.startTime = Date.now() - 200;
      }

      const payload = { data: 'test' };
      await onSendCallback(mockRequest, mockReply, payload);

      // Duration should be at least 200ms (allowing some variance)
      const logCall = (logger.info as jest.Mock).mock.calls.find(
        (call) => call[0] === 'Outgoing response'
      );
      expect(logCall[1].duration).toBeGreaterThanOrEqual(190);
      expect(logCall[1].duration).toBeLessThanOrEqual(250);
    });

    it('should return original payload', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];
      const payload = { data: 'test', nested: { value: 42 } };

      const result = await onSendCallback(mockRequest, mockReply, payload);

      expect(result).toBe(payload);
    });
  });

  describe('Different HTTP Methods', () => {
    it('should handle POST requests', async () => {
      mockRequest.method = 'POST';
      mockRequest.url = '/api/orders';

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle PUT requests', async () => {
      mockRequest.method = 'PUT';
      mockRequest.url = '/api/orders/123';

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'PUT',
          url: '/api/orders/123',
        })
      );
    });

    it('should handle DELETE requests', async () => {
      mockRequest.method = 'DELETE';

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Different Status Codes', () => {
    it('should log successful responses (200)', async () => {
      mockReply.statusCode = 200;

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];
      await onSendCallback(mockRequest, mockReply, {});

      expect(logger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 200,
        })
      );
    });

    it('should log client errors (400)', async () => {
      mockReply.statusCode = 400;

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];
      await onSendCallback(mockRequest, mockReply, {});

      expect(logger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 400,
        })
      );
    });

    it('should log server errors (500)', async () => {
      mockReply.statusCode = 500;

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];
      await onSendCallback(mockRequest, mockReply, {});

      expect(logger.info).toHaveBeenCalledWith(
        'Outgoing response',
        expect.objectContaining({
          statusCode: 500,
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle requests without user agent', async () => {
      mockRequest.headers = {};

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          userAgent: undefined,
        })
      );
    });

    it('should handle requests without IP', async () => {
      mockRequest.ip = undefined;

      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Incoming request',
        expect.objectContaining({
          ip: undefined,
        })
      );
    });

    it('should handle very fast requests (< 1ms)', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];

      // Set start time to now (virtually instant)
      if (mockRequest.traceContext) {
        mockRequest.traceContext.startTime = Date.now();
      }

      await onSendCallback(mockRequest, mockReply, {});

      const logCall = (logger.info as jest.Mock).mock.calls.find(
        (call) => call[0] === 'Outgoing response'
      );
      expect(logCall[1].duration).toBeGreaterThanOrEqual(0);
      expect(logCall[1].duration).toBeLessThan(10);
    });

    it('should handle slow requests (> 1s)', async () => {
      await tracingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const onSendCallback = addHookMock.mock.calls[0][1];

      // Simulate slow request (1500ms)
      if (mockRequest.traceContext) {
        mockRequest.traceContext.startTime = Date.now() - 1500;
      }

      await onSendCallback(mockRequest, mockReply, {});

      const logCall = (logger.info as jest.Mock).mock.calls.find(
        (call) => call[0] === 'Outgoing response'
      );
      expect(logCall[1].duration).toBeGreaterThanOrEqual(1490);
    });
  });
});
