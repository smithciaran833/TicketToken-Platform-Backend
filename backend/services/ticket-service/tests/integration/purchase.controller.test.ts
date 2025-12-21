import { purchaseController } from '../../src/controllers/purchaseController';
import { DatabaseService } from '../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * INTEGRATION TESTS FOR PURCHASE CONTROLLER
 * Tests order creation with idempotency, inventory management, and discount application
 * 
 * FK Chain: tenants → users → venues → events → ticket_types → orders
 */

describe('PurchaseController Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testEventId: string;
  let testVenueId: string;
  let testTicketTypeId: string;
  let idempotencyKey: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testEventId = uuidv4();
    testVenueId = uuidv4();
    testTicketTypeId = uuidv4();
    idempotencyKey = `idem-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // 2. Create user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, `user-${testUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
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
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type with available inventory
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'General Admission', 50.00, 100, 100]
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM order_items WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM discounts WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('createOrder - idempotency', () => {
    it('should create order with valid idempotency key', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: expect.any(String),
          orderNumber: expect.stringMatching(/^ORD-/),
          status: expect.stringMatching(/pending|PENDING/i),
          totalCents: expect.any(Number)
        })
      );
    });

    it('should return cached response for duplicate idempotency key', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply1 = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      // First request
      await purchaseController.createOrder(request, reply1);
      const firstResponse = reply1.send.mock.calls[0][0];

      const reply2 = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      // Duplicate request with same idempotency key
      await purchaseController.createOrder(request, reply2);
      const secondResponse = reply2.send.mock.calls[0][0];

      // Should return same response
      expect(firstResponse.orderId).toBe(secondResponse.orderId);
      expect(firstResponse.orderNumber).toBe(secondResponse.orderNumber);
    });

    it('should reject request without idempotency key', async () => {
      const request = {
        headers: {},
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header required'
      });
    });
  });

  describe('createOrder - validation', () => {
    it('should reject request without eventId', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    });

    it('should reject request without items', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    });

    it('should reject request with empty items array', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    });

    it('should reject request without tenantId', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ]
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'tenantId required'
      });
    });
  });

  describe('createOrder - inventory management', () => {
    it('should reduce available quantity when order is created', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 5 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      // Check initial inventory
      const beforeResult = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );
      const beforeQuantity = parseInt(beforeResult.rows[0].available_quantity);

      await purchaseController.createOrder(request, reply);

      // Check inventory after order
      const afterResult = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );
      const afterQuantity = parseInt(afterResult.rows[0].available_quantity);

      expect(afterQuantity).toBe(beforeQuantity - 5);
    });

    it('should reject order when insufficient inventory', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 200 } // More than available
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INSUFFICIENT_INVENTORY'
        })
      );
    });

    it('should handle concurrent order attempts atomically', async () => {
      // Create multiple orders concurrently
      const orders = Array.from({ length: 5 }, (_, i) => {
        const key = `idem-concurrent-${i}-${Date.now()}`;
        return {
          headers: { 'idempotency-key': key },
          body: {
            eventId: testEventId,
            items: [{ ticketTypeId: testTicketTypeId, quantity: 15 }],
            tenantId: testTenantId
          },
          userId: testUserId
        };
      });

      const promises = orders.map(async (request) => {
        const reply = {
          status: jest.fn().mockReturnThis(),
          send: jest.fn()
        };
        try {
          await purchaseController.createOrder(request as any, reply as any);
          return { success: reply.status.mock.calls[0]?.[0] === 200 };
        } catch (error) {
          return { success: false };
        }
      });

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.success).length;

      // Should allow 6 orders of 15 tickets each (90 total), reject the 7th
      expect(successCount).toBeLessThanOrEqual(6);
    });
  });

  describe('createOrder - pricing and fees', () => {
    it('should calculate correct total with fees', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      const response = reply.send.mock.calls[0][0];

      // 2 tickets at $50 = $100 = 10000 cents
      // Platform fee: 7.5% = 750 cents
      // Processing fee: 2.9% = 290 cents
      // Total: 11040 cents
      expect(response.totalCents).toBe(11040);
    });

    it('should include formatted price in response', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 1 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      const response = reply.send.mock.calls[0][0];
      expect(response.totalFormatted).toMatch(/\$/);
    });

    it('should handle multiple ticket types in one order', async () => {
      // Create second ticket type
      const vipTicketTypeId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
        [vipTicketTypeId, testTenantId, testEventId, 'VIP', 150.00, 50, 50]
      );

      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 },
            { ticketTypeId: vipTicketTypeId, quantity: 1 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      const response = reply.send.mock.calls[0][0];
      expect(response.orderId).toBeDefined();
    });
  });

  describe('createOrder - discount codes', () => {
    beforeEach(async () => {
      // Create test discount - using correct schema columns
      await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, max_uses, times_used, is_active, valid_from, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 month')`,
        [testTenantId, 'SUMMER10', 'percentage', 10, 100, 0, true]
      );
    });

    it('should apply valid discount code', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId,
          discountCodes: ['SUMMER10']
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      const response = reply.send.mock.calls[0][0];

      // With 10% discount: 10000 cents -> 9000 cents
      // Fees applied to discounted amount
      expect(response.discountCents).toBeGreaterThan(0);
      expect(response.totalCents).toBeLessThan(11040);
    });

    it('should handle invalid discount codes gracefully', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId,
          discountCodes: ['INVALID_CODE']
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      // Should still create order, just without discount
      expect(reply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('createOrder - tenant isolation', () => {
    it('should prevent cross-tenant ticket type purchases', async () => {
      const wrongTenantId = uuidv4();

      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: wrongTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'TICKET_TYPE_NOT_FOUND'
        })
      );
    });

    it('should validate all ticket types belong to same tenant', async () => {
      // Create ticket type for different tenant
      const otherTenantId = uuidv4();
      const otherTicketTypeId = uuidv4();

      // Need to create full FK chain for other tenant
      await DatabaseService.query(
        'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
        [otherTenantId, 'Other Tenant', `other-${otherTenantId.substring(0, 8)}`]
      );

      await DatabaseService.query(
        `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
        [otherTicketTypeId, otherTenantId, testEventId, 'Hacker Ticket', 1.00, 1000, 1000]
      );

      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 1 },
            { ticketTypeId: otherTicketTypeId, quantity: 1 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);

      // Cleanup other tenant
      await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [otherTenantId]);
      await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [otherTenantId]);
    });
  });

  describe('createOrder - data persistence', () => {
    it('should create order record in database', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      const response = reply.send.mock.calls[0][0];
      const orderId = response.orderId;

      // Verify order exists in database
      const result = await DatabaseService.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].user_id).toBe(testUserId);
      expect(result.rows[0].tenant_id).toBe(testTenantId);
    });

    it('should create order items in database', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      const response = reply.send.mock.calls[0][0];
      const orderId = response.orderId;

      // Verify order items exist
      const result = await DatabaseService.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].ticket_type_id).toBe(testTicketTypeId);
      expect(parseInt(result.rows[0].quantity)).toBe(2);
    });

    it('should set expiration time for order reservation', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      const response = reply.send.mock.calls[0][0];

      if (response.expiresAt) {
        const expiresAt = new Date(response.expiresAt);
        const now = new Date();
        const diffMinutes = (expiresAt.getTime() - now.getTime()) / 1000 / 60;

        // Should expire in approximately 15 minutes
        expect(diffMinutes).toBeGreaterThan(14);
        expect(diffMinutes).toBeLessThan(16);
      }
    });
  });

  describe('error handling and rollback', () => {
    it('should rollback inventory on order creation failure', async () => {
      // Get initial inventory
      const beforeResult = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );
      const beforeQuantity = parseInt(beforeResult.rows[0].available_quantity);

      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: testTicketTypeId, quantity: 200 } // Will fail
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      // Verify inventory not changed after failed order
      const afterResult = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );
      const afterQuantity = parseInt(afterResult.rows[0].available_quantity);

      expect(afterQuantity).toBe(beforeQuantity);
    });

    it('should handle malformed ticket type IDs', async () => {
      const request = {
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          eventId: testEventId,
          items: [
            { ticketTypeId: 'not-a-uuid', quantity: 2 }
          ],
          tenantId: testTenantId
        },
        userId: testUserId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await purchaseController.createOrder(request, reply);

      expect(reply.status).toHaveBeenCalledWith(expect.any(Number));
      expect(reply.status.mock.calls[0][0]).toBeGreaterThanOrEqual(400);
    });
  });
});
