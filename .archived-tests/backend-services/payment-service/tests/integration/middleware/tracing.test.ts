/**
 * Tracing Middleware Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import {
  tracingMiddleware,
  createChildSpan,
  endChildSpan,
  traceAsyncOperation,
  TraceContext,
} from '../../../src/middleware/tracing.middleware';

describe('Tracing Middleware', () => {
  describe('tracingMiddleware', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      app.addHook('preHandler', tracingMiddleware());

      app.get('/test', async (request) => {
        const ctx = (request as any).traceContext as TraceContext;
        return {
          traceId: ctx?.traceId,
          spanId: ctx?.spanId,
          parentSpanId: ctx?.parentSpanId,
          hasAttributes: !!ctx?.attributes,
        };
      });

      app.post('/with-body', async (request) => {
        const ctx = (request as any).traceContext as TraceContext;
        return {
          traceId: ctx?.traceId,
          body: request.body,
        };
      });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      // Wait for async finish handlers to complete
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    describe('trace context creation', () => {
      it('should create trace context for request', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.traceId).toBeDefined();
        expect(body.spanId).toBeDefined();
        expect(body.hasAttributes).toBe(true);
      });

      it('should generate unique trace IDs', async () => {
        const traceIds = new Set<string>();

        for (let i = 0; i < 10; i++) {
          const response = await app.inject({
            method: 'GET',
            url: '/test',
          });
          const body = JSON.parse(response.body);
          traceIds.add(body.traceId);
        }

        expect(traceIds.size).toBe(10);
      });

      it('should generate unique span IDs', async () => {
        const spanIds = new Set<string>();

        for (let i = 0; i < 10; i++) {
          const response = await app.inject({
            method: 'GET',
            url: '/test',
          });
          const body = JSON.parse(response.body);
          spanIds.add(body.spanId);
        }

        expect(spanIds.size).toBe(10);
      });

      it('should not have parentSpanId for root span', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        const body = JSON.parse(response.body);
        expect(body.parentSpanId).toBeUndefined();
      });
    });

    describe('trace context extraction from headers', () => {
      it('should use trace ID from traceparent header (W3C format)', async () => {
        const traceId = '0af7651916cd43dd8448eb211c80319c';
        const parentSpanId = 'b7ad6b7169203331';
        const traceparent = `00-${traceId}-${parentSpanId}-01`;

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { traceparent },
        });

        const body = JSON.parse(response.body);
        expect(body.traceId).toBe(traceId);
        expect(body.parentSpanId).toBe(parentSpanId);
      });

      it('should use trace ID from x-trace-id header', async () => {
        const customTraceId = 'custom-trace-123';

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'x-trace-id': customTraceId },
        });

        const body = JSON.parse(response.body);
        expect(body.traceId).toBe(customTraceId);
      });

      it('should use parent span ID from x-parent-span-id header', async () => {
        const customParentSpanId = 'parent-span-456';

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'x-parent-span-id': customParentSpanId },
        });

        const body = JSON.parse(response.body);
        expect(body.parentSpanId).toBe(customParentSpanId);
      });

      it('should prefer traceparent over custom headers', async () => {
        const w3cTraceId = '0af7651916cd43dd8448eb211c80319c';
        const customTraceId = 'custom-trace-123';

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: {
            traceparent: `00-${w3cTraceId}-b7ad6b7169203331-01`,
            'x-trace-id': customTraceId,
          },
        });

        const body = JSON.parse(response.body);
        expect(body.traceId).toBe(w3cTraceId);
      });

      it('should handle invalid traceparent format gracefully', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { traceparent: 'invalid-format' },
        });

        const body = JSON.parse(response.body);
        expect(body.traceId).toBeDefined();
      });
    });

    describe('response headers', () => {
      it('should set x-trace-id in response', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.headers['x-trace-id']).toBeDefined();
      });

      it('should set x-span-id in response', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.headers['x-span-id']).toBeDefined();
      });

      it('should match trace ID in response header with context', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        const body = JSON.parse(response.body);
        expect(response.headers['x-trace-id']).toBe(body.traceId);
      });
    });
  });

  describe('trace attributes', () => {
    it('should capture HTTP method in attributes', async () => {
      let capturedAttributes: any;

      const testApp = Fastify();
      testApp.addHook('preHandler', tracingMiddleware());
      testApp.get('/attr-test', async (request) => {
        capturedAttributes = (request as any).traceContext?.attributes;
        return { ok: true };
      });
      await testApp.ready();

      await testApp.inject({
        method: 'GET',
        url: '/attr-test',
      });

      // Wait for finish handler
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(capturedAttributes['http.method']).toBe('GET');

      await testApp.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should capture HTTP URL in attributes', async () => {
      let capturedAttributes: any;

      const testApp = Fastify();
      testApp.addHook('preHandler', tracingMiddleware());
      testApp.get('/attr-url', async (request) => {
        capturedAttributes = (request as any).traceContext?.attributes;
        return { ok: true };
      });
      await testApp.ready();

      await testApp.inject({
        method: 'GET',
        url: '/attr-url?foo=bar',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(capturedAttributes['http.url']).toContain('/attr-url');

      await testApp.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should capture user agent in attributes', async () => {
      let capturedAttributes: any;

      const testApp = Fastify();
      testApp.addHook('preHandler', tracingMiddleware());
      testApp.get('/attr-ua', async (request) => {
        capturedAttributes = (request as any).traceContext?.attributes;
        return { ok: true };
      });
      await testApp.ready();

      await testApp.inject({
        method: 'GET',
        url: '/attr-ua',
        headers: { 'user-agent': 'TestAgent/1.0' },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(capturedAttributes['http.user_agent']).toBe('TestAgent/1.0');

      await testApp.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should set service name in attributes', async () => {
      let capturedAttributes: any;

      const testApp = Fastify();
      testApp.addHook('preHandler', tracingMiddleware());
      testApp.get('/attr-service', async (request) => {
        capturedAttributes = (request as any).traceContext?.attributes;
        return { ok: true };
      });
      await testApp.ready();

      await testApp.inject({
        method: 'GET',
        url: '/attr-service',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(capturedAttributes['service.name']).toBe('payment-service');

      await testApp.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('createChildSpan', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      app.addHook('preHandler', tracingMiddleware());

      app.get('/child-span', async (request) => {
        const parentCtx = (request as any).traceContext as TraceContext;
        const childCtx = createChildSpan(request, 'child-operation', {
          'custom.attr': 'test-value',
        });

        return {
          parentTraceId: parentCtx.traceId,
          parentSpanId: parentCtx.spanId,
          childTraceId: childCtx.traceId,
          childSpanId: childCtx.spanId,
          childParentSpanId: childCtx.parentSpanId,
          childAttributes: childCtx.attributes,
        };
      });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should inherit trace ID from parent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/child-span',
      });

      const body = JSON.parse(response.body);
      expect(body.childTraceId).toBe(body.parentTraceId);
    });

    it('should set parent span ID to parent spanId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/child-span',
      });

      const body = JSON.parse(response.body);
      expect(body.childParentSpanId).toBe(body.parentSpanId);
    });

    it('should generate unique span ID for child', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/child-span',
      });

      const body = JSON.parse(response.body);
      expect(body.childSpanId).not.toBe(body.parentSpanId);
    });

    it('should include custom attributes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/child-span',
      });

      const body = JSON.parse(response.body);
      expect(body.childAttributes['custom.attr']).toBe('test-value');
    });

    it('should include span name in attributes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/child-span',
      });

      const body = JSON.parse(response.body);
      expect(body.childAttributes['span.name']).toBe('child-operation');
    });

    it('should set service name in child span', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/child-span',
      });

      const body = JSON.parse(response.body);
      expect(body.childAttributes['service.name']).toBe('payment-service');
    });
  });

  describe('endChildSpan', () => {
    it('should end span with OK status', async () => {
      const app = Fastify();
      app.addHook('preHandler', tracingMiddleware());

      app.get('/end-ok', async (request) => {
        const childCtx = createChildSpan(request, 'test-op');
        endChildSpan(childCtx, 'OK');
        return { success: true };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/end-ok',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should end span with ERROR status', async () => {
      const app = Fastify();
      app.addHook('preHandler', tracingMiddleware());

      app.get('/end-error', async (request) => {
        const childCtx = createChildSpan(request, 'test-op');
        endChildSpan(childCtx, 'ERROR', new Error('Test error'));
        return { success: true };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/end-error',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
      await new Promise(resolve => setTimeout(resolve, 200));
    });
  });

  describe('traceAsyncOperation', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      app.addHook('preHandler', tracingMiddleware());

      app.get('/trace-async', async (request) => {
        const result = await traceAsyncOperation(
          request,
          'async-db-query',
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return { data: 'from-db' };
          },
          { 'db.type': 'postgres' }
        );

        return result;
      });

      app.get('/trace-async-error', async (request) => {
        try {
          await traceAsyncOperation(
            request,
            'failing-operation',
            async () => {
              throw new Error('Operation failed');
            }
          );
        } catch (e) {
          return { caught: true };
        }
      });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should return result from async operation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trace-async',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBe('from-db');
    });

    it('should propagate errors from async operation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trace-async-error',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.caught).toBe(true);
    });
  });
});
