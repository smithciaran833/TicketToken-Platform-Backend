import { PurchaseSaga } from '../../src/sagas/PurchaseSaga';
import { DatabaseService } from '../../src/services/databaseService';
import { orderServiceClient } from '../../src/clients/OrderServiceClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR PURCHASE SAGA
 * Tests orchestration of multi-step purchase workflow with compensation
 * 
 * FK Chain: tenants → users → venues → events → ticket_types → tickets
 */

// Mock the order service client
jest.mock('../../src/clients/OrderServiceClient', () => ({
  orderServiceClient: {
    createOrder: jest.fn(),
    cancelOrder: jest.fn(),
  },
  OrderServiceError: class OrderServiceError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'OrderServiceError';
    }
  },
}));

describe('PurchaseSaga Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();

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
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type with inventory
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, quantity, available_quantity, reserved_quantity, price, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'VIP', 100, 50, 0, 100.00]
    );

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup in reverse FK order
    await DatabaseService.query('DELETE FROM tickets WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('successful purchase flow', () => {
    it('should complete all steps successfully', async () => {
      const orderId = uuidv4();
      const orderNumber = 'ORD-12345';

      // Mock successful order creation
      (orderServiceClient.createOrder as jest.Mock).mockResolvedValue({
        orderId,
        orderNumber,
        status: 'PENDING',
        totalCents: 10000,
      });

      const saga = new PurchaseSaga();
      const result = await saga.execute({
        userId: testUserId,
        eventId: testEventId,
        tenantId: testTenantId,
        items: [{ ticketTypeId: testTicketTypeId, quantity: 2 }],
        idempotencyKey: uuidv4(),
      });

      expect(result).toBeDefined();
      expect(result.orderId).toBe(orderId);
      expect(result.orderNumber).toBe(orderNumber);
      expect(result.tickets).toHaveLength(2);
    });

    it('should reserve inventory atomically', async () => {
      const orderId = uuidv4();

      (orderServiceClient.createOrder as jest.Mock).mockResolvedValue({
        orderId,
        orderNumber: 'ORD-123',
        status: 'PENDING',
        totalCents: 30000,
      });

      const initialInventory = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      const saga = new PurchaseSaga();
      await saga.execute({
        userId: testUserId,
        eventId: testEventId,
        tenantId: testTenantId,
        items: [{ ticketTypeId: testTicketTypeId, quantity: 3 }],
        idempotencyKey: uuidv4(),
      });

      const finalInventory = await DatabaseService.query(
        'SELECT available_quantity, reserved_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      expect(finalInventory.rows[0].available_quantity).toBe(
        initialInventory.rows[0].available_quantity - 3
      );
      expect(finalInventory.rows[0].reserved_quantity).toBe(3);
    });

    it('should create order via order service', async () => {
      const orderId = uuidv4();

      (orderServiceClient.createOrder as jest.Mock).mockResolvedValue({
        orderId,
        orderNumber: 'ORD-456',
        status: 'PENDING',
        totalCents: 10000,
      });

      const saga = new PurchaseSaga();
      await saga.execute({
        userId: testUserId,
        eventId: testEventId,
        tenantId: testTenantId,
        items: [{ ticketTypeId: testTicketTypeId, quantity: 1 }],
        idempotencyKey: uuidv4(),
      });

      expect(orderServiceClient.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          eventId: testEventId,
          items: expect.arrayContaining([
            expect.objectContaining({
              ticketTypeId: testTicketTypeId,
              quantity: 1,
            }),
          ]),
        })
      );
    });

    it('should create tickets in database', async () => {
      const orderId = uuidv4();

      (orderServiceClient.createOrder as jest.Mock).mockResolvedValue({
        orderId,
        orderNumber: 'ORD-789',
        status: 'PENDING',
        totalCents: 20000,
      });

      const saga = new PurchaseSaga();
      await saga.execute({
        userId: testUserId,
        eventId: testEventId,
        tenantId: testTenantId,
        items: [{ ticketTypeId: testTicketTypeId, quantity: 2 }],
        idempotencyKey: uuidv4(),
      });

      const tickets = await DatabaseService.query(
        'SELECT * FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      expect(tickets.rows).toHaveLength(2);
      expect(tickets.rows[0].status).toBe('active');
      expect(tickets.rows[0].ticket_type_id).toBe(testTicketTypeId);
    });

    it('should handle multiple item types', async () => {
      const ticketType2Id = uuidv4();
      await DatabaseService.query(
        `INSERT INTO ticket_types (id, tenant_id, event_id, name, quantity, available_quantity, price, sale_start, sale_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
        [ticketType2Id, testTenantId, testEventId, 'General', 100, 50, 50.00]
      );

      const orderId = uuidv4();

      (orderServiceClient.createOrder as jest.Mock).mockResolvedValue({
        orderId,
        orderNumber: 'ORD-MULTI',
        status: 'PENDING',
        totalCents: 25000,
      });

      const saga = new PurchaseSaga();
      const result = await saga.execute({
        userId: testUserId,
        eventId: testEventId,
        tenantId: testTenantId,
        items: [
          { ticketTypeId: testTicketTypeId, quantity: 2 },
          { ticketTypeId: ticketType2Id, quantity: 1 },
        ],
        idempotencyKey: uuidv4(),
      });

      expect(result.tickets).toHaveLength(3);
    });

    it('should pass idempotency key to order service', async () => {
      const idempotencyKey = uuidv4();
      const orderId = uuidv4();

      (orderServiceClient.createOrder as jest.Mock).mockResolvedValue({
        orderId,
        orderNumber: 'ORD-IDEM',
        status: 'PENDING',
        totalCents: 10000,
      });

      const saga = new PurchaseSaga();
      await saga.execute({
        userId: testUserId,
        eventId: testEventId,
        tenantId: testTenantId,
        items: [{ ticketTypeId: testTicketTypeId, quantity: 1 }],
        idempotencyKey,
      });

      expect(orderServiceClient.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey,
        })
      );
    });
  });

  describe('inventory management', () => {
    it('should fail if insufficient inventory', async () => {
      const saga = new PurchaseSaga();

      await expect(
        saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 100 }], // More than available (50)
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('INSUFFICIENT_INVENTORY');

      // Verify order service was not called
      expect(orderServiceClient.createOrder).not.toHaveBeenCalled();
    });

    it('should not modify inventory on insufficient stock', async () => {
      const initialInventory = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      const saga = new PurchaseSaga();

      try {
        await saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 100 }],
          idempotencyKey: uuidv4(),
        });
      } catch (error) {
        // Expected
      }

      const finalInventory = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      expect(finalInventory.rows[0].available_quantity).toBe(
        initialInventory.rows[0].available_quantity
      );
    });

    it('should handle concurrent purchases correctly', async () => {
      const orderId1 = uuidv4();
      const orderId2 = uuidv4();

      let callCount = 0;
      (orderServiceClient.createOrder as jest.Mock).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          orderId: callCount === 1 ? orderId1 : orderId2,
          orderNumber: `ORD-${callCount}`,
          status: 'PENDING',
          totalCents: 10000,
        });
      });

      const saga1 = new PurchaseSaga();
      const saga2 = new PurchaseSaga();

      // Set only 2 tickets available
      await DatabaseService.query(
        'UPDATE ticket_types SET available_quantity = 2 WHERE id = $1',
        [testTicketTypeId]
      );

      const results = await Promise.allSettled([
        saga1.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 2 }],
          idempotencyKey: uuidv4(),
        }),
        saga2.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 2 }],
          idempotencyKey: uuidv4(),
        }),
      ]);

      // One should succeed, one should fail
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);
    });

    it('should update reserved_quantity correctly', async () => {
      const orderId = uuidv4();

      (orderServiceClient.createOrder as jest.Mock).mockResolvedValue({
        orderId,
        orderNumber: 'ORD-RES',
        status: 'PENDING',
        totalCents: 10000,
      });

      const saga = new PurchaseSaga();
      await saga.execute({
        userId: testUserId,
        eventId: testEventId,
        tenantId: testTenantId,
        items: [{ ticketTypeId: testTicketTypeId, quantity: 5 }],
        idempotencyKey: uuidv4(),
      });

      const ticketType = await DatabaseService.query(
        'SELECT reserved_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      expect(ticketType.rows[0].reserved_quantity).toBe(5);
    });
  });

  describe('compensation - order service failure', () => {
    it('should release inventory if order creation fails', async () => {
      (orderServiceClient.createOrder as jest.Mock).mockRejectedValue(
        new Error('Order service unavailable')
      );

      const initialInventory = await DatabaseService.query(
        'SELECT available_quantity, reserved_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      const saga = new PurchaseSaga();

      await expect(
        saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 3 }],
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow();

      // Wait for compensation
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalInventory = await DatabaseService.query(
        'SELECT available_quantity, reserved_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      // Inventory should be back to initial state
      expect(finalInventory.rows[0].available_quantity).toBe(
        initialInventory.rows[0].available_quantity
      );
    });

    it('should not create tickets if order fails', async () => {
      (orderServiceClient.createOrder as jest.Mock).mockRejectedValue(
        new Error('Order service error')
      );

      const saga = new PurchaseSaga();

      try {
        await saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 2 }],
          idempotencyKey: uuidv4(),
        });
      } catch (error) {
        // Expected
      }

      const tickets = await DatabaseService.query(
        'SELECT * FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      expect(tickets.rows).toHaveLength(0);
    });
  });

  describe('transaction atomicity', () => {
    it('should rollback all changes on failure', async () => {
      (orderServiceClient.createOrder as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const initialState = await DatabaseService.query(`
        SELECT available_quantity, reserved_quantity
        FROM ticket_types
        WHERE id = $1
      `, [testTicketTypeId]);

      const saga = new PurchaseSaga();

      try {
        await saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 3 }],
          idempotencyKey: uuidv4(),
        });
      } catch (error) {
        // Expected
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalState = await DatabaseService.query(`
        SELECT available_quantity, reserved_quantity
        FROM ticket_types
        WHERE id = $1
      `, [testTicketTypeId]);

      const tickets = await DatabaseService.query(
        'SELECT * FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      // Everything should be back to initial state
      expect(tickets.rows).toHaveLength(0);
      expect(finalState.rows[0].available_quantity).toBe(
        initialState.rows[0].available_quantity
      );
    });
  });

  describe('edge cases', () => {
    it('should handle zero quantity gracefully', async () => {
      const saga = new PurchaseSaga();

      await expect(
        saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 0 }],
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow();
    });

    it('should handle non-existent ticket type', async () => {
      const fakeTicketTypeId = uuidv4();

      const saga = new PurchaseSaga();

      await expect(
        saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [{ ticketTypeId: fakeTicketTypeId, quantity: 1 }],
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow();
    });

    it('should handle empty items array', async () => {
      const saga = new PurchaseSaga();

      await expect(
        saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: testTenantId,
          items: [],
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow();
    });

    it('should enforce tenant isolation', async () => {
      const wrongTenantId = uuidv4();

      const saga = new PurchaseSaga();

      await expect(
        saga.execute({
          userId: testUserId,
          eventId: testEventId,
          tenantId: wrongTenantId,
          items: [{ ticketTypeId: testTicketTypeId, quantity: 1 }],
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow();
    });
  });
});
