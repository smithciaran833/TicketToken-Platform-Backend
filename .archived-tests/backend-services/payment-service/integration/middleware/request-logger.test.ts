/**
 * Request Logger Middleware Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import { requestLogger, performanceMonitor, RequestWithId } from '../../../src/middleware/request-logger';
import { v4 as uuidv4, validate as isUUID } from 'uuid';

describe('Request Logger Middleware', () => {
  describe('requestLogger', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      app.addHook('preHandler', requestLogger);

      app.get('/test', async (request) => ({
        id: (request as any).id,
        startTime: (request as any).startTime,
      }));

      app.get('/slow', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { slow: true };
      });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      // Wait for async finish handlers to complete
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    describe('request ID assignment', () => {
      it('should assign unique request ID', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        const body = JSON.parse(response.body);
        expect(isUUID(body.id)).toBe(true);
      });

      it('should use existing X-Request-ID header', async () => {
        const existingId = uuidv4();

        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'x-request-id': existingId },
        });

        const body = JSON.parse(response.body);
        expect(body.id).toBe(existingId);
      });

      it('should generate unique IDs for consecutive requests', async () => {
        const ids = [];

        for (let i = 0; i < 10; i++) {
          const response = await app.inject({
            method: 'GET',
            url: '/test',
          });
          const body = JSON.parse(response.body);
          ids.push(body.id);
        }

        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(10);
      });
    });

    describe('start time tracking', () => {
      it('should set startTime on request', async () => {
        const before = Date.now();

        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        const after = Date.now();
        const body = JSON.parse(response.body);

        expect(body.startTime).toBeGreaterThanOrEqual(before);
        expect(body.startTime).toBeLessThanOrEqual(after);
      });
    });

    describe('response headers', () => {
      it('should set X-Request-ID in response', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.headers['x-request-id']).toBeDefined();
      });

      it('should match request ID in response header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        const body = JSON.parse(response.body);
        expect(response.headers['x-request-id']).toBe(body.id);
      });
    });
  });

  describe('performanceMonitor', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      app.addHook('preHandler', requestLogger);
      app.addHook('preHandler', performanceMonitor);

      app.get('/with-checkpoints', async (request) => {
        const checkpoint = (request as any).checkpoint;
        
        checkpoint('step1');
        await new Promise(resolve => setTimeout(resolve, 10));
        
        checkpoint('step2');
        await new Promise(resolve => setTimeout(resolve, 10));
        
        checkpoint('step3');
        
        return { success: true };
      });

      app.get('/fast', async () => ({ fast: true }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    describe('checkpoint function', () => {
      it('should add checkpoint function to request', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/with-checkpoints',
        });

        expect(response.statusCode).toBe(200);
      });

      it('should not throw when checkpoint is called', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/with-checkpoints',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });
    });

    describe('performance tracking', () => {
      it('should complete fast requests successfully', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/fast',
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });
});

describe('RequestWithId interface', () => {
  it('should allow typed access to id and startTime', async () => {
    const app = Fastify();
    app.addHook('preHandler', requestLogger);

    app.get('/typed', async (request) => {
      const typedRequest = request as RequestWithId;
      return {
        id: typedRequest.id,
        startTime: typedRequest.startTime,
      };
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/typed',
    });

    const body = JSON.parse(response.body);
    expect(body.id).toBeDefined();
    expect(body.startTime).toBeDefined();

    await app.close();
    await new Promise(resolve => setTimeout(resolve, 200));
  });
});
