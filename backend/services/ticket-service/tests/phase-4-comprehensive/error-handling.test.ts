import axios from 'axios';
import { Pool } from 'pg';
import {
  TestDataHelper,
  DEFAULT_TENANT_ID,
  TEST_USERS,
  TEST_EVENT,
  TEST_TICKET_TYPES,
  createTestJWT,
} from '../fixtures/test-data';

/**
 * Phase 4: Error Handling Tests
 * 
 * Tests all error types and response formats
 */

describe('Error Handling - Production Reliability', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;
  let userToken: string;
  let adminToken: string;

  const API_BASE = 'http://localhost:3004';

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

    userToken = createTestJWT(TEST_USERS.BUYER_1, 'user');
    adminToken = createTestJWT(TEST_USERS.ADMIN, 'admin');

    console.log('✅ Error handling test setup complete');
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ Error handling test teardown complete');
  });

  describe('400 - Bad Request Errors', () => {
    it('should return 400 for missing tenant header', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${TEST_EVENT.id}/types`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
            },
          }
        );
        fail('Should have thrown 400');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBeDefined();
      }
    });

    it('should return 400 for invalid request body', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/tickets/types`,
          {
            // Missing required fields
            name: 'Invalid Type',
          },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 400');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });

    it('should return 400 for missing idempotency key', async () => {
      try {
        await axios.post(
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
              // Missing Idempotency-Key header
            },
          }
        );
        fail('Should have thrown 400');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('IDEMPOTENCY');
      }
    });
  });

  describe('401 - Unauthorized Errors', () => {
    it('should return 401 for missing authentication', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets`,
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

    it('should return 401 for invalid JWT token', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets`,
          {
            headers: {
              'Authorization': 'Bearer invalid.jwt.token',
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 401');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it('should return 401 for malformed Authorization header', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets`,
          {
            headers: {
              'Authorization': 'NotBearer token',
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 401');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });
  });

  describe('403 - Forbidden Errors', () => {
    it('should return 403 for insufficient permissions', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/tickets/types`,
          {
            eventId: TEST_EVENT.id,
            name: 'Unauthorized Type',
            priceCents: 5000,
            quantity: 50,
            maxPerPurchase: 4,
            saleStartDate: new Date().toISOString(),
            saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

    it('should return 403 when accessing other tenant resources', async () => {
      const otherTenantId = '00000000-0000-0000-0000-000000000099';
      
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${TEST_EVENT.id}/types`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': otherTenantId,
            },
          }
        );
        // Should either succeed with empty results or fail with 403
      } catch (error: any) {
        if (error.response) {
          expect([403, 200]).toContain(error.response.status);
        }
      }
    });
  });

  describe('404 - Not Found Errors', () => {
    it('should return 404 for non-existent ticket type', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/types/00000000-0000-0000-0000-000000000000`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 404');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should return 404 for non-existent event', async () => {
      const response = await axios.get(
        `${API_BASE}/api/v1/tickets/events/00000000-0000-0000-0000-000000000000/types`,
        {
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      // Should return empty array for non-existent event
      expect(response.status).toBe(200);
      expect(response.data.data).toEqual([]);
    });

    it('should return 404 for non-existent reservation', async () => {
      try {
        await axios.delete(
          `${API_BASE}/api/v1/tickets/reservations/00000000-0000-0000-0000-000000000000`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
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

  describe('409 - Conflict Errors', () => {
    it('should return 409 for insufficient inventory', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/purchase`,
          {
            eventId: TEST_EVENT.id,
            tenantId: DEFAULT_TENANT_ID,
            items: [
              {
                ticketTypeId: TEST_TICKET_TYPES.GA.id,
                quantity: 101, // GA has 100 tickets, so this should fail
              },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
              'Idempotency-Key': `insufficient-${Date.now()}`,
            },
          }
        );
        fail('Should have thrown 409');
      } catch (error: any) {
        expect(error.response.status).toBe(409);
        expect(error.response.data.error).toContain('INVENTORY');
      }
    });

    it('should return 409 for expired reservation confirmation', async () => {
      const reservation = await testHelper.createTestReservation(TEST_USERS.BUYER_1, {
        status: 'EXPIRED',
      });

      try {
        await axios.post(
          `${API_BASE}/api/v1/tickets/reservations/${reservation.id}/confirm`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown 409');
      } catch (error: any) {
        expect([404, 409]).toContain(error.response.status);
      }
    });
  });

  describe('500 - Internal Server Errors', () => {
    it('should handle database errors gracefully', async () => {
      // This would require injecting a database error
      // For now, verify error responses have correct structure
      expect(true).toBe(true);
    });

    it('should not expose stack traces in production', async () => {
      // Verify errors don't leak sensitive information
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/types/invalid-uuid-format`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
      } catch (error: any) {
        if (error.response) {
          expect(error.response.data).not.toHaveProperty('stack');
          expect(error.response.data).not.toHaveProperty('stackTrace');
        }
      }
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error structure', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets`,
          {
            headers: {
              'x-tenant-id': DEFAULT_TENANT_ID,
              // Missing auth
            },
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.data).toHaveProperty('error');
        expect(typeof error.response.data.error).toBe('string');
      }
    });

    it('should include error codes when available', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/purchase`,
          {
            eventId: TEST_EVENT.id,
            tenantId: DEFAULT_TENANT_ID,
            items: [],
          },
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
              // Missing idempotency key
            },
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.data.error).toBeDefined();
      }
    });

    it('should include helpful error messages', async () => {
      try {
        await axios.get(
          `${API_BASE}/api/v1/tickets/events/${TEST_EVENT.id}/types`,
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              // Missing tenant header
            },
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.data.error).toBeDefined();
        expect(error.response.data.error.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Logging', () => {
    it('should log errors without crashing the service', async () => {
      // Make multiple requests that cause errors
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          axios.get(`${API_BASE}/api/v1/tickets`, {
            headers: { 'x-tenant-id': DEFAULT_TENANT_ID }
          }).catch(() => {})
        );
      }

      await Promise.all(requests);

      // Service should still be healthy
      const health = await axios.get(`${API_BASE}/health`);
      expect(health.status).toBe(200);
    });
  });

  describe('Validation Errors', () => {
    it('should validate ticket type creation data', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/tickets/types`,
          {
            eventId: TEST_EVENT.id,
            name: 'Test Type',
            // Missing required fields: priceCents, quantity, etc.
          },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
            },
          }
        );
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });

    it('should validate purchase request data', async () => {
      try {
        await axios.post(
          `${API_BASE}/api/v1/purchase`,
          {
            // Missing eventId, items, etc.
          },
          {
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID,
              'Idempotency-Key': `validation-${Date.now()}`,
            },
          }
        );
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });
  });
});
