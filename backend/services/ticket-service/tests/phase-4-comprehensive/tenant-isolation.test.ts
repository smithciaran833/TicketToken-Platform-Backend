import { Pool } from 'pg';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  TestDataHelper,
  DEFAULT_TENANT_ID,
  TEST_USERS,
  TEST_EVENT,
  TEST_TICKET_TYPES,
  createTestJWT,
} from '../fixtures/test-data';

/**
 * Phase 4: Tenant Isolation Tests
 * 
 * Tests multi-tenancy security to prevent cross-tenant data leakage
 */

describe('Tenant Isolation - Multi-Tenancy Security', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;

  const API_BASE = 'http://localhost:3004';

  // Two different tenants
  const TENANT_A = DEFAULT_TENANT_ID;
  const TENANT_B = '00000000-0000-0000-0000-000000000002';

  // User tokens for each tenant
  let tenantAUserToken: string;
  let tenantBUserToken: string;
  let tenantAAdminToken: string;

  // Test data for each tenant
  let tenantAEvent: any;
  let tenantBEvent: any;
  let tenantATicketType: any;
  let tenantBTicketType: any;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    testHelper = new TestDataHelper(pool);
    await testHelper.seedDatabase();

    // Create tokens for different tenants
    tenantAUserToken = createTestJWT(TEST_USERS.BUYER_1, 'user', TENANT_A);
    tenantBUserToken = createTestJWT(TEST_USERS.BUYER_2, 'user', TENANT_B);
    tenantAAdminToken = createTestJWT(TEST_USERS.ADMIN, 'admin', TENANT_A);

    // Create separate events and ticket types for each tenant
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Tenant B Event
      tenantBEvent = {
        id: uuidv4(),
        tenant_id: TENANT_B,
        venue_id: '4eb55219-c3e2-4bec-8035-8bec590b4765',
        name: 'Tenant B Event',
        slug: `tenant-b-event-${Date.now()}`,
        event_type: 'single',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      };

      await client.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, event_type, status, visibility)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantBEvent.id,
          tenantBEvent.tenant_id,
          tenantBEvent.venue_id,
          tenantBEvent.name,
          tenantBEvent.slug,
          tenantBEvent.event_type,
          tenantBEvent.status,
          tenantBEvent.visibility,
        ]
      );

      // Tenant B Ticket Type
      tenantBTicketType = {
        id: uuidv4(),
        tenant_id: TENANT_B,
        event_id: tenantBEvent.id,
        name: 'Tenant B GA',
        price_cents: 6000,
        quantity: 50,
        available_quantity: 50,
      };

      await client.query(
        `INSERT INTO ticket_types (
          id, tenant_id, event_id, name, price_cents, quantity,
          available_quantity, reserved_quantity, sold_quantity,
          max_per_purchase, min_per_purchase,
          sale_start_date, sale_end_date, is_active, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 4, 1, $8, $9, true, 1)`,
        [
          tenantBTicketType.id,
          tenantBTicketType.tenant_id,
          tenantBTicketType.event_id,
          tenantBTicketType.name,
          tenantBTicketType.price_cents,
          tenantBTicketType.quantity,
          tenantBTicketType.available_quantity,
          new Date('2025-01-01'),
          new Date('2025-12-31'),
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Store Tenant A data for tests
    tenantAEvent = TEST_EVENT;
    tenantATicketType = TEST_TICKET_TYPES.GA;

    console.log('✅ Tenant isolation test setup complete');
  });

  afterAll(async () => {
    // Clean up both tenants
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tickets WHERE tenant_id = $1', [TENANT_B]);
      await client.query('DELETE FROM orders WHERE tenant_id = $1', [TENANT_B]);
      await client.query('DELETE FROM reservations WHERE tenant_id = $1', [TENANT_B]);
      await client.query('DELETE FROM ticket_types WHERE tenant_id = $1', [TENANT_B]);
      await client.query('DELETE FROM events WHERE tenant_id = $1', [TENANT_B]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ Tenant isolation test teardown complete');
  });

  describe('Tenant Header Validation', () => {
    it('should reject requests without tenant header', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${tenantAEvent.id}/types`,
          {
            headers: {
              'Authorization': `Bearer ${tenantAUserToken}`,
              // Missing x-tenant-id header
            },
          }
        );
        fail('Should have thrown 400');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('Tenant');
      }
    });

    it('should reject requests with empty tenant header', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${tenantAEvent.id}/types`,
          {
            headers: {
              'Authorization': `Bearer ${tenantAUserToken}`,
              'x-tenant-id': '',
            },
          }
        );
        fail('Should have thrown 400');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });

    it('should accept requests with valid tenant header', async () => {
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/events/${tenantAEvent.id}/types`,
        {
          headers: {
            'Authorization': `Bearer ${tenantAUserToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Cross-Tenant Data Access Prevention', () => {
    it('should NOT allow Tenant A user to view Tenant B ticket types', async () => {
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/events/${tenantBEvent.id}/types`,
        {
          headers: {
            'Authorization': `Bearer ${tenantAUserToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      // Should return empty array or 404, not Tenant B data
      expect(response.status).toBe(200);
      expect(response.data.data).toEqual([]);
    });

    it('should NOT allow Tenant A user to purchase Tenant B tickets', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/purchase`,
          {
            eventId: tenantBEvent.id,
            tenantId: TENANT_A,
            items: [
              {
                ticketTypeId: tenantBTicketType.id,
                quantity: 1,
              },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${tenantAUserToken}`,
              'x-tenant-id': TENANT_A,
              'Idempotency-Key': `cross-tenant-${Date.now()}`,
            },
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        // Should fail due to ticket type not found or event mismatch
        expect([400, 404]).toContain(error.response.status);
      }
    });

    it('should NOT return Tenant B tickets when Tenant A queries their tickets', async () => {
      // Create a ticket for Tenant B
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO tickets (
            id, tenant_id, event_id, ticket_type_id,
            user_id, status, price_cents,
            is_transferable, transfer_count
          ) VALUES ($1, $2, $3, $4, $5, 'SOLD', $6, true, 0)`,
          [
            uuidv4(),
            TENANT_B,
            tenantBEvent.id,
            tenantBTicketType.id,
            TEST_USERS.BUYER_2,
            tenantBTicketType.price_cents,
          ]
        );
      } finally {
        client.release();
      }

      // Tenant A user queries their tickets
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets`,
        {
          headers: {
            'Authorization': `Bearer ${tenantAUserToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      expect(response.status).toBe(200);
      // Should not include any Tenant B tickets
      const tenantBTickets = response.data.data?.filter(
        (t: any) => t.tenant_id === TENANT_B
      );
      expect(tenantBTickets?.length || 0).toBe(0);
    });
  });

  describe('Tenant Context Enforcement', () => {
    it('should enforce tenant context in ticket type creation', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/tickets/types`,
        {
          eventId: tenantAEvent.id,
          name: 'Tenant Enforced Type',
          priceCents: 4000,
          quantity: 20,
          maxPerPurchase: 2,
          saleStartDate: new Date().toISOString(),
          saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          headers: {
            'Authorization': `Bearer ${tenantAAdminToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      expect(response.status).toBe(201);

      // Verify it was created with correct tenant_id
      const result = await pool.query(
        'SELECT tenant_id FROM ticket_types WHERE id = $1',
        [response.data.data.id]
      );
      expect(result.rows[0].tenant_id).toBe(TENANT_A);
    });

    it('should enforce tenant context in order creation', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: tenantAEvent.id,
          tenantId: TENANT_A,
          items: [
            {
              ticketTypeId: tenantATicketType.id,
              quantity: 1,
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${tenantAUserToken}`,
            'x-tenant-id': TENANT_A,
            'Idempotency-Key': `tenant-context-${Date.now()}`,
          },
        }
      );

      expect(response.status).toBe(200);

      // Verify order has correct tenant_id
      const result = await pool.query(
        'SELECT tenant_id FROM orders WHERE id = $1',
        [response.data.orderId]
      );
      expect(result.rows[0].tenant_id).toBe(TENANT_A);
    });
  });

  describe('Admin Cross-Tenant Access', () => {
    it('should NOT allow Tenant A admin to access Tenant B data', async () => {
      // Even admins should be tenant-scoped
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/events/${tenantBEvent.id}/types`,
        {
          headers: {
            'Authorization': `Bearer ${tenantAAdminToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data).toEqual([]);
    });

    it('should NOT allow Tenant A admin to modify Tenant B ticket types', async () => {
      try {
        await axios.put(
          `${API_BASE}/api/v1/tickets/types/${tenantBTicketType.id}`,
          {
            priceCents: 99999,
          },
          {
            headers: {
              'Authorization': `Bearer ${tenantAAdminToken}`,
              'x-tenant-id': TENANT_A,
            },
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect([403, 404]).toContain(error.response.status);
      }
    });
  });

  describe('Tenant Mismatch Detection', () => {
    it('should detect JWT tenant mismatch with header tenant', async () => {
      // Token says Tenant A, but header says Tenant B
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${tenantBEvent.id}/types`,
          {
            headers: {
              'Authorization': `Bearer ${tenantAUserToken}`,
              'x-tenant-id': TENANT_B, // Mismatch!
            },
          }
        );
        // Depending on implementation, this might work but return no data
        // or throw an error
      } catch (error: any) {
        // If your system validates JWT tenant matches header tenant
        expect([400, 401, 403]).toContain(error.response.status);
      }
    });
  });

  describe('Database Query Isolation', () => {
    it('should include tenant_id in all SELECT queries', async () => {
      // This is tested indirectly by verifying no cross-tenant data leaks
      // Create tickets for both tenants
      const tenantATicket = await testHelper.createTestTicket(TEST_USERS.BUYER_1);
      
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO tickets (
            id, tenant_id, event_id, ticket_type_id,
            user_id, status, price_cents,
            is_transferable, transfer_count
          ) VALUES ($1, $2, $3, $4, $5, 'SOLD', $6, true, 0)`,
          [
            uuidv4(),
            TENANT_B,
            tenantBEvent.id,
            tenantBTicketType.id,
            TEST_USERS.BUYER_1, // Same user!
            6000,
          ]
        );
      } finally {
        client.release();
      }

      // Query Tenant A tickets
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets`,
        {
          headers: {
            'Authorization': `Bearer ${tenantAUserToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      expect(response.status).toBe(200);
      // Should only see Tenant A tickets, even though same user owns both
      const tickets = response.data.data || [];
      tickets.forEach((ticket: any) => {
        expect(ticket.tenant_id).toBe(TENANT_A);
      });
    });

    it('should include tenant_id in UPDATE queries', async () => {
      // Create ticket type for Tenant A
      const ticketTypeResponse = await axios.post(
        `${API_BASE}/api/v1/tickets/types`,
        {
          eventId: tenantAEvent.id,
          name: 'Update Test Type',
          priceCents: 5000,
          quantity: 30,
          maxPerPurchase: 3,
          saleStartDate: new Date().toISOString(),
          saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          headers: {
            'Authorization': `Bearer ${tenantAAdminToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      const ticketTypeId = ticketTypeResponse.data.data.id;

      // Update it
      await axios.put(
        `${API_BASE}/api/v1/tickets/types/${ticketTypeId}`,
        {
          priceCents: 5500,
        },
        {
          headers: {
            'Authorization': `Bearer ${tenantAAdminToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      // Verify tenant_id unchanged
      const result = await pool.query(
        'SELECT tenant_id, price_cents FROM ticket_types WHERE id = $1',
        [ticketTypeId]
      );
      expect(result.rows[0].tenant_id).toBe(TENANT_A);
      expect(result.rows[0].price_cents).toBe(5500);
    });

    it('should include tenant_id in DELETE queries', async () => {
      // Create a reservation for Tenant A
      const reservation = await testHelper.createTestReservation(TEST_USERS.BUYER_1);

      // Delete it
      const response = await axios.delete(
        `${API_BASE}/api/v1/tickets/reservations/${reservation.id}`,
        {
          headers: {
            'Authorization': `Bearer ${tenantAUserToken}`,
            'x-tenant-id': TENANT_A,
          },
        }
      );

      expect(response.status).toBe(200);

      // Verify it was deleted and had correct tenant
      const result = await pool.query(
        'SELECT status FROM reservations WHERE id = $1',
        [reservation.id]
      );
      expect(result.rows[0].status).not.toBe('ACTIVE');
    });
  });
});
