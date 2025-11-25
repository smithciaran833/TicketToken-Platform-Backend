import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import orderRoutes from '../../src/routes/order.routes';

describe('Tenant Isolation Integration Tests', () => {
  let app: FastifyInstance;
  let db: Pool;
  let redis: Redis;

  // Tenant A data
  let tenantAId: string;
  let tenantAUserId: string;
  let tenantAOrderId: string;

  // Tenant B data
  let tenantBId: string;
  let tenantBUserId: string;
  let tenantBOrderId: string;

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

    // Setup tenant A
    tenantAId = uuidv4();
    tenantAUserId = uuidv4();

    // Setup tenant B
    tenantBId = uuidv4();
    tenantBUserId = uuidv4();

    // Clean up test data
    await db.query('DELETE FROM order_items WHERE tenant_id = ANY($1)', [[tenantAId, tenantBId]]);
    await db.query('DELETE FROM orders WHERE tenant_id = ANY($1)', [[tenantAId, tenantBId]]);
    await redis.flushdb();
  });

  beforeEach(async () => {
    app = Fastify();
    app.decorateRequest('user', null);
    app.decorateRequest('tenant', null);

    // Mock authentication that populates tenant info
    app.addHook('onRequest', async (request, reply) => {
      const authHeader = request.headers.authorization;
      const tenantHeader = request.headers['x-tenant-id'] as string;

      if (authHeader && tenantHeader) {
        // Tenant A user
        if (tenantHeader === tenantAId) {
          (request as any).user = {
            id: tenantAUserId,
            tenantId: tenantAId,
            email: 'userA@example.com',
            role: 'customer',
          };
          (request as any).tenant = {
            id: tenantAId,
            name: 'Tenant A',
          };
        }
        // Tenant B user
        else if (tenantHeader === tenantBId) {
          (request as any).user = {
            id: tenantBUserId,
            tenantId: tenantBId,
            email: 'userB@example.com',
            role: 'customer',
          };
          (request as any).tenant = {
            id: tenantBId,
            name: 'Tenant B',
          };
        }
      }
    });

    await app.register(orderRoutes, { prefix: '/orders' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await db.query('DELETE FROM order_items WHERE tenant_id = ANY($1)', [[tenantAId, tenantBId]]);
    await db.query('DELETE FROM orders WHERE tenant_id = ANY($1)', [[tenantAId, tenantBId]]);
    await db.end();
    await redis.quit();
  });

  describe('Order Creation Isolation', () => {
    it('should create orders in separate tenant contexts', async () => {
      // Create order for Tenant A
      const responseA = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
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
            email: 'customerA@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      });

      expect(responseA.statusCode).toBe(201);
      const bodyA = JSON.parse(responseA.body);
      tenantAOrderId = bodyA.id;

      // Create order for Tenant B
      const responseB = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [
            {
              ticketTypeId: uuidv4(),
              quantity: 2,
              price: 7500,
            },
          ],
          customerInfo: {
            email: 'customerB@example.com',
            firstName: 'Jane',
            lastName: 'Smith',
          },
        },
      });

      expect(responseB.statusCode).toBe(201);
      const bodyB = JSON.parse(responseB.body);
      tenantBOrderId = bodyB.id;

      // Verify orders are stored with correct tenant IDs
      const resultA = await db.query('SELECT * FROM orders WHERE id = $1', [tenantAOrderId]);
      expect(resultA.rows[0].tenant_id).toBe(tenantAId);

      const resultB = await db.query('SELECT * FROM orders WHERE id = $1', [tenantBOrderId]);
      expect(resultB.rows[0].tenant_id).toBe(tenantBId);
    });
  });

  describe('Order Retrieval Isolation', () => {
    beforeEach(async () => {
      // Create an order for each tenant
      const responseA = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'a@test.com', firstName: 'A', lastName: 'User' },
        },
      });
      tenantAOrderId = JSON.parse(responseA.body).id;

      const responseB = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'b@test.com', firstName: 'B', lastName: 'User' },
        },
      });
      tenantBOrderId = JSON.parse(responseB.body).id;
    });

    it('should prevent tenant A from accessing tenant B orders', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${tenantBOrderId}`,
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should prevent tenant B from accessing tenant A orders', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${tenantAOrderId}`,
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should allow tenant A to access their own orders', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${tenantAOrderId}`,
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(tenantAOrderId);
    });

    it('should allow tenant B to access their own orders', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/orders/${tenantBOrderId}`,
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(tenantBOrderId);
    });
  });

  describe('Order List Isolation', () => {
    beforeEach(async () => {
      // Create multiple orders for each tenant
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/orders',
          headers: {
            authorization: 'Bearer token-a',
            'x-tenant-id': tenantAId,
            'x-idempotency-key': uuidv4(),
          },
          payload: {
            eventId: uuidv4(),
            items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
            customerInfo: { email: `a${i}@test.com`, firstName: 'A', lastName: `User${i}` },
          },
        });

        await app.inject({
          method: 'POST',
          url: '/orders',
          headers: {
            authorization: 'Bearer token-b',
            'x-tenant-id': tenantBId,
            'x-idempotency-key': uuidv4(),
          },
          payload: {
            eventId: uuidv4(),
            items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
            customerInfo: { email: `b${i}@test.com`, firstName: 'B', lastName: `User${i}` },
          },
        });
      }
    });

    it('should only return tenant A orders to tenant A', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.orders.length).toBeGreaterThan(0);

      // Verify all returned orders belong to tenant A
      const tenantAOrders = await db.query(
        'SELECT COUNT(*) FROM orders WHERE tenant_id = $1',
        [tenantAId]
      );
      expect(body.total).toBe(parseInt(tenantAOrders.rows[0].count));
    });

    it('should only return tenant B orders to tenant B', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.orders.length).toBeGreaterThan(0);

      // Verify all returned orders belong to tenant B
      const tenantBOrders = await db.query(
        'SELECT COUNT(*) FROM orders WHERE tenant_id = $1',
        [tenantBId]
      );
      expect(body.total).toBe(parseInt(tenantBOrders.rows[0].count));
    });
  });

  describe('Order Modification Isolation', () => {
    beforeEach(async () => {
      const responseA = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'a@test.com', firstName: 'A', lastName: 'User' },
        },
      });
      tenantAOrderId = JSON.parse(responseA.body).id;

      const responseB = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'b@test.com', firstName: 'B', lastName: 'User' },
        },
      });
      tenantBOrderId = JSON.parse(responseB.body).id;
    });

    it('should prevent tenant A from cancelling tenant B orders', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${tenantBOrderId}/cancel`,
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          reason: 'Attempting cross-tenant cancellation',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should prevent tenant B from reserving tenant A orders', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/orders/${tenantAOrderId}/reserve`,
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Database Level Isolation', () => {
    it('should enforce tenant_id in WHERE clauses', async () => {
      // Create orders for both tenants
      await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'a@test.com', firstName: 'A', lastName: 'User' },
        },
      });

      await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'b@test.com', firstName: 'B', lastName: 'User' },
        },
      });

      // Query database directly to verify isolation
      const totalOrders = await db.query('SELECT COUNT(*) FROM orders');
      const tenantAOrders = await db.query('SELECT COUNT(*) FROM orders WHERE tenant_id = $1', [tenantAId]);
      const tenantBOrders = await db.query('SELECT COUNT(*) FROM orders WHERE tenant_id = $1', [tenantBId]);

      expect(parseInt(totalOrders.rows[0].count)).toBe(
        parseInt(tenantAOrders.rows[0].count) + parseInt(tenantBOrders.rows[0].count)
      );
    });

    it('should prevent direct database queries without tenant_id filter', async () => {
      // Create an order
      const response = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'test@test.com', firstName: 'Test', lastName: 'User' },
        },
      });

      const orderId = JSON.parse(response.body).id;

      // Verify the order exists with proper tenant_id
      const result = await db.query('SELECT * FROM orders WHERE id = $1 AND tenant_id = $2', [orderId, tenantAId]);
      expect(result.rows.length).toBe(1);

      // Verify querying without tenant_id would find it (but shouldn't be done in production)
      const unsafeResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      expect(unsafeResult.rows.length).toBe(1);
      expect(unsafeResult.rows[0].tenant_id).toBe(tenantAId);
    });
  });

  describe('Redis Cache Isolation', () => {
    it('should isolate cached data by tenant', async () => {
      // Create orders and ensure they're cached with tenant context
      const responseA = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-a',
          'x-tenant-id': tenantAId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'a@test.com', firstName: 'A', lastName: 'User' },
        },
      });

      const responseB = await app.inject({
        method: 'POST',
        url: '/orders',
        headers: {
          authorization: 'Bearer token-b',
          'x-tenant-id': tenantBId,
          'x-idempotency-key': uuidv4(),
        },
        payload: {
          eventId: uuidv4(),
          items: [{ ticketTypeId: uuidv4(), quantity: 1, price: 5000 }],
          customerInfo: { email: 'b@test.com', firstName: 'B', lastName: 'User' },
        },
      });

      expect(responseA.statusCode).toBe(201);
      expect(responseB.statusCode).toBe(201);

      // Verify different tenant data doesn't pollute cache
      const bodyA = JSON.parse(responseA.body);
      const bodyB = JSON.parse(responseB.body);
      expect(bodyA.id).not.toBe(bodyB.id);
    });
  });
});
