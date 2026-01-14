/**
 * Unit Tests: Trace Middleware
 * Tests distributed tracing context propagation
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'generated-uuid-1234-5678-9abc-def012345678'),
}));

import { traceMiddleware, extractTraceContext, getTracePropagationHeaders } from '../../../src/middleware/trace.middleware';

describe('extractTraceContext', () => {
  it('should extract existing trace context from headers', () => {
    const request = {
      headers: {
        'x-trace-id': 'existing-trace-id',
        'x-span-id': 'existing-span-id',
        'x-request-id': 'existing-request-id',
      },
      id: 'fastify-id',
    } as any;

    const context = extractTraceContext(request);

    expect(context.traceId).toBe('existing-trace-id');
    expect(context.parentSpanId).toBe('existing-span-id');
    expect(context.requestId).toBe('existing-request-id');
    expect(context.spanId).toBeDefined();
  });

  it('should generate trace ID when not provided', () => {
    const request = {
      headers: {},
      id: 'fastify-id',
    } as any;

    const context = extractTraceContext(request);

    expect(context.traceId).toBe('generated-uuid-1234-5678-9abc-def012345678');
  });

  it('should use Fastify request ID as fallback', () => {
    const request = {
      headers: {},
      id: 'fastify-generated-id',
    } as any;

    const context = extractTraceContext(request);

    expect(context.requestId).toBe('fastify-generated-id');
  });

  it('should generate new span ID', () => {
    const request = {
      headers: { 'x-trace-id': 'trace-123' },
      id: 'req-id',
    } as any;

    const context = extractTraceContext(request);

    expect(context.spanId).toBeDefined();
    expect(context.spanId.length).toBe(16);
  });
});

describe('traceMiddleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let done: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      headers: {},
      id: 'req-123',
      url: '/api/v1/orders',
      method: 'GET',
    };
    mockReply = {
      header: jest.fn().mockReturnThis(),
    };
    done = jest.fn();
  });

  it('should attach trace context to request', () => {
    traceMiddleware(mockRequest, mockReply, done);

    expect(mockRequest.traceContext).toBeDefined();
    expect(mockRequest.traceId).toBeDefined();
    expect(mockRequest.spanId).toBeDefined();
  });

  it('should set response headers', () => {
    traceMiddleware(mockRequest, mockReply, done);

    expect(mockReply.header).toHaveBeenCalledWith('x-trace-id', expect.any(String));
    expect(mockReply.header).toHaveBeenCalledWith('x-request-id', expect.any(String));
    expect(mockReply.header).toHaveBeenCalledWith('x-span-id', expect.any(String));
  });

  it('should call done callback', () => {
    traceMiddleware(mockRequest, mockReply, done);

    expect(done).toHaveBeenCalled();
  });

  it('should log trace context', () => {
    const { logger } = require('../../../src/utils/logger');
    traceMiddleware(mockRequest, mockReply, done);

    expect(logger.debug).toHaveBeenCalledWith(
      'Request trace context',
      expect.objectContaining({
        path: '/api/v1/orders',
        method: 'GET',
      })
    );
  });
});

describe('getTracePropagationHeaders', () => {
  it('should return headers for downstream services', () => {
    const request = {
      traceContext: {
        traceId: 'trace-123',
        spanId: 'span-456',
        requestId: 'req-789',
      },
      id: 'req-789',
    } as any;

    const headers = getTracePropagationHeaders(request);

    expect(headers['x-trace-id']).toBe('trace-123');
    expect(headers['x-parent-span-id']).toBe('span-456');
    expect(headers['x-request-id']).toBe('req-789');
    expect(headers['x-span-id']).toBeDefined();
  });

  it('should generate new context when not present', () => {
    const request = {
      id: 'req-123',
    } as any;

    const headers = getTracePropagationHeaders(request);

    expect(headers['x-trace-id']).toBeDefined();
    expect(headers['x-span-id']).toBeDefined();
    expect(headers['x-request-id']).toBe('req-123');
  });
});
