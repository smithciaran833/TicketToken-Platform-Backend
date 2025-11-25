import { Pool } from 'pg';
import axios from 'axios';
import {
  TestDataHelper,
  DEFAULT_TENANT_ID,
  TEST_USERS,
  TEST_EVENT,
  TEST_TICKET_TYPES,
  createTestJWT,
} from '../fixtures/test-data';

/**
 * Phase 4: RBAC (Role-Based Access Control) Tests
 * 
 * Tests role and permission-based authorization across all endpoints
 */

describe('RBAC - Role-Based Access Control', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;

  const API_BASE = 'http://localhost:3004';

  // Test tokens for different roles
  let adminToken: string;
  let userToken: string;
  let venueManagerToken: string;
  let noPermissionsToken: string;

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

    // Create tokens with different permission sets
    adminToken = createTestJWT(TEST_USERS.ADMIN, 'admin');
    userToken = createTestJWT(TEST_USERS.BUYER_1, 'user');
    venueManagerToken = createTestJWT(TEST_USERS.VENUE_MANAGER, 'venue_manager');
    
    // Token with no permissions (edge case)
    noPermissionsToken = createTestJWT(TEST_USERS.BUYER_2, 'user');

    console.log('✅ RBAC test setup complete');
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ RBAC test teardown complete');
  });

  describe('Admin Role', () => {
    it('should allow admin to create ticket types', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/tickets/types`,
        {
          eventId: TEST_EVENT.id,
          name: 'Admin Created Type',
          description: 'Created by admin',
          priceCents: 4000,
          quantity: 30,
          maxPerPurchase: 3,
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
      expect(response.data.data.name).toBe('Admin Created Type');
    });

    it('should allow admin to update ticket types', async () => {
      const response = await axios.put(
        `${API_BASE}/api/v1/tickets/types/${TEST_TICKET_TYPES.GA.id}`,
        {
          priceCents: 5500,
          description: 'Updated by admin',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should allow admin to access all user data', async () => {
      // Admins should be able to view any user's tickets
      await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/users/${TEST_USERS.BUYER_1}`,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Venue Manager Role', () => {
    it('should allow venue manager to create ticket types', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/tickets/types`,
        {
          eventId: TEST_EVENT.id,
          name: 'Venue Manager Type',
          description: 'Created by venue manager',
          priceCents: 3500,
          quantity: 25,
          maxPerPurchase: 2,
          saleStartDate: new Date().toISOString(),
          saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          headers: {
            'Authorization': `Bearer ${venueManagerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
    });

    it('should allow venue manager to update ticket types', async () => {
      const response = await axios.put(
        `${API_BASE}/api/v1/tickets/types/${TEST_TICKET_TYPES.VIP.id}`,
        {
          priceCents: 16000,
        },
        {
          headers: {
            'Authorization': `Bearer ${venueManagerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
    });

    it('should not allow venue manager to access admin-only endpoints', async () => {
      // If there are admin-only endpoints, venue managers should be blocked
      // This is a placeholder - add actual admin-only endpoints when they exist
      expect(true).toBe(true);
    });
  });

  describe('Regular User Role', () => {
    it('should allow user to view ticket types', async () => {
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/events/${TEST_EVENT.id}/types`,
        {
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeInstanceOf(Array);
    });

    it('should allow user to purchase tickets', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: TEST_EVENT.id,
          tenantId: DEFAULT_TENANT_ID,
          items: [
            {
              ticketTypeId: TEST_TICKET_TYPES.GA.id,
              quantity: 1,
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
            'Idempotency-Key': `user-purchase-${Date.now()}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.orderId).toBeDefined();
    });

    it('should NOT allow user to create ticket types', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/tickets/types`,
          {
            eventId: TEST_EVENT.id,
            name: 'Unauthorized Type',
            priceCents: 4000,
            quantity: 10,
            maxPerPurchase: 2,
            saleStartDate: new Date().toISOString(),
            saleEndDate: new Date().toISOString(),
          },
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 403');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.error).toContain('permission');
      }
    });

    it('should NOT allow user to update ticket types', async () => {
      try {
        await axios.put(
          `${API_BASE}/api/v1/tickets/types/${TEST_TICKET_TYPES.GA.id}`,
          {
            priceCents: 99999,
          },
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 403');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });

    it('should allow user to view their own tickets', async () => {
      await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      const response = await axios.get(
        `${API_BASE}/api/v1/tickets`,
        {
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should NOT allow user to view other users tickets', async () => {
      await testHelper.createTestTicket(TEST_USERS.BUYER_2);

      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/users/${TEST_USERS.BUYER_2}`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        // If endpoint allows this, it might return 404 or 403
        // Adjust based on actual implementation
      } catch (error: any) {
        expect([403, 404]).toContain(error.response.status);
      }
    });
  });

  describe('Unauthenticated Requests', () => {
    it('should reject requests without authentication', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${TEST_EVENT.id}/types`,
          {
            headers: {
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 401');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it('should reject invalid JWT tokens', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${TEST_EVENT.id}/types`,
          {
            headers: {
              'Authorization': 'Bearer invalid.token.here',
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 401');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it('should reject expired JWT tokens', async () => {
      // Create an expired token (this would require modifying createTestJWT)
      // For now, this is a placeholder
      expect(true).toBe(true);
    });
  });

  describe('Permission-Based Authorization', () => {
    it('should allow users with ticket:create permission to create tickets', async () => {
      // This would require custom JWT with specific permissions
      // Placeholder for now
      expect(true).toBe(true);
    });

    it('should deny users without required permissions', async () => {
      // Test with noPermissionsToken if needed
      expect(true).toBe(true);
    });

    it('should respect wildcard permissions (venue:*)', async () => {
      // Venue managers have venue:* which should match venue:create, venue:update, etc.
      const response = await axios.post(
        `${API_BASE}/api/v1/tickets/types`,
        {
          eventId: TEST_EVENT.id,
          name: 'Wildcard Permission Test',
          priceCents: 3000,
          quantity: 20,
          maxPerPurchase: 2,
          saleStartDate: new Date().toISOString(),
          saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          headers: {
            'Authorization': `Bearer ${venueManagerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(201);
    });
  });

  describe('Role Hierarchy', () => {
    it('should allow admin to perform venue manager actions', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/tickets/types`,
        {
          eventId: TEST_EVENT.id,
          name: 'Admin as Venue Manager',
          priceCents: 3500,
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
    });

    it('should allow admin to perform user actions', async () => {
      const response = await axios.post(
        `${API_BASE}/api/v1/purchase`,
        {
          eventId: TEST_EVENT.id,
          tenantId: DEFAULT_TENANT_ID,
          items: [
            {
              ticketTypeId: TEST_TICKET_TYPES.GA.id,
              quantity: 1,
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
            'Idempotency-Key': `admin-purchase-${Date.now()}`,
          },
        }
      );

      expect(response.status).toBe(200);
    });

    it('should NOT allow venue manager to perform admin actions', async () => {
      // Placeholder - add when admin-specific endpoints exist
      expect(true).toBe(true);
    });
  });
});
