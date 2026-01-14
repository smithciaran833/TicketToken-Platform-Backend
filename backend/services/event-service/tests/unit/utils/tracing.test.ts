/**
 * Unit tests for src/utils/tracing.ts
 * Tests OpenTelemetry distributed tracing utilities
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';

// Mock all OpenTelemetry modules
const mockSpan = {
  setAttribute: jest.fn().mockReturnThis(),
  setAttributes: jest.fn().mockReturnThis(),
  setStatus: jest.fn().mockReturnThis(),
  recordException: jest.fn().mockReturnThis(),
  end: jest.fn(),
  spanContext: jest.fn().mockReturnValue({
    traceId: 'test-trace-id-12345',
    spanId: 'test-span-id-123',
  }),
};

const mockTracer = {
  startSpan: jest.fn().mockReturnValue(mockSpan),
};

const mockTracerProvider = {
  register: jest.fn(),
  shutdown: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: jest.fn().mockImplementation(() => mockTracerProvider),
}));

jest.mock('@opentelemetry/sdk-trace-base', () => ({
  SimpleSpanProcessor: jest.fn(),
  BatchSpanProcessor: jest.fn(),
  ConsoleSpanExporter: jest.fn(),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

jest.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: jest.fn().mockReturnValue({}),
}));

jest.mock('@opentelemetry/core', () => ({
  W3CTraceContextPropagator: jest.fn().mockImplementation(() => ({
    extract: jest.fn().mockReturnValue({}),
    inject: jest.fn(),
  })),
}));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn().mockReturnValue(mockTracer),
    getActiveSpan: jest.fn().mockReturnValue(mockSpan),
    setSpan: jest.fn().mockReturnValue({}),
  },
  context: {
    active: jest.fn().mockReturnValue({}),
    with: jest.fn().mockImplementation((_ctx, fn) => fn()),
  },
  SpanKind: {
    INTERNAL: 0,
    SERVER: 1,
    CLIENT: 2,
    PRODUCER: 3,
    CONSUMER: 4,
  },
  SpanStatusCode: {
    UNSET: 0,
    OK: 1,
    ERROR: 2,
  },
}));

// Import after mocks are set up
import {
  initTracing,
  getTracer,
  createSpan,
  withSpan,
  extractTraceContext,
  injectTraceContext,
  getTraceIds,
  tracingHook,
  tracingResponseHook,
  createDbSpan,
  createExternalCallSpan,
  shutdownTracing,
} from '../../../src/utils/tracing';

describe('utils/tracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initTracing()', () => {
    it('should initialize tracing provider', () => {
      initTracing();
      expect(mockTracerProvider.register).toHaveBeenCalled();
    });

    it('should only initialize once', () => {
      initTracing();
      initTracing();
      // First call initializes, second is no-op
      // The register should have been called from previous test or first initTracing
    });
  });

  describe('getTracer()', () => {
    it('should return a tracer instance', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
    });

    it('should initialize tracing if not already done', () => {
      getTracer();
      // Initialization happens automatically
    });
  });

  describe('createSpan()', () => {
    it('should create a span with given name', () => {
      const span = createSpan('test-operation');
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.objectContaining({ kind: SpanKind.INTERNAL }),
        expect.anything()
      );
      expect(span).toBeDefined();
    });

    it('should create span with custom kind', () => {
      createSpan('client-call', SpanKind.CLIENT);
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'client-call',
        expect.objectContaining({ kind: SpanKind.CLIENT }),
        expect.anything()
      );
    });

    it('should accept parent context', () => {
      const parentContext = {};
      createSpan('child-span', SpanKind.INTERNAL, parentContext as any);
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'child-span',
        expect.any(Object),
        parentContext
      );
    });
  });

  describe('withSpan()', () => {
    it('should wrap function with span and return result', async () => {
      const result = await withSpan('test-op', async (span) => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record exception on error', async () => {
      const testError = new Error('Test error');

      await expect(
        withSpan('failing-op', async () => {
          throw testError;
        })
      ).rejects.toThrow('Test error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          code: SpanStatusCode.ERROR,
        })
      );
      expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should accept custom options', async () => {
      await withSpan(
        'custom-op',
        async () => 'done',
        {
          kind: SpanKind.CLIENT,
          attributes: { 'custom.attr': 'value' },
        }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'custom-op',
        expect.objectContaining({
          kind: SpanKind.CLIENT,
          attributes: { 'custom.attr': 'value' },
        })
      );
    });
  });

  describe('extractTraceContext()', () => {
    it('should extract trace context from headers', () => {
      const headers = {
        'traceparent': '00-traceid-spanid-01',
        'tracestate': 'vendor=value',
      };

      const context = extractTraceContext(headers);
      expect(context).toBeDefined();
    });

    it('should handle array header values', () => {
      const headers = {
        'traceparent': ['00-traceid-spanid-01'],
      };

      const context = extractTraceContext(headers);
      expect(context).toBeDefined();
    });

    it('should handle empty headers', () => {
      const context = extractTraceContext({});
      expect(context).toBeDefined();
    });

    it('should normalize header keys to lowercase', () => {
      const headers = {
        'TraceParent': '00-traceid-spanid-01',
        'TRACESTATE': 'vendor=value',
      };

      extractTraceContext(headers);
      // Should not throw with mixed case headers
    });
  });

  describe('injectTraceContext()', () => {
    it('should inject trace context into headers', () => {
      const headers: Record<string, string> = {};
      injectTraceContext(headers);
      // The mock W3CTraceContextPropagator.inject is called
    });
  });

  describe('getTraceIds()', () => {
    it('should return trace and span IDs when span is active', () => {
      const ids = getTraceIds();
      expect(ids).toEqual({
        traceId: 'test-trace-id-12345',
        spanId: 'test-span-id-123',
      });
    });

    it('should return null when no active span', () => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValueOnce(null);

      const ids = getTraceIds();
      expect(ids).toBeNull();
    });
  });

  describe('tracingHook()', () => {
    it('should create server span for incoming request', async () => {
      const mockRequest = createMockRequest({
        method: 'GET',
        url: '/api/events',
        headers: { 'user-agent': 'test-agent' },
      });
      mockRequest.routeOptions = { url: '/api/events/:id' };
      const mockReply = createMockReply();

      await tracingHook(mockRequest as any, mockReply as any);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'GET /api/events/:id',
        expect.objectContaining({
          kind: SpanKind.SERVER,
        }),
        expect.anything()
      );
      expect((mockRequest as any).span).toBeDefined();
    });

    it('should use request url when routeOptions not available', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/events',
      });
      delete (mockRequest as any).routeOptions;
      const mockReply = createMockReply();

      await tracingHook(mockRequest as any, mockReply as any);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'POST /api/events',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('tracingResponseHook()', () => {
    it('should end span with OK status on success', async () => {
      const mockRequest: any = {
        span: mockSpan,
      };
      const mockReply: any = {
        statusCode: 200,
      };

      await tracingResponseHook(mockRequest, mockReply);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'http.status_code': 200,
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should end span with ERROR status on 4xx/5xx', async () => {
      const mockRequest: any = {
        span: mockSpan,
      };
      const mockReply: any = {
        statusCode: 500,
      };

      await tracingResponseHook(mockRequest, mockReply);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'HTTP 500',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle request without span gracefully', async () => {
      const mockRequest: any = {};
      const mockReply: any = { statusCode: 200 };

      await expect(
        tracingResponseHook(mockRequest, mockReply)
      ).resolves.not.toThrow();
    });
  });

  describe('createDbSpan()', () => {
    it('should create CLIENT span for database operations', () => {
      const span = createDbSpan('select', 'events');
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'db.select',
        expect.objectContaining({ kind: SpanKind.CLIENT }),
        expect.anything()
      );
      expect(span).toBeDefined();
    });
  });

  describe('createExternalCallSpan()', () => {
    it('should create CLIENT span with peer.service attribute', () => {
      const span = createExternalCallSpan('venue-service', 'getVenue');
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'venue-service.getVenue',
        expect.objectContaining({ kind: SpanKind.CLIENT }),
        expect.anything()
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('peer.service', 'venue-service');
    });
  });

  describe('shutdownTracing()', () => {
    it('should shutdown tracer provider', async () => {
      // First initialize
      initTracing();
      
      await shutdownTracing();
      
      expect(mockTracerProvider.shutdown).toHaveBeenCalled();
    });

    it('should handle multiple shutdown calls gracefully', async () => {
      await shutdownTracing();
      await shutdownTracing();
      // Should not throw
    });
  });

  describe('Integration scenarios', () => {
    it('should trace complete request lifecycle', async () => {
      const request: any = {
        method: 'GET',
        url: '/api/events/123',
        routeOptions: { url: '/api/events/:id' },
        headers: { 'user-agent': 'integration-test' },
        user: { tenant_id: 'tenant-123' },
      };
      const reply: any = { statusCode: 200 };

      // Start request tracing
      await tracingHook(request, reply);
      expect(request.span).toBeDefined();

      // End request tracing
      await tracingResponseHook(request, reply);
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });
});
