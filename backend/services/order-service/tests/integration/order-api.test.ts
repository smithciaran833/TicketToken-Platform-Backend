import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import orderRoutes from '../../src/routes/order.routes';
import { authenticate } from '../../src/middleware/auth.middleware';
import { tenantMiddleware } from '../../src/middleware/tenant.middleware';

describe('Order API Integration Tests', () => {
  let app: FastifyInstance;
  let db: Pool;
  let redis: Redis;
  let testTenantId: string;
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    // Setup test database connection
    db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'order_service_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Setup test Redis connection
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '1'), // Use test database
    });

    // Generate test identifiers
    testTenantId = uuidv4();
    testUserId = uuidv4();
    authToken = 'test-auth-token';

    // Clean up test data
    await db.query('DELETE FROM order_items WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await redis.flushdb();
  });

  beforeEach(async () => {
    // Setup Fastify app for each test
    app = Fastify();

    // Register middleware
    app.decorateRequest('user', null);
    app.decorateRequest('tenant', null);

    // Mock authentication middleware
    app.addHook('onRequest', async (request, reply) => {
      if (request.headers.authorization) {
        (request as any).user = {
          id: testUserId,
          tenantId: testTenantId,
          email: 'test@example.com',
          role: 'customer',
        };
        (request as any).tenant = {
          id: testTenantId,
          name: 'Test Tenant',
        };
      }
    });

    // Register routes
    await app.register(orderRoutes, { prefix: '/orders' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    // Clean up test data after each test
    await db.query('DELETE FROM order_items WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await redis.flushdb();
  });

  afterAll(async () => {
    await db.end();
    await redis.quit();
  });

  describe('POST /orders - Create Order', () => {
    it('should create a new order successfully', async () => {
      const orderData = {
        eventId: uuidv4(),
        items: [
          {
            ticketTypeId: uuidv4(),
            quantity: 2,
            price: 5000, //  $50.00
          },
        ],
        customerInfo: {
          email: 'customer@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': uuidv4(),
        },
        payload: orderData,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('status', 'pending');
      expect(body).toHaveProperty('totalAmount', 10000);
      expect(body.items).toHaveLength(1);
    });

    it('should enforce idempotency for duplicate requests', async () => {
      const idempotencyKey = uuidv4();
      const orderData = {
        eventId: uuidv4(),
        items: [
          {
            ticketTypeId: uuidv4(),
            quantity: 1,
            price: 3000,
          },
        ],
        customerInfo: {
          email: 'customer@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
        },
      };

      // First request
      const response1 = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': idempotencyKey,
        },
        payload: orderData,
      });

      expect(response1.statusCode).toBe(201);
      const body1 = JSON.parse(response1.body);

      // Duplicate  request with same idempotency key
      const response2 = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': idempotencyKey,
        },
        payload: orderData,
      });

      expect(response2.statusCode).toBe(200);
      const body2 = JSON.parse(response2.body);
      expect(body2.id).toBe(body1.id);
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        payload: {
          eventId: uuidv4(),
          items: [],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid order data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          // Missing required fields
          items: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /orders/:orderId - Get Order', () => {
    let createdOrderId: string;

    beforeEach(async () => {
      // Create an order for testing
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
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

      const body = JSON.parse(response.body);
      createdOrderId = body.id;
    });

    it('should retrieve order by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${createdOrderId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(createdOrderId);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('items');
    });

    it('should return 404 for non-existent order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${uuidv4()}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${createdOrderId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /orders - List Orders', () => {
    beforeEach(async () => {
      // Create multiple orders
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/orders',
          headers: {
            authorization: `Bearer ${authToken}`,
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
    });

    it('should list user orders with pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/orders?limit=2&offset=0',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('orders');
      expect(body).toHaveProperty('total');
      expect(body.orders.length).toBeLessThanOrEqual(2);
    });

    it('should filter orders by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/orders?status=pending',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.orders.forEach((order: any) => {
        expect(order.status).toBe('pending');
      });
    });

    it('should reject unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/orders',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /orders/:orderId/reserve - Reserve Order', () => {
    let orderId: string;

    beforeEach(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
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

      const body = JSON.parse(response.body);
      orderId = body.id;
    });

    it('should reserve an order successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/reserve`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('reserved');
    });

    it('should enforce idempotency', async () => {
      const idempotencyKey = uuidv4();

      const response1 = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/reserve`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': idempotencyKey,
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(response1.statusCode).toBe(200);

      const response2 = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/reserve`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': idempotencyKey,
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(response2.statusCode).toBe(200);
    });
  });

  describe('POST /orders/:orderId/cancel - Cancel Order', () => {
    let orderId: string;

    beforeEach(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
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

      const body = JSON.parse(response.body);
      orderId = body.id;
    });

    it('should cancel an order successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'Customer request',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('cancelled');
    });
  });

  describe('POST /orders/:orderId/refund - Refund Order', () => {
    let orderId: string;

    beforeEach(async () => {
      // Create and complete an order
      const createResponse = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
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

      const body = JSON.parse(createResponse.body);
      orderId = body.id;

      // Update order status to completed for refund testing
      await db.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        ['completed', orderId]
      );
    });

    it('should refund an order successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${orderId}/refund`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          amount: 10000,
          reason: 'Customer dissatisfaction',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('refundId');
    });
  });

  describe('GET /orders/:orderId/events - Get Order Events', () => {
    let orderId: string;

    beforeEach(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: `Bearer ${authToken}`,
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

      const body = JSON.parse(response.body);
      orderId = body.id;
    });

    it('should retrieve order events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${orderId}/events`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('eventType');
      expect(body[0]).toHaveProperty('timestamp');
    });
  });
});
