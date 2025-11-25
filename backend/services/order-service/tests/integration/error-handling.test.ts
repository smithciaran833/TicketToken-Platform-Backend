import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import orderRoutes from '../../src/routes/order.routes';

describe('Error Handling Integration Tests', () => {
  let app: FastifyInstance;
  let db: Pool;
  let redis: Redis;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'order_service_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '1'),
    });

    tenantId = uuidv4();
    userId = uuidv4();

    await db.query('DELETE FROM order_items WHERE tenant_id = $1', [tenantId]);
    await db.query('DELETE FROM orders WHERE tenant_id = $1', [tenantId]);
    await redis.flushdb();
  });

  beforeEach(async () => {
    app = Fastify();
    app.decorateRequest('user', null);
    app.decorateRequest('tenant', null);

    app.addHook('onRequest', async (request, reply) => {
      if (request.headers.authorization) {
        (request as any).user = {
          id: userId,
          tenantId: tenantId,
          email: 'test@example.com',
          role: 'customer',
        };
        (request as any).tenant = {
          id: tenantId,
          name: 'Test Tenant',
        };
      }
    });

    await app.register(orderRoutes, { prefix: '/orders' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.query('DELETE FROM order_items WHERE tenant_id = $1', [tenantId]);
    await db.query('DELETE FROM orders WHERE tenant_id = $1', [tenantId]);
  });

  afterAll(async () => {
    await db.end();
    await redis.quit();
  });

  describe('Validation Errors', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should return 400 for invalid data types', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: 'not-a-valid-uuid',
          items: 'not-an-array',
          customerInfo: {
            email: 'invalid-email',
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for negative prices', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: -100,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for zero or negative quantities', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 0,
              price: 5000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty items array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Authentication Errors', () => {
    it('should return 401 for missing authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: 5000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/orders',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Not Found Errors', () => {
    it('should return 404 for non-existent order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${uuidv4()}`,
        headers: {
          authorization: 'Bearer token',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toMatch(/not found/i);
    });

    it('should return 404 when cancelling non-existent order', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${uuidv4()}/cancel`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'Test',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 when reserving non-existent order', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${uuidv4()}/reserve`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Idempotency Key Errors', () => {
    it('should return 400 for missing idempotency key on create', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: 5000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toMatch(/idempotency/i);
    });

    it('should return 400 for invalid idempotency key format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': 'not-a-uuid',
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: 5000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('State Transition Errors', () => {
    let orderId: string;

    beforeEach(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: 5000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      orderId = JSON.parse(response.body).id;
    });

    it('should return 409 when trying to cancel already cancelled order', async () => {
      // First cancellation
      await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/cancel`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'First cancellation',
        },
      });

      // Second cancellation attempt
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/cancel`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'Second cancellation',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toMatch(/state/i);
    });

    it('should return 409 when trying to reserve already cancelled order', async () => {
      // Cancel order
      await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/cancel`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'Cancellation',
        },
      });

      // Try to reserve
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/reserve`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('Database Connection Errors', () => {
    it('should handle database connection errors gracefully', async () => {
      // Close database connection to simulate error
      await db.end();

      const response = await app.inject({
        method: 'GET',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');

      // Reconnect for cleanup
      db = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'order_service_test',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      });
    });
  });

  describe('Redis Connection Errors', () => {
    it('should handle Redis unavailability gracefully', async () => {
      // Disconnect Redis to simulate error
      await redis.quit();

      // The app should still function but without idempotency cache
      const response = await app.inject({
        method: 'GET',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
        },
      });

      // Should still work with degraded functionality
      expect([200, 500]).toContain(response.statusCode);

      // Reconnect for cleanup
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.REDIS_DB || '1'),
      });
    });
  });

  describe('Malformed Request Errors', () => {
    it('should handle malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
          'content-type': 'application/json',
        },
        payload: '{invalid json',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle request with wrong content type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
          'content-type': 'text/plain',
        },
        payload: 'not json',
      });

      expect([400, 415]).toContain(response.statusCode);
    });

    it('should handle extremely large payloads', async () => {
      const largeItems = Array(1000).fill({
        ticketTypeId: uuidv4(),
        quantity: 1,
        price: 5000,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: largeItems,
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect([400, 413]).toContain(response.statusCode);
    });
  });

  describe('Concurrency Errors', () => {
    it('should handle concurrent order creation with same idempotency key', async () => {
      const idempotencyKey = uuidv4();
      const payload = {
        eventId: uuidv4(),
        items: [
          {
            ticketTypeId: uuidv4(),
            quantity: 1,
            price: 5000,
          },
        ],
        customerInfo: {
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
        },
      };

      // Send two concurrent requests
      const [response1, response2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/orders',
          headers: {
            authorization: 'Bearer token',
            'x-idempotency-key': idempotencyKey,
          },
          payload,
        }),
        app.inject({
          method: 'POST',
          url: '/orders',
          headers: {
            authorization: 'Bearer token',
            'x-idempotency-key': idempotencyKey,
          },
          payload,
        }),
      ]);

      // One should succeed, one should return cached result
      expect(response1.statusCode).toBe(201);
      expect([200, 201]).toContain(response2.statusCode);

      const body1 = JSON.parse(response1.body);
      const body2 = JSON.parse(response2.body);
      expect(body1.id).toBe(body2.id);
    });
  });

  describe('Edge Case Errors', () => {
    it('should handle UUID with special characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/orders/invalid-uuid-!@#$%',
        headers: {
          authorization: 'Bearer token',
        },
      });

      expect([400, 404]).toContain(response.statusCode);
    });

    it('should handle very long customer names', async () => {
      const longName = 'A'.repeat(1000);
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: 5000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: longName,
            lastName: longName,
          },
        },
      });

      expect([400, 413]).toContain(response.statusCode);
    });

    it('should handle very large price values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: Number.MAX_SAFE_INTEGER,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect([400, 422]).toContain(response.statusCode);
    });
  });
});
