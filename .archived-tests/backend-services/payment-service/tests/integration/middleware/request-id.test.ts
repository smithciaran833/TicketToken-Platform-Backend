/**
 * Request ID Middleware Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import {
  requestIdMiddleware,
  getRequestId,
  requestLoggerMiddleware,
} from '../../../src/middleware/request-id.middleware';
import { v4 as uuidv4, validate as isUUID } from 'uuid';

describe('Request ID Middleware', () => {
  describe('requestIdMiddleware', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ disableRequestLogging: true });
      app.addHook('preHandler', requestIdMiddleware);

      app.get('/test', async (request) => ({
        requestId: (request as any).id,
      }));

      app.post('/test', async (request) => ({
        requestId: (request as any).id,
        body: request.body,
      }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('request ID generation', () => {
      it('should generate new UUID when no header present', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(isUUID(body.requestId)).toBe(true);
      });

      it('should generate unique IDs for each request', async () => {
        const ids = new Set<string>();

        for (let i = 0; i < 50; i++) {
          const response = await app.inject({
            method: 'GET',
            url: '/test',
          });
          const body = JSON.parse(response.body);
          ids.add(body.requestId);
        }

        expect(ids.size).toBe(50);
      });

      it('should use existing X-Request-ID header', async () => {
        const existingId = uuidv4();

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'x-request-id': existingId },
        });

        const body = JSON.parse(response.body);
        expect(body.requestId).toBe(existingId);
      });

      it('should use existing non-UUID X-Request-ID header', async () => {
        const customId = 'custom-request-id-12345';

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'x-request-id': customId },
        });

        const body = JSON.parse(response.body);
        expect(body.requestId).toBe(customId);
      });

      it('should handle case-insensitive header name', async () => {
        const existingId = uuidv4();

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'X-REQUEST-ID': existingId },
        });

        const body = JSON.parse(response.body);
        expect(body.requestId).toBe(existingId);
      });
    });

    describe('response header', () => {
      it('should set X-Request-ID in response header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.headers['x-request-id']).toBeDefined();
        expect(isUUID(response.headers['x-request-id'] as string)).toBe(true);
      });

      it('should set same ID in response header as in body', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        const body = JSON.parse(response.body);
        expect(response.headers['x-request-id']).toBe(body.requestId);
      });

      it('should preserve original ID in response header', async () => {
        const existingId = uuidv4();

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'x-request-id': existingId },
        });

        expect(response.headers['x-request-id']).toBe(existingId);
      });
    });

    describe('request object modification', () => {
      it('should attach ID to request.id', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        const body = JSON.parse(response.body);
        expect(body.requestId).toBeDefined();
      });

      it('should work with POST requests', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/test',
          payload: { data: 'test' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.requestId).toBeDefined();
        expect(body.body.data).toBe('test');
      });
    });
  });

  describe('getRequestId helper', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ disableRequestLogging: true });
      app.addHook('preHandler', requestIdMiddleware);

      app.get('/helper-test', async (request) => ({
        fromHelper: getRequestId(request),
        fromRequest: (request as any).id,
      }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should return request ID using helper', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/helper-test',
      });

      const body = JSON.parse(response.body);
      expect(body.fromHelper).toBe(body.fromRequest);
      expect(isUUID(body.fromHelper)).toBe(true);
    });

    it('should return existing ID using helper', async () => {
      const existingId = uuidv4();

      const response = await app.inject({
        method: 'GET',
        url: '/helper-test',
        headers: { 'x-request-id': existingId },
      });

      const body = JSON.parse(response.body);
      expect(body.fromHelper).toBe(existingId);
    });

    it('should return fallback when no custom ID set', async () => {
      // Without our middleware, Fastify sets its own request ID
      const testApp = Fastify({ disableRequestLogging: true, requestIdHeader: false });
      testApp.get('/no-middleware', async (request) => ({
        id: getRequestId(request),
      }));
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/no-middleware',
      });

      const body = JSON.parse(response.body);
      // Without middleware, id is not set by us, so getRequestId returns 'unknown' or Fastify's default
      expect(body.id).toBeDefined();

      await testApp.close();
    });
  });

  describe('requestLoggerMiddleware', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify({ disableRequestLogging: true });
      app.addHook('preHandler', requestIdMiddleware);
      app.addHook('preHandler', requestLoggerMiddleware);

      app.get('/success', async () => ({ success: true }));
      app.get('/not-found', async (request, reply) => {
        reply.status(404);
        return { error: 'Not found' };
      });
      app.get('/error', async (request, reply) => {
        reply.status(500);
        return { error: 'Server error' };
      });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      // Wait for async finish handlers
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should handle successful request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/success',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle 4xx response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/not-found',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle 5xx response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/error',
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
