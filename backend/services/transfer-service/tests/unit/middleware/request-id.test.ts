import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Fastify from 'fastify';
import {
  requestIdMiddleware,
  generateRequestId,
  REQUEST_ID_HEADER,
  CORRELATION_ID_HEADER
} from '../../../src/middleware/request-id';

describe('Request ID Middleware - Unit Tests', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(requestIdMiddleware);

    // Add a test route
    fastify.get('/test', async (request: FastifyRequest) => {
      return {
        requestId: request.requestId,
        id: (request as any).id
      };
    });

    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('generateRequestId', () => {
    it('should generate a valid UUID v4', () => {
      const requestId = generateRequestId();

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      const id3 = generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate 1000 unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        ids.add(generateRequestId());
      }

      expect(ids.size).toBe(1000);
    });
  });

  describe('Request ID Generation', () => {
    it('should generate new request ID when none provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.requestId).toBeDefined();
      expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should use existing X-Request-ID header', async () => {
      const existingId = 'test-request-id-12345';

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [REQUEST_ID_HEADER]: existingId
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.requestId).toBe(existingId);
    });

    it('should use existing X-Correlation-ID header', async () => {
      const existingId = 'test-correlation-id-67890';

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [CORRELATION_ID_HEADER]: existingId
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.requestId).toBe(existingId);
    });

    it('should prioritize X-Request-ID over X-Correlation-ID', async () => {
      const requestId = 'priority-request-id';
      const correlationId = 'secondary-correlation-id';

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [REQUEST_ID_HEADER]: requestId,
          [CORRELATION_ID_HEADER]: correlationId
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.requestId).toBe(requestId);
      expect(body.requestId).not.toBe(correlationId);
    });
  });

  describe('Response Headers', () => {
    it('should add X-Request-ID to response headers', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test'
      });

      expect(response.headers[REQUEST_ID_HEADER]).toBeDefined();
      expect(typeof response.headers[REQUEST_ID_HEADER]).toBe('string');
    });

    it('should echo back provided X-Request-ID in response', async () => {
      const existingId = 'echo-test-id-12345';

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [REQUEST_ID_HEADER]: existingId
        }
      });

      expect(response.headers[REQUEST_ID_HEADER]).toBe(existingId);
    });

    it('should include request ID in response even on error', async () => {
      fastify.get('/error', async () => {
        throw new Error('Test error');
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/error'
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers[REQUEST_ID_HEADER]).toBeDefined();
    });
  });

  describe('Request Object Enhancement', () => {
    it('should attach requestId to request object', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test'
      });

      const body = JSON.parse(response.body);
      expect(body.requestId).toBeDefined();
    });

    it('should attach id to request object for Fastify logging', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test'
      });

      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.id).toBe(body.requestId);
    });

    it('should maintain same request ID throughout request lifecycle', async () => {
      const ids: string[] = [];

      fastify.addHook('onRequest', async (request: FastifyRequest) => {
        ids.push(request.requestId);
      });

      fastify.addHook('preHandler', async (request: FastifyRequest) => {
        ids.push(request.requestId);
      });

      fastify.addHook('onResponse', async (request: FastifyRequest) => {
        ids.push(request.requestId);
      });

      await fastify.inject({
        method: 'GET',
        url: '/test'
      });

      expect(ids.length).toBe(3);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[1]).toBe(ids[2]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string in X-Request-ID header', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [REQUEST_ID_HEADER]: ''
        }
      });

      const body = JSON.parse(response.body);
      expect(body.requestId).toBeDefined();
      expect(body.requestId).not.toBe('');
      expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should handle whitespace-only X-Request-ID header', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [REQUEST_ID_HEADER]: '   '
        }
      });

      const body = JSON.parse(response.body);
      expect(body.requestId).toBe('   ');
    });

    it('should handle very long request IDs', async () => {
      const longId = 'a'.repeat(1000);

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [REQUEST_ID_HEADER]: longId
        }
      });

      const body = JSON.parse(response.body);
      expect(body.requestId).toBe(longId);
    });

    it('should handle special characters in request ID', async () => {
      const specialId = 'test-id-!@#$%^&*()_+-=[]{}|;:,.<>?';

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          [REQUEST_ID_HEADER]: specialId
        }
      });

      const body = JSON.parse(response.body);
      expect(body.requestId).toBe(specialId);
    });
  });

  describe('Multiple Requests', () => {
    it('should generate different IDs for concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        fastify.inject({
          method: 'GET',
          url: '/test'
        })
      );

      const responses = await Promise.all(promises);
      const requestIds = responses.map(r => JSON.parse(r.body).requestId);

      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle rapid sequential requests', async () => {
      const requestIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const response = await fastify.inject({
          method: 'GET',
          url: '/test'
        });
        requestIds.push(JSON.parse(response.body).requestId);
      }

      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(50);
    });
  });

  describe('Header Constants', () => {
    it('should export REQUEST_ID_HEADER constant', () => {
      expect(REQUEST_ID_HEADER).toBe('x-request-id');
    });

    it('should export CORRELATION_ID_HEADER constant', () => {
      expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
    });
  });
});
