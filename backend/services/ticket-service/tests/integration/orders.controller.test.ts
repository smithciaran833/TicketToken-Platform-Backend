import { ordersController } from '../../src/controllers/orders.controller';
import { DatabaseService } from '../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR ORDERS CONTROLLER
 * Tests order retrieval, user orders, and user tickets endpoints
 * 
 * FK Chain: tenants → users → venues → events → ticket_types → orders/tickets
 */

describe('OrdersController Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testOtherUserId: string;
  let testEventId: string;
  let testVenueId: string;
  let testTicketTypeId: string;
  let testOrderId: string;
  let testOrderNumber: string;
  let testTicketId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testOtherUserId = uuidv4();
    testEventId = uuidv4();
    testVenueId = uuidv4();
    testTicketTypeId = uuidv4();
    testOrderId = uuidv4();
    testOrderNumber = `ORD-${Date.now().toString(36)}`;
    testTicketId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // 2. Create users
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, `user-${testUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testOtherUserId, `other-${testOtherUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'New York', 'NY', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 month', $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Concert', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'General Admission', 50.00, 100, 100]
    );

    // 6. Create order
    await DatabaseService.query(
      `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, subtotal_cents, platform_fee_cents,
        processing_fee_cents, total_cents, ticket_quantity, status, currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 10000, 750, 290, 11040, 2, 'COMPLETED', 'USD', NOW(), NOW())`,
      [testOrderId, testTenantId, testUserId, testEventId, testOrderNumber]
    );

    // 7. Create order items
    await DatabaseService.query(
      `INSERT INTO order_items (id, tenant_id, order_id, ticket_type_id, quantity, unit_price_cents, total_price_cents)
       VALUES ($1, $2, $3, $4, 2, 5000, 10000)`,
      [uuidv4(), testTenantId, testOrderId, testTicketTypeId]
    );

    // 8. Create ticket
    const ticketNumber = `TKT-${Date.now()}`;
    await DatabaseService.query(
      `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [testTicketId, testTenantId, testEventId, testUserId, testTicketTypeId, ticketNumber, `QR-${ticketNumber}`, 'active', 5000]
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM tickets WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM order_items WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('getOrderById', () => {
    it('should return order for authenticated user', async () => {
      const request = {
        params: { orderId: testOrderId },
        user: { id: testUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: testOrderId,
          status: 'COMPLETED',
          totalCents: 11040,
          totalFormatted: expect.any(String),
          items: expect.arrayContaining([
            expect.objectContaining({
              ticketTypeId: testTicketTypeId,
              quantity: 2
            })
          ])
        })
      );
    });

    it('should return 400 if orderId is missing', async () => {
      const request = {
        params: {},
        user: { id: testUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Order ID is required' });
    });

    it('should return 401 if user not authenticated', async () => {
      const request = {
        params: { orderId: testOrderId },
        user: null,
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 404 if order not found', async () => {
      const fakeOrderId = uuidv4();
      const request = {
        params: { orderId: fakeOrderId },
        user: { id: testUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Order not found' });
    });

    it('should prevent users from accessing other users orders', async () => {
      const request = {
        params: { orderId: testOrderId },
        user: { id: testOtherUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Order not found' });
    });

    it('should format prices correctly', async () => {
      const request = {
        params: { orderId: testOrderId },
        user: { id: testUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.totalFormatted).toMatch(/\$/);
      expect(response.items[0].unitPriceFormatted).toMatch(/\$/);
      expect(response.items[0].totalPriceFormatted).toMatch(/\$/);
    });
  });

  describe('getUserOrders', () => {
    it('should return all orders for authenticated user', async () => {
      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserOrders(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        orders: expect.arrayContaining([
          expect.objectContaining({
            orderId: testOrderId,
            status: 'COMPLETED',
            eventName: 'Test Concert',
            totalCents: 11040
          })
        ]),
        pagination: expect.objectContaining({
          limit: 10,
          offset: 0
        })
      });
    });

    it('should return 401 if user not authenticated', async () => {
      const request = {
        user: null,
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getUserOrders(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should filter by status', async () => {
      // Create a pending order
      const pendingOrderId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, subtotal_cents, platform_fee_cents,
          processing_fee_cents, total_cents, ticket_quantity, status, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 5000, 375, 145, 5520, 1, 'PENDING', 'USD', NOW(), NOW())`,
        [pendingOrderId, testTenantId, testUserId, testEventId, `ORD-${Date.now().toString(36)}`]
      );

      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: { status: 'COMPLETED' },
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserOrders(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.orders).toHaveLength(1);
      expect(response.orders[0].status).toBe('COMPLETED');
    });

    it('should support pagination', async () => {
      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: { limit: 5, offset: 0 },
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserOrders(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        orders: expect.any(Array),
        pagination: {
          limit: 5,
          offset: 0,
          total: expect.any(Number)
        }
      });
    });

    it('should return empty array for user with no orders', async () => {
      const newUserId = uuidv4();
      const request = {
        user: { id: newUserId },
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserOrders(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        orders: [],
        pagination: expect.any(Object)
      });
    });
  });

  describe('getUserTickets', () => {
    it('should return all tickets for authenticated user', async () => {
      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        tickets: expect.arrayContaining([
          expect.objectContaining({
            id: testTicketId,
            status: 'active',
            eventName: 'Test Concert',
            ticketType: 'General Admission',
            priceCents: 5000
          })
        ])
      });
    });

    it('should return 401 if user not authenticated', async () => {
      const request = {
        user: null,
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should filter by event ID', async () => {
      const otherEventId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, status, created_by)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '2 months', $6, $7)`,
        [otherEventId, testTenantId, testVenueId, 'Other Event', `event-${otherEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
      );

      const otherTicketTypeId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
        [otherTicketTypeId, testTenantId, otherEventId, 'VIP', 100.00, 50, 50]
      );

      const otherTicketNumber = `TKT-${Date.now()}-OTHER`;
      await DatabaseService.query(
        `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [uuidv4(), testTenantId, otherEventId, testUserId, otherTicketTypeId, otherTicketNumber, `QR-${otherTicketNumber}`, 'active', 10000]
      );

      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: { eventId: testEventId },
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.tickets).toHaveLength(1);
      expect(response.tickets[0].eventId).toBe(testEventId);
    });

    it('should filter by status', async () => {
      // Create a used ticket
      const usedTicketNumber = `TKT-${Date.now()}-USED`;
      await DatabaseService.query(
        `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [uuidv4(), testTenantId, testEventId, testUserId, testTicketTypeId, usedTicketNumber, `QR-${usedTicketNumber}`, 'used', 5000]
      );

      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: { status: 'active' },
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.tickets.every((t: any) => t.status === 'active')).toBe(true);
    });

    it('should include formatted prices', async () => {
      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.tickets[0].priceFormatted).toMatch(/\$/);
    });

    it('should return empty array for user with no tickets', async () => {
      const newUserId = uuidv4();
      const request = {
        user: { id: newUserId },
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        tickets: []
      });
    });
  });

  describe('security and tenant isolation', () => {
    it('should prevent cross-tenant order access', async () => {
      const otherTenantId = uuidv4();
      const request = {
        params: { orderId: testOrderId },
        user: { id: testUserId },
        tenantId: otherTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it('should prevent cross-tenant ticket access', async () => {
      const otherTenantId = uuidv4();
      const request = {
        user: { id: testUserId },
        tenantId: otherTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        tickets: []
      });
    });

    it('should use tenant context in database queries', async () => {
      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: {},
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserOrders(request, reply);

      expect(reply.send).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      await DatabaseService.close();

      const request = {
        params: { orderId: testOrderId },
        user: { id: testUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error'
        })
      );

      await DatabaseService.initialize();
    });

    it('should include request ID in error responses', async () => {
      const requestId = 'test-request-123';
      const request = {
        params: { orderId: uuidv4() },
        user: { id: testUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': requestId }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.requestId).toBe(requestId);
    });
  });

  describe('data consistency', () => {
    it('should return consistent order and item data', async () => {
      const request = {
        params: { orderId: testOrderId },
        user: { id: testUserId },
        tenantId: testTenantId,
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getOrderById(request, reply);

      const response = reply.send.mock.calls[0][0];

      const itemsTotal = response.items.reduce(
        (sum: number, item: any) => sum + item.totalPriceCents,
        0
      );

      expect(itemsTotal).toBe(10000);
    });

    it('should maintain correct ticket counts', async () => {
      const request = {
        user: { id: testUserId },
        tenantId: testTenantId,
        query: { eventId: testEventId },
        headers: { 'x-request-id': 'test-123' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await ordersController.getUserTickets(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.tickets.length).toBeGreaterThan(0);

      response.tickets.forEach((ticket: any) => {
        expect(ticket.eventId).toBe(testEventId);
      });
    });
  });
});
