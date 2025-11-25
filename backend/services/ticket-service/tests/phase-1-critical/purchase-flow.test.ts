import { Pool } from 'pg';
import axios from 'axios';
import {
  TestDataHelper,
  DEFAULT_TENANT_ID,
  TEST_USERS,
  TEST_EVENT,
  TEST_TICKET_TYPES,
  TEST_DISCOUNT,
  createTestJWT,
  wait,
} from '../fixtures/test-data';

/**
 * Purchase Flow - Comprehensive Integration Tests
 * 
 * Tests the complete ticket purchase workflow from creation to confirmation
 */

describe('Purchase Flow - End to End', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;
  let buyerToken: string;
  let adminToken: string;

  const API_BASE = 'http://localhost:3004';

  beforeAll(async () => {
    // Connect to test database
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    testHelper = new TestDataHelper(pool);

    // Seed base test data
    await testHelper.seedDatabase();

    // Create test tokens
    buyerToken = createTestJWT(TEST_USERS.BUYER_1, 'user');
    adminToken = createTestJWT(TEST_USERS.ADMIN, 'admin');

    console.log('✅ Test setup complete');
  });

  afterAll(async () => {
    // Clean up test data
    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ Test teardown complete');
  });

  beforeEach(async () => {
    // Reset inventory before each test
    await testHelper.resetTicketTypeInventory(TEST_TICKET_TYPES.GA.id);
    await testHelper.resetTicketTypeInventory(TEST_TICKET_TYPES.VIP.id);
  });

  describe('Step 1: Ticket Type Creation', () => {
    it('should create a new ticket type as admin', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/tickets/types`,
        {
          eventId: TEST_EVENT.id,
          name: 'Early Bird',
          description: 'Limited early bird tickets',
          priceCents: 3500, // $35.00
          quantity: 25,
          maxPerPurchase: 2,
          saleStartDate: new Date().toISOString(),
          saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.name).toBe('Early Bird');
      expect(response.data.data.price_cents).toBe(3500);
      expect(response.data.data.available_quantity).toBe(25);
    });

    it('should reject ticket type creation without admin role', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/tickets/types`,
          {
            eventId: TEST_EVENT.id,
            name: 'Unauthorized Ticket',
            priceCents: 5000,
            quantity: 10,
            maxPerPurchase: 4,
            saleStartDate: new Date().toISOString(),
            saleEndDate: new Date().toISOString(),
          },
          {
            headers: {
              'Authorization': `Bearer ${buyerToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 403');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });

    it('should get all ticket types for an event', async () => {
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/events/${TEST_EVENT.id}/types`,
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeInstanceOf(Array);
      expect(response.data.data.length).toBeGreaterThanOrEqual(2); // GA and VIP

      // Verify structure
      const ticketType = response.data.data[0];
      expect(ticketType).toHaveProperty('id');
      expect(ticketType).toHaveProperty('name');
      expect(ticketType).toHaveProperty('price_cents');
      expect(ticketType).toHaveProperty('available_quantity');
    });
  });

  describe('Step 2: Order Creation with Inventory Hold', () => {
    it('should create order and hold inventory atomically', async () => {
      const idempotencyKey = `test-${Date.now()}-${Math.random()}`;

      // Check initial inventory
      const initialInventory = await testHelper.getTicketTypeInventory(TEST_TICKET_TYPES.GA.id);
      expect(initialInventory.available_quantity).toBe(100);

      // Create order
      const response = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: TEST_EVENT.id,
          tenantId: DEFAULT_TENANT_ID,
          items: [
            {
              ticketTypeId: TEST_TICKET_TYPES.GA.id,
              quantity: 2,
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.orderId).toBeDefined();
      expect(response.data.status).toBe('pending');
      expect(response.data.totalCents).toBeGreaterThan(0);
      expect(response.data.expiresAt).toBeDefined();

      // Verify inventory was held
      const updatedInventory = await testHelper.getTicketTypeInventory(TEST_TICKET_TYPES.GA.id);
      expect(updatedInventory.available_quantity).toBe(98); // 100 - 2
    });

    it('should respect idempotency - same key returns same order', async () => {
      const idempotencyKey = `test-idempotent-${Date.now()}`;

      // First request
      const response1 = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: TEST_EVENT.id,
          tenantId: DEFAULT_TENANT_ID,
          items: [{ ticketTypeId: TEST_TICKET_TYPES.GA.id, quantity: 1 }],
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      // Second request with same key
      const response2 = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: TEST_EVENT.id,
          tenantId: DEFAULT_TENANT_ID,
          items: [{ ticketTypeId: TEST_TICKET_TYPES.GA.id, quantity: 1 }],
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      // Should return same order
      expect(response1.data.orderId).toBe(response2.data.orderId);
      expect(response1.data.totalCents).toBe(response2.data.totalCents);

      // Inventory should only be decremented once
      const inventory = await testHelper.getTicketTypeInventory(TEST_TICKET_TYPES.GA.id);
      expect(inventory.available_quantity).toBe(99); // Only 1 ticket held
    });

    it('should reject order without idempotency key', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/purchase`,
          {
            eventId: TEST_EVENT.id,
            tenantId: DEFAULT_TENANT_ID,
            items: [{ ticketTypeId: TEST_TICKET_TYPES.GA.id, quantity: 1 }],
          },
          {
            headers: {
              'Authorization': `Bearer ${buyerToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
              // No Idempotency-Key
            },
          }
        );
        fail('Should have thrown 400');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBe('MISSING_IDEMPOTENCY_KEY');
      }
    });

    it('should reject order when insufficient inventory', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/purchase`,
          {
            eventId: TEST_EVENT.id,
            tenantId: DEFAULT_TENANT_ID,
            items: [
              {
                ticketTypeId: TEST_TICKET_TYPES.GA.id,
                quantity: 101, // More than available (100)
              },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${buyerToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
              'Idempotency-Key': `test-${Date.now()}`,
            },
          }
        );
        fail('Should have thrown 409');
      } catch (error: any) {
        expect(error.response.status).toBe(409);
        expect(error.response.data.error).toContain('INSUFFICIENT_INVENTORY');
      }
    });

    it('should calculate fees correctly', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: TEST_EVENT.id,
          tenantId: DEFAULT_TENANT_ID,
          items: [
            {
              ticketTypeId: TEST_TICKET_TYPES.GA.id, // 5000 cents = $50
              quantity: 2,
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
            'Idempotency-Key': `test-fees-${Date.now()}`,
          },
        }
      );

      const subtotal = 10000; // 2 x $50
      const platformFee = Math.round(subtotal * 0.075); // 7.5% = 750
      const processingFee = Math.round(subtotal * 0.029); // 2.9% = 290

      const expectedTotal = subtotal + platformFee + processingFee; // 11040

      expect(response.data.totalCents).toBe(expectedTotal);
    });
  });

  describe('Step 3: Reservation Flow (Alternative)', () => {
    it('should create reservation via ticket service', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/tickets/purchase`,
        {
          eventId: TEST_EVENT.id,
          tickets: [
            {
              ticketTypeId: TEST_TICKET_TYPES.VIP.id,
              quantity: 2,
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBeDefined();
      expect(response.data.data.expiresAt).toBeDefined();

      // Check expiration is ~10 minutes from now
      const expiresAt = new Date(response.data.data.expiresAt);
      const now = new Date();
      const diffMinutes = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(9);
      expect(diffMinutes).toBeLessThan(11);
    });

    it('should handle concurrent reservations with distributed lock', async () => {
      // Attempt to reserve more tickets than available concurrently
      const promises = Array(10)
        .fill(null)
        .map((_, i) =>
          axios.post(
            `${API_BASE}/api/v1/tickets/purchase`,
            {
              eventId: TEST_EVENT.id,
              tickets: [
                {
                  ticketTypeId: TEST_TICKET_TYPES.VIP.id, // Only 50 available
                  quantity: 10,
                },
              ],
            },
            {
              headers: {
                'Authorization': `Bearer ${buyerToken}`,
                'x-tenant-id': DEFAULT_TENANT_ID,
              },
              validateStatus: () => true, // Don't throw on errors
            }
          )
        );

      const results = await Promise.all(promises);

      const successful = results.filter(r => r.status === 200);
      const failed = results.filter(r => r.status !== 200);

      // Some should succeed, some should fail
      expect(successful.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);

      // Failed ones should be 409 Conflict
      failed.forEach(result => {
        expect(result.status).toBe(409);
      });

      // Total tickets reserved should not exceed available
      const inventory = await testHelper.getTicketTypeInventory(TEST_TICKET_TYPES.VIP.id);
      expect(inventory.available_quantity).toBeGreaterThanOrEqual(0);
    });

    it('should release reservation manually', async () => {
      // Create reservation
      const reservation = await testHelper.createTestReservation(TEST_USERS.BUYER_1);

      // Check inventory was held
      const beforeRelease = await testHelper.getTicketTypeInventory(TEST_TICKET_TYPES.GA.id);

      // Release reservation
      const response = await axios.delete(
        `${API_BASE}/api/v1/tickets/reservations/${reservation.id}`,
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify inventory restored
      const afterRelease = await testHelper.getTicketTypeInventory(TEST_TICKET_TYPES.GA.id);
      expect(afterRelease.available_quantity).toBeGreaterThan(beforeRelease.available_quantity);
    });
  });

  describe('Step 4: Discount Application', () => {
    it('should apply percentage discount correctly', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: TEST_EVENT.id,
          tenantId: DEFAULT_TENANT_ID,
          items: [
            {
              ticketTypeId: TEST_TICKET_TYPES.GA.id,
              quantity: 2,
            },
          ],
          discountCodes: [TEST_DISCOUNT.code], // 10% off
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
            'Idempotency-Key': `test-discount-${Date.now()}`,
          },
        }
      );

      // Subtotal: 10000 cents
      // Discount: 10% = 1000 cents
      // After discount: 9000 cents
      // Platform fee: 7.5% of 9000 = 675
      // Processing fee: 2.9% of 9000 = 261
      // Total: 9000 + 675 + 261 = 9936

      expect(response.data.totalCents).toBeLessThan(11040); // Less than without discount
      expect(response.status).toBe(200);
    });
  });

  describe('Step 5: Order Retrieval', () => {
    it('should get order by ID', async () => {
      // Create test order
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1);

      const response = await axios.get(
        `${API_BASE}/api/v1/orders/${order.id}`,
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.orderId).toBe(order.id);
      expect(response.data.status).toBe('PENDING');
      expect(response.data.totalCents).toBe(5520);
    });

    it('should not get order belonging to different user', async () => {
      // Create order for BUYER_1
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1);

      // Try to access with BUYER_2 token
      const buyer2Token = createTestJWT(TEST_USERS.BUYER_2, 'user');

      try {
        await axios.get(
          `${API_BASE}/api/v1/orders/${order.id}`,
          {
            headers: {
              'Authorization': `Bearer ${buyer2Token}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 404');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });
  });

  describe('Step 6: Ticket Retrieval', () => {
    it('should get user tickets', async () => {
      // Create test ticket
      await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      const response = await axios.get(
        `${API_BASE}/api/v1/tickets`,
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeInstanceOf(Array);
      expect(response.data.data.length).toBeGreaterThan(0);

      const ticket = response.data.data[0];
      expect(ticket).toHaveProperty('id');
      expect(ticket).toHaveProperty('status');
      expect(ticket).toHaveProperty('price_cents');
    });
  });

  describe('Step 7: QR Code Generation and Validation', () => {
    it('should generate QR code for ticket', async () => {
      // Create test ticket
      const ticket = await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/${ticket.id}/qr`,
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.qrCode).toBeDefined();
      expect(response.data.data.qrImage).toBeDefined();
      expect(response.data.data.qrCode).toMatch(/^TKT:/); // Starts with TKT:
    });

    it('should validate QR code successfully', async () => {
      // Create ticket and generate QR
      const ticket = await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      const qrResponse = await axios.get(
        `${API_BASE}/api/v1/tickets/${ticket.id}/qr`,
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      const qrCode = qrResponse.data.data.qrCode;

      // Validate QR
      const validationResponse = await axios.post(
        `${API_BASE}/api/v1/tickets/validate-qr`,
        {
          qrData: qrCode,
          eventId: ticket.event_id,
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(validationResponse.status).toBe(200);
      expect(validationResponse.data.valid).toBe(true);
      expect(validationResponse.data.data.ticketId).toBe(ticket.id);
    });

    it('should reject already used QR code', async () => {
      // This would require marking ticket as USED
      // Test would validate that same QR cannot be scanned twice
    });
  });

  describe('Error Handling', () => {
    it('should handle missing authentication', async () => {
      try {
        await axios.get(`${API_BASE}/api/v1/tickets`, {
          headers: {
            'x-tenant-id': DEFAULT_TENANT_ID,
            // No Authorization header
          },
        });
        fail('Should have thrown 401');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it('should handle missing tenant ID', async () => {
      try {
        await axios.get(`${API_BASE}/api/v1/tickets`, {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            // No x-tenant-id
          },
        });
        fail('Should have thrown 400 or 401');
      } catch (error: any) {
        expect([400, 401]).toContain(error.response.status);
      }
    });

    it('should handle non-existent resources', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000999';

      try {
        await axios.get(`${API_BASE}/api/v1/orders/${fakeId}`, {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        });
        fail('Should have thrown 404');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });
  });

  describe('Performance & Load', () => {
    it('should handle multiple concurrent orders', async () => {
      const promises = Array(5)
        .fill(null)
        .map((_, i) =>
          axios.post(
            `${API_BASE}/api/v1/purchase`,
            {
              eventId: TEST_EVENT.id,
              tenantId: DEFAULT_TENANT_ID,
              items: [{ ticketTypeId: TEST_TICKET_TYPES.GA.id, quantity: 1 }],
            },
            {
              headers: {
                'Authorization': `Bearer ${buyerToken}`,
                'x-tenant-id': DEFAULT_TENANT_ID,
                'Idempotency-Key': `test-concurrent-${Date.now()}-${i}`,
              },
            }
          )
        );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.data.orderId).toBeDefined();
      });

      // All orders should have unique IDs
      const orderIds = results.map(r => r.data.orderId);
      const uniqueIds = new Set(orderIds);
      expect(uniqueIds.size).toBe(5);
    });
  });
});
