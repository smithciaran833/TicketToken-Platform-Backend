/// <reference types="jest" />
import axios from 'axios';
import { Pool } from 'pg';

const BASE_URL = 'http://localhost:3002';
const AUTH_URL = 'http://localhost:3001';
const timestamp = Date.now();

// Database connection for verification
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

describe('Venue Service - Comprehensive Tests', () => {
  let testEmail: string;
  let testPassword: string;
  let accessToken: string;
  let userId: string;
  let venueId: string;
  let secondUserEmail: string;
  let secondAccessToken: string;
  let secondUserId: string;
  let integrationId: string;

  beforeAll(async () => {
    testEmail = `venue_test_${timestamp}@example.com`;
    secondUserEmail = `venue_test_${timestamp}_2@example.com`;
    testPassword = 'TestPass123!';

    // Register first user via auth-service
    const authResponse = await axios.post(`${AUTH_URL}/auth/register`, {
      email: testEmail,
      password: testPassword,
      firstName: 'Venue',
      lastName: 'Owner'
    });
    accessToken = authResponse.data.data.tokens.accessToken;
    userId = authResponse.data.data.user.id;

    // Register second user
    const secondAuthResponse = await axios.post(`${AUTH_URL}/auth/register`, {
      email: secondUserEmail,
      password: testPassword,
      firstName: 'Staff',
      lastName: 'Member'
    });
    secondAccessToken = secondAuthResponse.data.data.tokens.accessToken;
    secondUserId = secondAuthResponse.data.data.user.id;
  });

  afterAll(async () => {
    // Cleanup test data - delete in correct order (foreign keys)
    await pool.query('DELETE FROM venue_layouts WHERE venue_id IN (SELECT id FROM venues WHERE name LIKE $1)', [`Test Venue ${timestamp}%`]);
    await pool.query('DELETE FROM venue_integrations WHERE venue_id IN (SELECT id FROM venues WHERE name LIKE $1)', [`Test Venue ${timestamp}%`]);
    await pool.query('DELETE FROM venue_settings WHERE venue_id IN (SELECT id FROM venues WHERE name LIKE $1)', [`Test Venue ${timestamp}%`]);
    await pool.query('DELETE FROM venue_staff WHERE venue_id IN (SELECT id FROM venues WHERE name LIKE $1)', [`Test Venue ${timestamp}%`]);
    await pool.query('DELETE FROM venues WHERE name LIKE $1', [`Test Venue ${timestamp}%`]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`venue_test_${timestamp}%`]);
    await pool.end();
  });

  // ========================================
  // HEALTH & METRICS
  // ========================================

  describe('GET /health', () => {
    test('should return healthy status', async () => {
      const response = await axios.get(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ok');
      expect(response.data.service).toBe('venue-service');
      expect(response.data.timestamp).toBeDefined();
    });
  });

  describe('GET /metrics', () => {
    test('should return Prometheus metrics', async () => {
      const response = await axios.get(`${BASE_URL}/metrics`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.data).toContain('# TYPE');
    });
  });

  // ========================================
  // VENUE CRUD OPERATIONS
  // ========================================

  describe('POST /api/v1/venues', () => {
    test('should create venue in database and assign creator as owner', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/venues`,
        {
          name: `Test Venue ${timestamp}`,
          email: `venue${timestamp}@example.com`,
          type: 'theater',
          capacity: 500,
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'US'
          }
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      // Check response
      expect(response.status).toBe(201);
      expect(response.data.name).toBe(`Test Venue ${timestamp}`);
      expect(response.data.id).toBeDefined();

      // Store for later tests
      venueId = response.data.id;

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM venues WHERE id = $1',
        [venueId]
      );

      expect(dbResult.rows.length).toBe(1);
      const venue = dbResult.rows[0];

      expect(venue.name).toBe(`Test Venue ${timestamp}`);
      expect(venue.email).toBe(`venue${timestamp}@example.com`);
      expect(venue.venue_type).toBe('theater');
      expect(venue.max_capacity).toBe(500);
      expect(venue.city).toBe('New York');
      expect(venue.created_by).toBe(userId);
      expect(venue.tenant_id).toBeDefined();

      // Verify venue_settings was created
      const settingsResult = await pool.query(
        'SELECT * FROM venue_settings WHERE venue_id = $1',
        [venueId]
      );
      expect(settingsResult.rows.length).toBe(1);

      // Verify creator was added as owner in venue_staff
      const staffResult = await pool.query(
        'SELECT * FROM venue_staff WHERE venue_id = $1 AND user_id = $2',
        [venueId, userId]
      );
      expect(staffResult.rows.length).toBe(1);
      expect(staffResult.rows[0].role).toBe('owner');
    });

    test('should reject venue creation without authentication', async () => {
      try {
        await axios.post(`${BASE_URL}/api/v1/venues`, {
          name: 'Unauthorized Venue',
          email: 'test@example.com',
          type: 'theater',
          capacity: 100,
          address: {
            street: '123 St',
            city: 'NYC',
            state: 'NY',
            zipCode: '10001',
            country: 'US'
          }
        });
        fail('Should have thrown 401 error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should reject venue with invalid type', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/venues`,
          {
            name: 'Bad Type Venue',
            email: 'test@example.com',
            type: 'invalid_type',
            capacity: 100,
            address: {
              street: '123 St',
              city: 'NYC',
              state: 'NY',
              zipCode: '10001',
              country: 'US'
            }
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect([400, 422]).toContain(error.response.status);
      }
    });

    test('should reject venue with missing required fields', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/venues`,
          {
            name: 'Incomplete Venue',
            email: 'test@example.com'
            // Missing type, capacity, address
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect([400, 422]).toContain(error.response.status);
      }
    });
  });

  describe('GET /api/v1/venues', () => {
    test('should list all public venues', async () => {
      const response = await axios.get(`${BASE_URL}/api/v1/venues`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.pagination).toBeDefined();
    });

    test('should support pagination parameters', async () => {
      const response = await axios.get(`${BASE_URL}/api/v1/venues?limit=5&offset=0`);

      expect(response.status).toBe(200);
      expect(response.data.pagination.limit).toBe(5);
      expect(response.data.pagination.offset).toBe(0);
    });
  });

  describe('GET /api/v1/venues/user', () => {
    test('should list only authenticated user venues', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/user`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      // Should include the venue we created
      const userVenue = response.data.find((v: any) => v.id === venueId);
      expect(userVenue).toBeDefined();
    });

    test('should reject unauthenticated request', async () => {
      try {
        await axios.get(`${BASE_URL}/api/v1/venues/user`);
        fail('Should have thrown 401 error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });
  });

  describe('GET /api/v1/venues/:venueId', () => {
    test('should get venue by ID', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(venueId);
      expect(response.data.name).toBe(`Test Venue ${timestamp}`);
    });

    test('should reject access to venue without permission', async () => {
      try {
        await axios.get(
          `${BASE_URL}/api/v1/venues/${venueId}`,
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        fail('Should have thrown 403 error');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });

    test('should return 404 for non-existent venue', async () => {
      try {
        await axios.get(
          `${BASE_URL}/api/v1/venues/00000000-0000-0000-0000-000000000000`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });
  });

  describe('GET /api/v1/venues/:venueId/capacity', () => {
    test('should return venue capacity information', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/capacity`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.venueId).toBe(venueId);
      expect(response.data.totalCapacity).toBe(500);
      expect(response.data.available).toBeDefined();
    });
  });

  describe('GET /api/v1/venues/:venueId/stats', () => {
    test('should return venue statistics', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/stats`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.venue).toBeDefined();
      expect(response.data.stats).toBeDefined();
      expect(response.data.stats.totalEvents).toBeDefined();
    });
  });

  describe('PUT /api/v1/venues/:venueId', () => {
    test('should update venue and verify in database', async () => {
      const response = await axios.put(
        `${BASE_URL}/api/v1/venues/${venueId}`,
        {
          name: `Updated Venue ${timestamp}`,
          capacity: 600
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.name).toBe(`Updated Venue ${timestamp}`);
      expect(response.data.max_capacity).toBe(600);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM venues WHERE id = $1',
        [venueId]
      );

      expect(dbResult.rows[0].name).toBe(`Updated Venue ${timestamp}`);
      expect(dbResult.rows[0].max_capacity).toBe(600);
    });

    test('should reject update without permission', async () => {
      try {
        await axios.put(
          `${BASE_URL}/api/v1/venues/${venueId}`,
          { name: 'Hacked Name' },
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        fail('Should have thrown 403 error');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });
  });

  describe('GET /api/v1/venues/:venueId/check-access', () => {
    test('should confirm owner has access', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/check-access`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.hasAccess).toBe(true);
      expect(response.data.role).toBe('owner');
    });

    test('should deny access for non-staff user', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/check-access`,
        {
          headers: { Authorization: `Bearer ${secondAccessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.hasAccess).toBe(false);
    });
  });

  // ========================================
  // STAFF MANAGEMENT
  // ========================================

  describe('POST /api/v1/venues/:venueId/staff', () => {
    test('should add staff member to venue', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/venues/${venueId}/staff`,
        {
          userId: secondUserId,
          role: 'box_office',
          permissions: ['tickets:sell', 'tickets:view']
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.user_id).toBe(secondUserId);
      expect(response.data.role).toBe('box_office');

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM venue_staff WHERE venue_id = $1 AND user_id = $2',
        [venueId, secondUserId]
      );

      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].role).toBe('box_office');
    });

    test('should reject adding staff without permission', async () => {
      // Use third user who is not an owner
      const thirdEmail = `venue_test_${timestamp}_3@example.com`;
      const thirdAuth = await axios.post(`${AUTH_URL}/auth/register`, {
        email: thirdEmail,
        password: testPassword,
        firstName: 'Third',
        lastName: 'User'
      });

      try {
        await axios.post(
          `${BASE_URL}/api/v1/venues/${venueId}/staff`,
          {
            userId: thirdAuth.data.data.user.id,
            role: 'manager'
          },
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        fail('Should have thrown 403 error');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }

      // Cleanup
      await pool.query('DELETE FROM users WHERE email = $1', [thirdEmail]);
    });
  });

  describe('GET /api/v1/venues/:venueId/staff', () => {
    test('should list all venue staff', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/staff`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThanOrEqual(2); // Owner + added staff
    });
  });

  // ========================================
  // SETTINGS MANAGEMENT
  // ========================================

  describe('GET /api/v1/venues/:venueId/settings', () => {
    test('should return venue settings', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/settings`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.ticketing).toBeDefined();
      expect(response.data.ticketing.maxTicketsPerOrder).toBeDefined();
    });
  });

  describe('PUT /api/v1/venues/:venueId/settings', () => {
    test('should update settings and verify in database', async () => {
      const response = await axios.put(
        `${BASE_URL}/api/v1/venues/${venueId}/settings`,
        {
          ticketing: {
            maxTicketsPerOrder: 20
          }
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM venue_settings WHERE venue_id = $1',
        [venueId]
      );

      expect(dbResult.rows[0].max_tickets_per_order).toBe(20);
    });

    test('should reject settings update without manager role', async () => {
      try {
        await axios.put(
          `${BASE_URL}/api/v1/venues/${venueId}/settings`,
          { ticketing: { maxTicketsPerOrder: 50 } },
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        fail('Should have thrown 403 error');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });
  });

  // ========================================
  // INTEGRATIONS
  // ========================================

  describe('POST /api/v1/venues/:venueId/integrations', () => {
    test('should create integration and store in database', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/venues/${venueId}/integrations`,
        {
          type: 'stripe',
          config: {
            webhookUrl: 'https://example.com/webhook'
          },
          credentials: {
            apiKey: 'sk_test_123456',
            secretKey: 'secret_123'
          }
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.integration_type).toBe('stripe');
      expect(response.data.id).toBeDefined();

      integrationId = response.data.id;

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM venue_integrations WHERE id = $1',
        [integrationId]
      );

      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].integration_type).toBe('stripe');
      expect(dbResult.rows[0].is_active).toBe(true);
    });

    test('should reject duplicate integration type', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/venues/${venueId}/integrations`,
          {
            type: 'stripe', // Same type
            config: {},
            credentials: { apiKey: 'test' }
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown conflict error');
      } catch (error: any) {
        expect([409, 422]).toContain(error.response.status);
      }
    });
  });

  describe('GET /api/v1/venues/:venueId/integrations', () => {
    test('should list all integrations with masked credentials', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/integrations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      const integration = response.data.find((i: any) => i.id === integrationId);
      expect(integration).toBeDefined();
      expect(integration.config.apiKey).toBe('***'); // Should be masked
    });
  });

  describe('GET /api/v1/venues/:venueId/integrations/:integrationId', () => {
    test('should get specific integration', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/integrations/${integrationId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(integrationId);
      expect(response.data.integration_type).toBe('stripe');
    });
  });

  describe('PUT /api/v1/venues/:venueId/integrations/:integrationId', () => {
    test('should update integration', async () => {
      const response = await axios.put(
        `${BASE_URL}/api/v1/venues/${venueId}/integrations/${integrationId}`,
        {
          status: 'inactive'
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.is_active).toBe(false);
    });
  });

  describe('POST /api/v1/venues/:venueId/integrations/:integrationId/test', () => {
    test('should test integration connection', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/venues/${venueId}/integrations/${integrationId}/test`,
        {},
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBeDefined();
    });
  });

  describe('DELETE /api/v1/venues/:venueId/integrations/:integrationId', () => {
    test('should delete integration', async () => {
      const response = await axios.delete(
        `${BASE_URL}/api/v1/venues/${venueId}/integrations/${integrationId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(204);

      // Verify soft deleted in database (is_active = false)
      const dbResult = await pool.query(
        'SELECT * FROM venue_integrations WHERE id = $1',
        [integrationId]
      );

      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].is_active).toBe(false);
    });
  });

  // ========================================
  // DELETE VENUE (Must be last)
  // ========================================

  describe('DELETE /api/v1/venues/:venueId', () => {
    test('should reject deletion by non-owner', async () => {
      try {
        await axios.delete(
          `${BASE_URL}/api/v1/venues/${venueId}`,
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        fail('Should have thrown 403 error');
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });

    test('should soft delete venue (owner only)', async () => {
      const response = await axios.delete(
        `${BASE_URL}/api/v1/venues/${venueId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(204);

      // Verify soft delete in database
      const dbResult = await pool.query(
        'SELECT * FROM venues WHERE id = $1',
        [venueId]
      );

      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].deleted_at).not.toBeNull();
    });
  });
});
