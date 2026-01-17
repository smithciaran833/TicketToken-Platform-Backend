/**
 * Unit tests for tracing.middleware.ts
 * Tests distributed tracing with W3C Trace Context
 */

import {
  tracingMiddleware,
  Span,
  getTraceContext,
  createSpan,
  withSpan
} from '../../../src/middleware/tracing.middleware';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/logger');

describe('Tracing Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      method: 'POST',
      url: '/api/v1/notifications',
      headers: {}
    };

    mockReply = {
      header: jest.fn().mockReturnThis()
    };
  });

  describe('tracingMiddleware', () => {
    describe('Trace Context Extraction', () => {
      it('should generate new trace ID when no traceparent header', async () => {
        await tracingMiddleware(mockRequest, mockReply);

        expect(mockRequest.traceContext).toBeDefined();
        expect(mockRequest.traceContext.traceId).toMatch(/^trace_/);
        expect(mockRequest.traceContext.spanId).toMatch(/^span_/);
      });

      it('should extract trace ID from traceparent header', async () => {
        mockRequest.headers.traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

        await tracingMiddleware(mockRequest, mockReply);

        expect(mockRequest.traceContext.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
        expect(mockRequest.traceContext.parentSpanId).toBe('b7ad6b7169203331');
      });

      it('should handle invalid traceparent format', async () => {
        mockRequest.headers.traceparent = 'invalid-format';

        await tracingMiddleware(mockRequest, mockReply);

        expect(mockRequest.traceContext.traceId).toMatch(/^trace_/);
        expect(mockRequest.traceContext.parentSpanId).toBeUndefined();
      });

      it('should handle traceparent with wrong number of parts', async () => {
        mockRequest.headers.traceparent = '00-0af7651916cd43dd8448eb211c80319c';

        await tracingMiddleware(mockRequest, mockReply);

        expect(mockRequest.traceContext.traceId).toMatch(/^trace_/);
      });

      it('should generate unique span ID for each request', async () => {
        await tracingMiddleware(mockRequest, mockReply);
        const spanId1 = mockRequest.traceContext.spanId;

        await tracingMiddleware(mockRequest, mockReply);
        const spanId2 = mockRequest.traceContext.spanId;

        expect(spanId1).not.toBe(spanId2);
      });

      it('should preserve traceState from headers', async () => {
        mockRequest.headers.traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
        mockRequest.headers.tracestate = 'vendor=value';

        await tracingMiddleware(mockRequest, mockReply);

        expect(mockRequest.traceContext.traceState).toBe('vendor=value');
      });
    });

    describe('Response Headers', () => {
      it('should add X-Trace-Id header to response', async () => {
        await tracingMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith(
          'X-Trace-Id',
          expect.stringMatching(/^trace_/)
        );
      });

      it('should add X-Span-Id header to response', async () => {
        await tracingMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith(
          'X-Span-Id',
          expect.stringMatching(/^span_/)
        );
      });

      it('should use extracted trace ID in response headers', async () => {
        mockRequest.headers.traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

        await tracingMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-Trace-Id', '0af7651916cd43dd8448eb211c80319c');
      });
    });

    describe('Logging', () => {
      it('should log request start with trace context', async () => {
        await tracingMiddleware(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          'Request started',
          expect.objectContaining({
            traceId: expect.any(String),
            spanId: expect.any(String),
            method: 'POST',
            url: '/api/v1/notifications'
          })
        );
      });

      it('should log user agent when present', async () => {
        mockRequest.headers['user-agent'] = 'Test Agent';

        await tracingMiddleware(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          'Request started',
          expect.objectContaining({
            userAgent: 'Test Agent'
          })
        );
      });

      it('should log parent span ID when available', async () => {
        mockRequest.headers.traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

        await tracingMiddleware(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          'Request started',
          expect.objectContaining({
            parentSpanId: 'b7ad6b7169203331'
          })
        );
      });
    });
  });

  describe('Span Class', () => {
    let traceContext: any;

    beforeEach(() => {
      traceContext = {
        traceId: 'trace-123',
        spanId: 'span-456',
        parentSpanId: undefined
      };
    });

    describe('Constructor', () => {
      it('should create span with trace context', () => {
        const span = new Span(traceContext, 'test-operation');

        expect(span).toBeDefined();
      });

      it('should log span start', () => {
        new Span(traceContext, 'test-operation', { attr: 'value' });

        expect(logger.debug).toHaveBeenCalledWith(
          'Span started',
          expect.objectContaining({
            traceId: 'trace-123',
            operation: 'test-operation',
            attributes: { attr: 'value' }
          })
        );
      });

      it('should accept optional attributes', () => {
        const span = new Span(traceContext, 'test-operation', { userId: '123', type: 'email' });

        expect(logger.debug).toHaveBeenCalledWith(
          'Span started',
          expect.objectContaining({
            attributes: { userId: '123', type: 'email' }
          })
        );
      });

      it('should work without attributes', () => {
        const span = new Span(traceContext, 'test-operation');

        expect(logger.debug).toHaveBeenCalledWith(
          'Span started',
          expect.objectContaining({
            attributes: {}
          })
        );
      });
    });

    describe('setAttribute', () => {
      it('should add single attribute to span', () => {
        const span = new Span(traceContext, 'test-operation');
        span.setAttribute('key', 'value');
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({ key: 'value' })
          })
        );
      });

      it('should overwrite existing attribute', () => {
        const span = new Span(traceContext, 'test-operation', { key: 'original' });
        span.setAttribute('key', 'updated');
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({ key: 'updated' })
          })
        );
      });

      it('should handle various value types', () => {
        const span = new Span(traceContext, 'test-operation');
        span.setAttribute('string', 'value');
        span.setAttribute('number', 123);
        span.setAttribute('boolean', true);
        span.setAttribute('object', { nested: 'value' });
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({
              string: 'value',
              number: 123,
              boolean: true,
              object: { nested: 'value' }
            })
          })
        );
      });
    });

    describe('setAttributes', () => {
      it('should add multiple attributes at once', () => {
        const span = new Span(traceContext, 'test-operation');
        span.setAttributes({ key1: 'value1', key2: 'value2', key3: 'value3' });
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({
              key1: 'value1',
              key2: 'value2',
              key3: 'value3'
            })
          })
        );
      });

      it('should merge with existing attributes', () => {
        const span = new Span(traceContext, 'test-operation', { existing: 'value' });
        span.setAttributes({ new1: 'value1', new2: 'value2' });
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({
              existing: 'value',
              new1: 'value1',
              new2: 'value2'
            })
          })
        );
      });

      it('should handle empty attributes object', () => {
        const span = new Span(traceContext, 'test-operation', { key: 'value' });
        span.setAttributes({});
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: { key: 'value' }
          })
        );
      });
    });

    describe('addEvent', () => {
      it('should log event with name', () => {
        const span = new Span(traceContext, 'test-operation');
        span.addEvent('email_sent');

        expect(logger.debug).toHaveBeenCalledWith(
          'Span event',
          expect.objectContaining({
            traceId: 'trace-123',
            event: 'email_sent'
          })
        );
      });

      it('should log event with attributes', () => {
        const span = new Span(traceContext, 'test-operation');
        span.addEvent('email_sent', { to: 'user@example.com', template: 'welcome' });

        expect(logger.debug).toHaveBeenCalledWith(
          'Span event',
          expect.objectContaining({
            event: 'email_sent',
            attributes: { to: 'user@example.com', template: 'welcome' }
          })
        );
      });

      it('should work without attributes', () => {
        const span = new Span(traceContext, 'test-operation');
        span.addEvent('checkpoint');

        expect(logger.debug).toHaveBeenCalledWith(
          'Span event',
          expect.objectContaining({
            event: 'checkpoint',
            attributes: undefined
          })
        );
      });
    });

    describe('recordError', () => {
      it('should record error details', () => {
        const span = new Span(traceContext, 'test-operation');
        const error = new Error('Test error');
        error.stack = 'Stack trace here';

        span.recordError(error);

        expect(logger.error).toHaveBeenCalledWith(
          'Span error',
          expect.objectContaining({
            traceId: 'trace-123',
            operation: 'test-operation',
            error: 'Test error',
            stack: 'Stack trace here'
          })
        );
      });

      it('should set error attributes on span', () => {
        const span = new Span(traceContext, 'test-operation');
        const error = new Error('Test error');

        span.recordError(error);
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({
              error: true,
              errorMessage: 'Test error'
            })
          })
        );
      });

      it('should include stack trace in attributes', () => {
        const span = new Span(traceContext, 'test-operation');
        const error = new Error('Test error');
        error.stack = 'Full stack trace';

        span.recordError(error);
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({
              errorStack: 'Full stack trace'
            })
          })
        );
      });
    });

    describe('end', () => {
      it('should log span end with duration', () => {
        const span = new Span(traceContext, 'test-operation');
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            traceId: 'trace-123',
            operation: 'test-operation',
            duration_ms: expect.any(Number),
            status: 'success'
          })
        );
      });

      it('should default to success status', () => {
        const span = new Span(traceContext, 'test-operation');
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            status: 'success'
          })
        );
      });

      it('should accept error status', () => {
        const span = new Span(traceContext, 'test-operation');
        span.end('error');

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            status: 'error'
          })
        );
      });

      it('should include all attributes', () => {
        const span = new Span(traceContext, 'test-operation');
        span.setAttribute('key1', 'value1');
        span.setAttribute('key2', 'value2');
        span.end();

        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            attributes: expect.objectContaining({
              key1: 'value1',
              key2: 'value2',
              status: 'success',
              duration_ms: expect.any(Number)
            })
          })
        );
      });

      it('should calculate duration correctly', () => {
        const span = new Span(traceContext, 'test-operation');
        // Duration should be close to 0 since we end immediately
        span.end();

        const logCall = (logger.debug as jest.Mock).mock.calls.find(
          call => call[0] === 'Span ended'
        );
        expect(logCall[1].duration_ms).toBeGreaterThanOrEqual(0);
        expect(logCall[1].duration_ms).toBeLessThan(100); // Should be very quick
      });
    });

    describe('getContext', () => {
      it('should return trace context', () => {
        const span = new Span(traceContext, 'test-operation');
        const context = span.getContext();

        expect(context).toEqual(
          expect.objectContaining({
            traceId: 'trace-123',
            spanId: expect.stringMatching(/^span_/),
            parentSpanId: 'span-456'
          })
        );
      });

      it('should return parent span ID from original context', () => {
        const span = new Span(traceContext, 'test-operation');
        const context = span.getContext();

        expect(context.parentSpanId).toBe('span-456');
      });
    });
  });

  describe('getTraceContext', () => {
    it('should return trace context from request', () => {
      mockRequest.traceContext = { traceId: 'trace-123', spanId: 'span-456' };

      const context = getTraceContext(mockRequest);

      expect(context).toEqual({ traceId: 'trace-123', spanId: 'span-456' });
    });

    it('should return null when no trace context', () => {
      const context = getTraceContext(mockRequest);

      expect(context).toBeNull();
    });

    it('should handle undefined traceContext property', () => {
      mockRequest.traceContext = undefined;

      const context = getTraceContext(mockRequest);

      expect(context).toBeNull();
    });
  });

  describe('createSpan', () => {
    beforeEach(() => {
      mockRequest.traceContext = {
        traceId: 'trace-123',
        spanId: 'span-456'
      };
    });

    it('should create span from request context', () => {
      const span = createSpan(mockRequest, 'send-email');

      expect(span).toBeInstanceOf(Span);
    });

    it('should pass operation name to span', () => {
      createSpan(mockRequest, 'send-email');

      expect(logger.debug).toHaveBeenCalledWith(
        'Span started',
        expect.objectContaining({
          operation: 'send-email'
        })
      );
    });

    it('should pass attributes to span', () => {
      createSpan(mockRequest, 'send-email', { to: 'user@example.com' });

      expect(logger.debug).toHaveBeenCalledWith(
        'Span started',
        expect.objectContaining({
          attributes: { to: 'user@example.com' }
        })
      );
    });

    it('should return null when no trace context', () => {
      mockRequest.traceContext = null;

      const span = createSpan(mockRequest, 'send-email');

      expect(span).toBeNull();
    });
  });

  describe('withSpan', () => {
    beforeEach(() => {
      mockRequest.traceContext = {
        traceId: 'trace-123',
        spanId: 'span-456'
      };
    });

    describe('Success Cases', () => {
      it('should execute function and end span with success', async () => {
        const fn = jest.fn().mockResolvedValue('result');

        const result = await withSpan(mockRequest, 'test-operation', fn);

        expect(result).toBe('result');
        expect(fn).toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            status: 'success'
          })
        );
      });

      it('should pass span to function', async () => {
        const fn = jest.fn((span) => {
          expect(span).toBeInstanceOf(Span);
          return Promise.resolve('result');
        });

        await withSpan(mockRequest, 'test-operation', fn);

        expect(fn).toHaveBeenCalledWith(expect.any(Span));
      });

      it('should pass attributes to span', async () => {
        const fn = jest.fn().mockResolvedValue('result');

        await withSpan(mockRequest, 'test-operation', fn, { attr: 'value' });

        expect(logger.debug).toHaveBeenCalledWith(
          'Span started',
          expect.objectContaining({
            attributes: { attr: 'value' }
          })
        );
      });

      it('should return function result', async () => {
        const fn = jest.fn().mockResolvedValue({ data: 'test' });

        const result = await withSpan(mockRequest, 'test-operation', fn);

        expect(result).toEqual({ data: 'test' });
      });
    });

    describe('Error Cases', () => {
      it('should record error and end span with error status', async () => {
        const error = new Error('Test error');
        const fn = jest.fn().mockRejectedValue(error);

        await expect(withSpan(mockRequest, 'test-operation', fn)).rejects.toThrow('Test error');

        expect(logger.error).toHaveBeenCalledWith(
          'Span error',
          expect.objectContaining({
            error: 'Test error'
          })
        );
        expect(logger.debug).toHaveBeenCalledWith(
          'Span ended',
          expect.objectContaining({
            status: 'error'
          })
        );
      });

      it('should rethrow error after recording', async () => {
        const error = new Error('Test error');
        const fn = jest.fn().mockRejectedValue(error);

        await expect(withSpan(mockRequest, 'test-operation', fn)).rejects.toThrow('Test error');
      });

      it('should end span even when function throws', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('Test error'));

        try {
          await withSpan(mockRequest, 'test-operation', fn);
        } catch (e) {
          // Expected
        }

        const endCalls = (logger.debug as jest.Mock).mock.calls.filter(
          call => call[0] === 'Span ended'
        );
        expect(endCalls.length).toBe(1);
      });
    });

    describe('No Trace Context', () => {
      it('should execute function without span when no trace context', async () => {
        mockRequest.traceContext = null;
        const fn = jest.fn().mockResolvedValue('result');

        const result = await withSpan(mockRequest, 'test-operation', fn);

        expect(result).toBe('result');
        expect(fn).toHaveBeenCalledWith(null);
      });

      it('should not log span events when no trace context', async () => {
        mockRequest.traceContext = null;
        const fn = jest.fn().mockResolvedValue('result');

        await withSpan(mockRequest, 'test-operation', fn);

        const spanStartCalls = (logger.debug as jest.Mock).mock.calls.filter(
          call => call[0] === 'Span started'
        );
        const spanEndCalls = (logger.debug as jest.Mock).mock.calls.filter(
          call => call[0] === 'Span ended'
        );

        expect(spanStartCalls.length).toBe(0);
        expect(spanEndCalls.length).toBe(0);
      });

      it('should still propagate errors without trace context', async () => {
        mockRequest.traceContext = null;
        const error = new Error('Test error');
        const fn = jest.fn().mockRejectedValue(error);

        await expect(withSpan(mockRequest, 'test-operation', fn)).rejects.toThrow('Test error');
      });
    });
  });

  describe('Trace ID and Span ID Generation', () => {
    it('should generate trace IDs with consistent format', async () => {
      await tracingMiddleware(mockRequest, mockReply);

      expect(mockRequest.traceContext.traceId).toMatch(/^trace_\d+_[a-z0-9]+$/);
    });

    it('should generate span IDs with consistent format', async () => {
      await tracingMiddleware(mockRequest, mockReply);

      expect(mockRequest.traceContext.spanId).toMatch(/^span_[a-z0-9]+$/);
    });

    it('should generate unique IDs across multiple calls', async () => {
      const ids = new Set();

      for (let i = 0; i < 10; i++) {
        await tracingMiddleware(mockRequest, mockReply);
        ids.add(mockRequest.traceContext.traceId);
        ids.add(mockRequest.traceContext.spanId);
      }

      expect(ids.size).toBe(20); // 10 trace IDs + 10 span IDs
    });
  });
});
