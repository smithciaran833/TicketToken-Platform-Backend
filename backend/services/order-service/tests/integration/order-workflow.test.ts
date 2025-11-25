import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import orderRoutes from '../../src/routes/order.routes';

describe('Order Workflow Integration Tests', () => {
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
    app = Fastify({ logger: false });
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
    await redis.flushdb();
  });

  afterAll(async () => {
    await db.end();
    await redis.quit();
  });

  describe('Complete Order Lifecycle', () => {
    it('should handle complete order flow: create → reserve → confirm', async () => {
      // 1. Create order
      const createResponse = await app.inject({
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
              quantity: 2,
              price: 5000,
            },
          ],
          customerInfo: {
            email: 'customer@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const order = JSON.parse(createResponse.body);
      expect(order.status).toBe('pending');

      // 2. Reserve order
      const reserveResponse = await app.inject({
        method: 'POST',
        url: `/orders/${order.id}/reserve`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(reserveResponse.statusCode).toBe(200);
      const reservedOrder = JSON.parse(reserveResponse.body);
      expect(reservedOrder.status).toBe('reserved');

      // 3. Verify events were created
      const eventsResponse = await app.inject({
        method: 'GET',
        url: `/orders/${order.id}/events`,
        headers: {
          authorization: 'Bearer token',
        },
      });

      expect(eventsResponse.statusCode).toBe(200);
      const events = JSON.parse(eventsResponse.body);
      expect(events.length).toBeGreaterThanOrEqual(2); // Created + Reserved
    });

    it('should handle order cancellation workflow', async () => {
      // Create order
      const createResponse = await app.inject({
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
              price: 3000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      const order = JSON.parse(createResponse.body);

      // Cancel order
      const cancelResponse = await app.inject({
        method: 'POST',
        url: `/orders/${order.id}/cancel`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'Customer changed mind',
        },
      });

      expect(cancelResponse.statusCode).toBe(200);
      const cancelledOrder = JSON.parse(cancelResponse.body);
      expect(cancelledOrder.status).toBe('cancelled');

      // Verify order cannot be reserved after cancellation
      const reserveResponse = await app.inject({
        method: 'POST',
        url: `/orders/${order.id}/reserve`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(reserveResponse.statusCode).toBe(409);
    });

    it('should handle refund workflow for completed orders', async () => {
      // Create order
      const createResponse = await app.inject({
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
              price: 10000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      const order = JSON.parse(createResponse.body);

      // Mark as completed (simulating payment completion)
      await db.query('UPDATE orders SET status = $1 WHERE id = $2', ['completed', order.id]);

      // Request refund
      const refundResponse = await app.inject({
        method: 'POST',
        url: `/orders/${order.id}/refund`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          amount: 10000,
          reason: 'Event cancelled',
        },
      });

      expect(refundResponse.statusCode).toBe(200);
      const refund = JSON.parse(refundResponse.body);
      expect(refund).toHaveProperty('refundId');
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid order creation efficiently', async () => {
      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      // Create 20 orders concurrently
      for (let i = 0; i < 20; i++) {
        promises.push(
          app.inject({
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
                email: `test${i}@example.com`,
                firstName: 'Test',
                lastName: `User${i}`,
              },
            },
          })
        );
      }

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(201);
      });

      // Should complete in reasonable time (under 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle pagination efficiently for large result sets', async () => {
      // Create 50 orders
      for (let i = 0; i < 50; i++) {
        await app.inject({
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
              email: `test${i}@example.com`,
              firstName: 'Test',
              lastName: `User${i}`,
            },
          },
        });
      }

      // Test pagination
      const startTime = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/orders?limit=20&offset=0',
        headers: {
          authorization: 'Bearer token',
        },
      });
      const endTime = Date.now();

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.orders.length).toBe(20);
      expect(body.total).toBe(50);

      // Should be fast (under 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle order retrieval under load', async () => {
      // Create test orders
      const orderIds: string[] = [];
      for (let i = 0; i < 10; i++) {
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
              email: `test${i}@example.com`,
              firstName: 'Test',
              lastName: `User${i}`,
            },
          },
        });
        orderIds.push(JSON.parse(response.body).id);
      }

      // Retrieve all orders concurrently
      const startTime = Date.now();
      const promises = orderIds.map(orderId =>
        app.inject({
          method: 'GET',
          url: `/orders/${orderId}`,
          headers: {
            authorization: 'Bearer token',
          },
        })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple items in single order', async () => {
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
              quantity: 2,
              price: 5000,
            },
            {
              ticketTypeId: uuidv4(),
              quantity: 1,
              price: 7500,
            },
            {
              ticketTypeId: uuidv4(),
              quantity: 3,
              price: 3000,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const order = JSON.parse(response.body);
      expect(order.items).toHaveLength(3);
      expect(order.totalAmount).toBe(26500); // (2*5000) + (1*7500) + (3*3000)
    });

    it('should handle order status transitions correctly', async () => {
      const createResponse = await app.inject({
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

      const order = JSON.parse(createResponse.body);

      // Verify initial status
      expect(order.status).toBe('pending');

      // Transition to reserved
      await app.inject({
        method: 'POST',
        url: `/orders/${order.id}/reserve`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      // Verify status changed
      const getResponse = await app.inject({
        method: 'GET',
        url: `/orders/${order.id}`,
        headers: {
          authorization: 'Bearer token',
        },
      });

      expect(JSON.parse(getResponse.body).status).toBe('reserved');
    });

    it('should track order events chronologically', async () => {
      const createResponse = await app.inject({
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

      const order = JSON.parse(createResponse.body);

      // Perform multiple actions
      await app.inject({
        method: 'POST',
        url: `/orders/${order.id}/reserve`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      await app.inject({
        method: 'POST',
        url: `/orders/${order.id}/cancel`,
        headers: {
          authorization: 'Bearer token',
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'Test cancellation',
        },
      });

      // Check events
      const eventsResponse = await app.inject({
        method: 'GET',
        url: `/orders/${order.id}/events`,
        headers: {
          authorization: 'Bearer token',
        },
      });

      const events = JSON.parse(eventsResponse.body);
      expect(events.length).toBeGreaterThanOrEqual(3);

      // Verify chronological order
      for (let i = 1; i < events.length; i++) {
        const prevTime = new Date(events[i - 1].timestamp).getTime();
        const currTime = new Date(events[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });

  describe('Data Consistency Tests', () => {
    it('should maintain consistent total amount calculation', async () => {
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
              quantity: 5,
              price: 2500,
            },
            {
              ticketTypeId: uuidv4(),
              quantity: 3,
              price: 7500,
            },
          ],
          customerInfo: {
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
          },
        },
      });

      const order = JSON.parse(response.body);
      const expectedTotal = (5 * 2500) + (3 * 7500);
      expect(order.totalAmount).toBe(expectedTotal);

      // Verify in database
      const dbResult = await db.query(
        'SELECT total_amount FROM orders WHERE id = $1',
        [order.id]
      );
      expect(parseInt(dbResult.rows[0].total_amount)).toBe(expectedTotal);
    });

    it('should maintain referential integrity between orders and items', async () => {
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
              quantity: 2,
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

      const order = JSON.parse(response.body);

      // Verify items in database
      const itemsResult = await db.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );

      expect(itemsResult.rows.length).toBe(1);
      expect(itemsResult.rows[0].order_id).toBe(order.id);
      expect(parseInt(itemsResult.rows[0].quantity)).toBe(2);
    });

    it('should properly isolate tenant data', async () => {
      // Create order for tenant
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

      const order = JSON.parse(response.body);

      // Verify tenant_id in database
      const orderResult = await db.query(
        'SELECT tenant_id FROM orders WHERE id = $1',
        [order.id]
      );
      expect(orderResult.rows[0].tenant_id).toBe(tenantId);

      const itemsResult = await db.query(
        'SELECT tenant_id FROM order_items WHERE order_id = $1',
        [order.id]
      );
      itemsResult.rows.forEach(row => {
        expect(row.tenant_id).toBe(tenantId);
      });
    });
  });
});
