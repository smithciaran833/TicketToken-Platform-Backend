/**
 * Internal Auth Middleware Integration Tests
 * Comprehensive tests for internal service authentication
 */

import Fastify, { FastifyInstance } from 'fastify';
import { internalAuth } from '../../../src/middleware/internal-auth';
import * as crypto from 'crypto';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production';

describe('Internal Auth Middleware', () => {
  let app: FastifyInstance;
  let originalNodeEnv: string | undefined;

  beforeAll(async () => {
    originalNodeEnv = process.env.NODE_ENV;

    app = Fastify();

    app.post('/internal/test', {
      preHandler: [internalAuth],
    }, async (request) => {
      return {
        success: true,
        service: (request as any).internalService,
      };
    });

    app.post('/internal/with-body', {
      preHandler: [internalAuth],
    }, async (request) => {
      return {
        success: true,
        service: (request as any).internalService,
        receivedBody: request.body,
      };
    });

    app.get('/internal/get-test', {
      preHandler: [internalAuth],
    }, async (request) => {
      return {
        success: true,
        service: (request as any).internalService,
      };
    });

    app.put('/internal/put-test', {
      preHandler: [internalAuth],
    }, async (request) => {
      return {
        success: true,
        service: (request as any).internalService,
      };
    });

    app.delete('/internal/delete-test', {
      preHandler: [internalAuth],
    }, async (request) => {
      return {
        success: true,
        service: (request as any).internalService,
      };
    });

    await app.ready();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await app.close();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function generateSignature(
    serviceName: string,
    timestamp: string,
    method: string,
    url: string,
    body: any
  ): string {
    const payload = `${serviceName}:${timestamp}:${method}:${url}:${JSON.stringify(body)}`;
    return crypto
      .createHmac('sha256', INTERNAL_SECRET)
      .update(payload)
      .digest('hex');
  }

  describe('Header Validation', () => {
    describe('x-internal-service header', () => {
      it('should reject request without x-internal-service header', async () => {
        const timestamp = Date.now().toString();

        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          headers: {
            'x-internal-timestamp': timestamp,
            'x-internal-signature': 'some-signature',
          },
          payload: {},
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Missing authentication headers');
      });

      it('should reject empty x-internal-service header', async () => {
        const timestamp = Date.now().toString();

        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          headers: {
            'x-internal-service': '',
            'x-internal-timestamp': timestamp,
            'x-internal-signature': 'some-signature',
          },
          payload: {},
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('x-internal-timestamp header', () => {
      it('should reject request without x-internal-timestamp header', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          headers: {
            'x-internal-service': 'order-service',
            'x-internal-signature': 'some-signature',
          },
          payload: {},
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Missing authentication headers');
      });

      it('should reject empty x-internal-timestamp header', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          headers: {
            'x-internal-service': 'order-service',
            'x-internal-timestamp': '',
            'x-internal-signature': 'some-signature',
          },
          payload: {},
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('x-internal-signature header', () => {
      it('should reject request without x-internal-signature header', async () => {
        const timestamp = Date.now().toString();

        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          headers: {
            'x-internal-service': 'order-service',
            'x-internal-timestamp': timestamp,
          },
          payload: {},
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Missing authentication headers');
      });

      it('should reject empty x-internal-signature header', async () => {
        const timestamp = Date.now().toString();

        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          headers: {
            'x-internal-service': 'order-service',
            'x-internal-timestamp': timestamp,
            'x-internal-signature': '',
          },
          payload: {},
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('all headers missing', () => {
      it('should reject request with no auth headers', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          payload: {},
        });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  describe('Timestamp Validation', () => {
    it('should reject timestamp older than 5 minutes', async () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': oldTimestamp,
          'x-internal-signature': 'some-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Request expired');
    });

    it('should reject timestamp from future (more than 5 minutes)', async () => {
      const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': futureTimestamp,
          'x-internal-signature': 'some-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Request expired');
    });

    it('should accept timestamp within 5 minute window (past)', async () => {
      const timestamp = (Date.now() - 4 * 60 * 1000).toString(); // 4 minutes ago
      const body = {};
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept current timestamp', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject non-numeric timestamp', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': 'not-a-number',
          'x-internal-signature': 'some-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Request expired');
    });

    it('should reject timestamp with letters mixed in', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': '1234abc5678',
          'x-internal-signature': 'some-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject negative timestamp', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': '-1000',
          'x-internal-signature': 'some-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject zero timestamp', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': '0',
          'x-internal-signature': 'some-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept timestamp exactly at 5 minute boundary', async () => {
      const timestamp = (Date.now() - 5 * 60 * 1000 + 1000).toString(); // Just under 5 minutes
      const body = {};
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Signature Validation', () => {
    it('should accept valid HMAC signature', async () => {
      const serviceName = 'order-service';
      const timestamp = Date.now().toString();
      const body = { orderId: '123', amount: 5000 };
      const signature = generateSignature(serviceName, timestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': serviceName,
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.service).toBe(serviceName);
    });

    it('should reject invalid signature', async () => {
      const timestamp = Date.now().toString();

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': 'invalid-signature-here',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid signature');
    });

    it('should reject signature with wrong service name', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      // Generate signature with different service name
      const signature = generateSignature('different-service', timestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service', // Different from signature
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject signature with wrong timestamp', async () => {
      const originalTimestamp = Date.now().toString();
      const differentTimestamp = (Date.now() + 1000).toString();
      const body = {};
      const signature = generateSignature('order-service', originalTimestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': differentTimestamp, // Different from signature
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject signature with wrong method', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      // Generate signature for POST but use GET
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/get-test', body);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/get-test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject signature with wrong URL', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/different', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject signature with wrong body', async () => {
      const timestamp = Date.now().toString();
      const signedBody = { key: 'original' };
      const sentBody = { key: 'tampered' };
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/test', signedBody);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: sentBody,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should work with empty body', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should work with complex nested body', async () => {
      const timestamp = Date.now().toString();
      const body = {
        order: {
          id: '123',
          items: [
            { sku: 'ABC', quantity: 2, price: 1999 },
            { sku: 'DEF', quantity: 1, price: 2999 },
          ],
          customer: {
            email: 'test@example.com',
            name: 'John Doe',
          },
        },
        metadata: {
          source: 'mobile',
          version: '2.0',
        },
      };
      const signature = generateSignature('order-service', timestamp, 'POST', '/internal/with-body', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/with-body',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Development Mode (temp-signature)', () => {
    it('should accept temp-signature in development mode', async () => {
      process.env.NODE_ENV = 'development';

      const timestamp = Date.now().toString();

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': 'temp-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.service).toBe('order-service');
    });

    it('should accept temp-signature in test mode', async () => {
      process.env.NODE_ENV = 'test';

      const timestamp = Date.now().toString();

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'notification-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': 'temp-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject temp-signature in production mode', async () => {
      process.env.NODE_ENV = 'production';

      const timestamp = Date.now().toString();

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': 'temp-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid signature');
    });

    it('should still require valid timestamp with temp-signature', async () => {
      process.env.NODE_ENV = 'development';

      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': oldTimestamp,
          'x-internal-signature': 'temp-signature',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe('Request expired');
    });
  });

  describe('Request Object Modification', () => {
    it('should attach internalService to request', async () => {
      const timestamp = Date.now().toString();
      const body = {};
      const signature = generateSignature('ticket-service', timestamp, 'POST', '/internal/test', body);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/test',
        headers: {
          'x-internal-service': 'ticket-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.service).toBe('ticket-service');
    });

    it('should attach internalService for different services', async () => {
      const services = ['order-service', 'notification-service', 'user-service', 'analytics-service'];

      for (const serviceName of services) {
        const timestamp = Date.now().toString();
        const body = {};
        const signature = generateSignature(serviceName, timestamp, 'POST', '/internal/test', body);

        const response = await app.inject({
          method: 'POST',
          url: '/internal/test',
          headers: {
            'x-internal-service': serviceName,
            'x-internal-timestamp': timestamp,
            'x-internal-signature': signature,
          },
          payload: body,
        });

        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.service).toBe(serviceName);
      }
    });
  });

  describe('HTTP Methods', () => {
    it('should work with GET requests', async () => {
      const timestamp = Date.now().toString();
      const signature = generateSignature('order-service', timestamp, 'GET', '/internal/get-test', undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/get-test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should work with PUT requests', async () => {
      const timestamp = Date.now().toString();
      const body = { update: 'data' };
      const signature = generateSignature('order-service', timestamp, 'PUT', '/internal/put-test', body);

      const response = await app.inject({
        method: 'PUT',
        url: '/internal/put-test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should work with DELETE requests', async () => {
      const timestamp = Date.now().toString();
      const signature = generateSignature('order-service', timestamp, 'DELETE', '/internal/delete-test', undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: '/internal/delete-test',
        headers: {
          'x-internal-service': 'order-service',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
