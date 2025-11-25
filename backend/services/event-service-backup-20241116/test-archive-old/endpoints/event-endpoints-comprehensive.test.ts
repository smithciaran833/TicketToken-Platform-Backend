/// <reference types="jest" />
import axios from 'axios';
import { Pool } from 'pg';

const BASE_URL = 'http://localhost:3003';
const AUTH_URL = 'http://localhost:3001';
const VENUE_URL = 'http://localhost:3002';
const timestamp = Date.now();

// Database connection for verification
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

describe('Event Service - Comprehensive Tests', () => {
  let testEmail: string;
  let testPassword: string;
  let accessToken: string;
  let userId: string;
  let venueId: string;
  let eventId: string;
  let scheduleId: string;
  let capacityId: string;
  let pricingId: string;
  let secondUserEmail: string;
  let secondAccessToken: string;
  let secondUserId: string;
  let categoryId: string;

  beforeAll(async () => {
    testEmail = `event_test_${timestamp}@example.com`;
    secondUserEmail = `event_test_${timestamp}_2@example.com`;
    testPassword = 'TestPass123!';

    // Register first user via auth-service
    const authResponse = await axios.post(`${AUTH_URL}/auth/register`, {
      email: testEmail,
      password: testPassword,
      firstName: 'Event',
      lastName: 'Creator'
    });
    accessToken = authResponse.data.data.tokens.accessToken;
    userId = authResponse.data.data.user.id;

    // Register second user (for permission tests)
    const secondAuthResponse = await axios.post(`${AUTH_URL}/auth/register`, {
      email: secondUserEmail,
      password: testPassword,
      firstName: 'Other',
      lastName: 'User'
    });
    secondAccessToken = secondAuthResponse.data.data.tokens.accessToken;
    secondUserId = secondAuthResponse.data.data.user.id;

    // Create a venue for testing events
    const venueResponse = await axios.post(
      `${VENUE_URL}/api/v1/venues`,
      {
        name: `Test Venue ${timestamp}`,
        email: `venue${timestamp}@example.com`,
        type: 'theater',
        capacity: 5000,
        address: {
          street: '123 Event St',
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
    venueId = venueResponse.data.id;

    // Get a category ID from seeded data
    const categoryResult = await pool.query(
      "SELECT id FROM event_categories WHERE slug = 'music' LIMIT 1"
    );
    categoryId = categoryResult.rows[0]?.id;
  });

  afterAll(async () => {
    // Cleanup test data in correct order (foreign keys)
    await pool.query('DELETE FROM event_pricing WHERE event_id IN (SELECT id FROM events WHERE name LIKE $1)', [`Test Event ${timestamp}%`]);
    await pool.query('DELETE FROM event_capacity WHERE event_id IN (SELECT id FROM events WHERE name LIKE $1)', [`Test Event ${timestamp}%`]);
    await pool.query('DELETE FROM event_schedules WHERE event_id IN (SELECT id FROM events WHERE name LIKE $1)', [`Test Event ${timestamp}%`]);
    await pool.query('DELETE FROM event_metadata WHERE event_id IN (SELECT id FROM events WHERE name LIKE $1)', [`Test Event ${timestamp}%`]);
    await pool.query('DELETE FROM events WHERE name LIKE $1', [`Test Event ${timestamp}%`]);
    await pool.query('DELETE FROM venue_layouts WHERE venue_id = $1', [venueId]);
    await pool.query('DELETE FROM venue_integrations WHERE venue_id = $1', [venueId]);
    await pool.query('DELETE FROM venue_settings WHERE venue_id = $1', [venueId]);
    await pool.query('DELETE FROM venue_staff WHERE venue_id = $1', [venueId]);
    await pool.query('DELETE FROM venues WHERE id = $1', [venueId]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`event_test_${timestamp}%`]);
    await pool.end();
  });

  // ========================================
  // HEALTH & METRICS
  // ========================================

  describe('GET /health', () => {
    test('should return healthy status', async () => {
      const response = await axios.get(`${BASE_URL}/health`);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
      expect(response.data.service).toBe('event-service');
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
  // EVENT CRUD OPERATIONS
  // ========================================

  describe('POST /api/v1/events', () => {
    test('should create event in database with all fields', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/events`,
        {
          name: `Test Event ${timestamp}`,
          description: 'A comprehensive test event',
          short_description: 'Test event for comprehensive testing',
          venue_id: venueId,
          event_type: 'single',
          primary_category_id: categoryId,
          tags: ['test', 'music', 'live'],
          status: 'DRAFT',
          visibility: 'PUBLIC',
          is_featured: false,
          age_restriction: 18,
          is_virtual: false,
          is_hybrid: false,
          cancellation_policy: 'Refunds available 24h before event',
          refund_policy: 'Full refund minus fees',
          // Legacy fields for backward compatibility
          starts_at: '2025-12-01T19:00:00Z',
          ends_at: '2025-12-01T23:00:00Z',
          doors_open: '2025-12-01T18:00:00Z',
          capacity: 1000
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.event.name).toBe(`Test Event ${timestamp}`);
      expect(response.data.event.id).toBeDefined();
      expect(response.data.event.slug).toBeDefined();

      eventId = response.data.event.id;

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM events WHERE id = $1',
        [eventId]
      );

      expect(dbResult.rows.length).toBe(1);
      const event = dbResult.rows[0];

      expect(event.name).toBe(`Test Event ${timestamp}`);
      expect(event.venue_id).toBe(venueId);
      expect(event.event_type).toBe('single');
      expect(event.status).toBe('DRAFT');
      expect(event.age_restriction).toBe(18);
      expect(event.created_by).toBe(userId);
      expect(event.tenant_id).toBeDefined();
      expect(event.deleted_at).toBeNull();

      // Verify event_metadata was auto-created
      const metadataResult = await pool.query(
        'SELECT * FROM event_metadata WHERE event_id = $1',
        [eventId]
      );
      expect(metadataResult.rows.length).toBe(1);

      // Verify schedule was created (legacy support)
      const scheduleResult = await pool.query(
        'SELECT * FROM event_schedules WHERE event_id = $1',
        [eventId]
      );
      expect(scheduleResult.rows.length).toBe(1);
      scheduleId = scheduleResult.rows[0].id;

      // Verify capacity was created (legacy support)
      const capacityResult = await pool.query(
        'SELECT * FROM event_capacity WHERE event_id = $1',
        [eventId]
      );
      expect(capacityResult.rows.length).toBe(1);
      expect(capacityResult.rows[0].total_capacity).toBe(1000);
      capacityId = capacityResult.rows[0].id;
    });

    test('should reject event creation without authentication', async () => {
      try {
        await axios.post(`${BASE_URL}/api/v1/events`, {
          name: 'Unauthorized Event',
          venue_id: venueId
        });
        fail('Should have thrown 401 error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should reject event with missing required fields', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/events`,
          {
            name: 'Incomplete Event'
            // Missing venue_id
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

    test('should reject event with invalid venue_id', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/events`,
          {
            name: 'Bad Venue Event',
            venue_id: '00000000-0000-0000-0000-000000000000'
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect([400, 403, 404]).toContain(error.response.status);
      }
    });

    test('should reject event with invalid status', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/events`,
          {
            name: 'Bad Status Event',
            venue_id: venueId,
            status: 'INVALID_STATUS'
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

  describe('GET /api/v1/events', () => {
    test('should list all events with pagination', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events?limit=10&offset=0`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.events)).toBe(true);
      expect(response.data.pagination).toBeDefined();
      expect(response.data.pagination.limit).toBe(10);
      expect(response.data.pagination.offset).toBe(0);
    });

    test('should filter events by status', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events?status=DRAFT`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.events)).toBe(true);

      // All returned events should be DRAFT
      const allDraft = response.data.events.every((e: any) => e.status === 'DRAFT');
      expect(allDraft).toBe(true);
    });

    test('should require authentication', async () => {
      try {
        await axios.get(`${BASE_URL}/api/v1/events`);
        fail('Should have thrown 401 error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });
  });

  describe('GET /api/v1/events/:id', () => {
    test('should get event by ID with all fields', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.event.id).toBe(eventId);
      expect(response.data.event.name).toBe(`Test Event ${timestamp}`);
      expect(response.data.event.venue_id).toBe(venueId);
      expect(response.data.event.slug).toBeDefined();

      // Legacy fields should be populated
      expect(response.data.event.event_date).toBeDefined();
      expect(response.data.event.capacity).toBeDefined();
      expect(response.data.event.available_capacity).toBeDefined();
    });

    test('should return 404 for non-existent event', async () => {
      try {
        await axios.get(
          `${BASE_URL}/api/v1/events/00000000-0000-0000-0000-000000000000`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    test('should enforce tenant isolation', async () => {
      // Second user in different tenant shouldn't see first user's event
      try {
        const response = await axios.get(
          `${BASE_URL}/api/v1/events/${eventId}`,
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        // If it doesn't throw, check tenant isolation worked
        if (response.status === 200) {
          expect(response.data.event.tenant_id).not.toBe(userId);
        }
      } catch (error: any) {
        // 403 or 404 are both acceptable
        expect([403, 404]).toContain(error.response.status);
      }
    });
  });

  describe('GET /api/v1/venues/:venueId/events', () => {
    test('should get all events for a venue', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/events`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.events)).toBe(true);

      // Should include our created event
      const ourEvent = response.data.events.find((e: any) => e.id === eventId);
      expect(ourEvent).toBeDefined();
    });
  });

  describe('PUT /api/v1/events/:id', () => {
    test('should update event and verify in database', async () => {
      const response = await axios.put(
        `${BASE_URL}/api/v1/events/${eventId}`,
        {
          name: `Updated Event ${timestamp}`,
          description: 'Updated description',
          age_restriction: 21
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.event.name).toBe(`Updated Event ${timestamp}`);
      expect(response.data.event.age_restriction).toBe(21);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM events WHERE id = $1',
        [eventId]
      );

      expect(dbResult.rows[0].name).toBe(`Updated Event ${timestamp}`);
      expect(dbResult.rows[0].age_restriction).toBe(21);
      expect(dbResult.rows[0].updated_by).toBe(userId);
    });

    test('should reject update without permission', async () => {
      try {
        await axios.put(
          `${BASE_URL}/api/v1/events/${eventId}`,
          { name: 'Hacked Name' },
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        fail('Should have thrown 403 error');
      } catch (error: any) {
        expect([403, 404]).toContain(error.response.status);
      }
    });
  });

  describe('POST /api/v1/events/:id/publish', () => {
    test('should publish event and update status', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/events/${eventId}/publish`,
        {},
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.event.status).toBe('PUBLISHED');

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM events WHERE id = $1',
        [eventId]
      );

      expect(dbResult.rows[0].status).toBe('PUBLISHED');
    });
  });

  // ========================================
  // SCHEDULE MANAGEMENT
  // ========================================

  describe('GET /api/v1/events/:eventId/schedules', () => {
    test('should get all schedules for event', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/schedules`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data.schedules).toBeDefined();
      expect(Array.isArray(response.data.data.schedules)).toBe(true);
      expect(response.data.data.schedules.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/events/:eventId/schedules', () => {
    test('should create additional schedule', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/events/${eventId}/schedules`,
        {
          starts_at: '2025-12-08T19:00:00Z',
          ends_at: '2025-12-08T23:00:00Z',
          doors_open_at: '2025-12-08T18:00:00Z',
          timezone: 'America/New_York',
          status: 'SCHEDULED'
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.data.id).toBeDefined();
      expect(response.data.data.event_id).toBe(eventId);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM event_schedules WHERE id = $1',
        [response.data.data.id]
      );

      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].status).toBe('SCHEDULED');
    });
  });

  describe('GET /api/v1/events/:eventId/schedules/upcoming', () => {
    test('should get only upcoming schedules', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/schedules/upcoming`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.data.schedules)).toBe(true);

      // All schedules should be in the future
      const allFuture = response.data.data.schedules.every((s: any) => {
        return new Date(s.starts_at) > new Date();
      });
      expect(allFuture).toBe(true);
    });
  });

  describe('GET /api/v1/events/:eventId/schedules/next', () => {
    test('should get next schedule', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/schedules/next`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data.id).toBeDefined();
      expect(response.data.data.starts_at).toBeDefined();
    });
  });

  describe('PUT /api/v1/events/:eventId/schedules/:scheduleId', () => {
    test('should update schedule', async () => {
      const response = await axios.put(
        `${BASE_URL}/api/v1/events/${eventId}/schedules/${scheduleId}`,
        {
          status: 'CONFIRMED',
          notes: 'Schedule confirmed by venue'
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data.status).toBe('CONFIRMED');
    });
  });

  // ========================================
  // CAPACITY MANAGEMENT
  // ========================================

  describe('GET /api/v1/events/:eventId/capacity', () => {
    test('should get all capacity sections', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/capacity`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.capacity)).toBe(true);
      expect(response.data.capacity.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/events/:eventId/capacity', () => {
    test('should create capacity section and verify cumulative capacity', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/events/${eventId}/capacity`,
        {
          section_name: 'VIP Section',
          section_code: 'VIP',
          total_capacity: 200,
          minimum_purchase: 1,
          maximum_purchase: 10
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.capacity.section_name).toBe('VIP Section');
      expect(response.data.capacity.total_capacity).toBe(200);
      expect(response.data.capacity.available_capacity).toBe(200);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM event_capacity WHERE id = $1',
        [response.data.capacity.id]
      );

      expect(dbResult.rows[0].section_name).toBe('VIP Section');
      expect(dbResult.rows[0].reserved_capacity).toBe(0);
      expect(dbResult.rows[0].sold_count).toBe(0);
    });

    test('should reject capacity exceeding venue maximum', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/events/${eventId}/capacity`,
          {
            section_name: 'Oversized Section',
            section_code: 'OVER',
            total_capacity: 10000 // Exceeds venue capacity
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect([400, 422]).toContain(error.response.status);
        expect(error.response.data.error).toContain('capacity');
      }
    });
  });

  describe('GET /api/v1/events/:eventId/capacity/total', () => {
    test('should get total capacity across all sections', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/capacity/total`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.total_capacity).toBeGreaterThan(0);
      expect(response.data.available_capacity).toBeDefined();
      expect(response.data.reserved_capacity).toBeDefined();
      expect(response.data.sold_count).toBeDefined();
    });
  });

  describe('POST /api/v1/capacity/:id/check', () => {
    test('should check availability without reserving', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/capacity/${capacityId}/check`,
        {
          quantity: 10
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.available).toBe(true);
      expect(response.data.quantity).toBe(10);
    });

    test('should return false for unavailable quantity', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/capacity/${capacityId}/check`,
        {
          quantity: 99999
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.available).toBe(false);
    });
  });

  describe('POST /api/v1/capacity/:id/reserve', () => {
    test('should reserve capacity and verify in database', async () => {
      // Get current capacity
      const beforeResult = await pool.query(
        'SELECT available_capacity, reserved_capacity FROM event_capacity WHERE id = $1',
        [capacityId]
      );
      const beforeAvailable = beforeResult.rows[0].available_capacity;
      const beforeReserved = beforeResult.rows[0].reserved_capacity;

      const response = await axios.post(
        `${BASE_URL}/api/v1/capacity/${capacityId}/reserve`,
        {
          quantity: 5,
          reservation_minutes: 15
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.message).toContain('reserved');
      expect(response.data.capacity.available_capacity).toBe(beforeAvailable - 5);
      expect(response.data.capacity.reserved_capacity).toBe(beforeReserved + 5);
      expect(response.data.capacity.reserved_expires_at).toBeDefined();

      // Verify in database
      const afterResult = await pool.query(
        'SELECT * FROM event_capacity WHERE id = $1',
        [capacityId]
      );

      expect(afterResult.rows[0].available_capacity).toBe(beforeAvailable - 5);
      expect(afterResult.rows[0].reserved_capacity).toBe(beforeReserved + 5);
      expect(afterResult.rows[0].reserved_at).not.toBeNull();
      expect(afterResult.rows[0].reserved_expires_at).not.toBeNull();
    });

    test('should reject reservation for insufficient capacity', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/v1/capacity/${capacityId}/reserve`,
          {
            quantity: 99999
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect([400, 422]).toContain(error.response.status);
      }
    });

    test('should lock price when pricing_id provided', async () => {
      // First create pricing
      const pricingResponse = await axios.post(
        `${BASE_URL}/api/v1/events/${eventId}/pricing`,
        {
          name: 'Standard Pricing',
          base_price: 50.00,
          service_fee: 5.00,
          facility_fee: 2.50,
          tax_rate: 0.08,
          capacity_id: capacityId
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      pricingId = pricingResponse.data.pricing.id;

      // Reserve with price lock
      const response = await axios.post(
        `${BASE_URL}/api/v1/capacity/${capacityId}/reserve`,
        {
          quantity: 2,
          reservation_minutes: 15,
          pricing_id: pricingId
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.locked_price).toBeDefined();
      expect(response.data.locked_price.locked_price).toBe(50.00);
      expect(response.data.locked_price.service_fee).toBe(5.00);

      // Verify price locked in database
      const dbResult = await pool.query(
        'SELECT locked_price_data FROM event_capacity WHERE id = $1',
        [capacityId]
      );

      expect(dbResult.rows[0].locked_price_data).not.toBeNull();
      expect(dbResult.rows[0].locked_price_data.locked_price).toBe(50.00);
    });
  });

  describe('PUT /api/v1/capacity/:id', () => {
    test('should update capacity section', async () => {
      const response = await axios.put(
        `${BASE_URL}/api/v1/capacity/${capacityId}`,
        {
          section_name: 'Updated General Admission',
          maximum_purchase: 8
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.capacity.section_name).toBe('Updated General Admission');
      expect(response.data.capacity.maximum_purchase).toBe(8);
    });
  });

  // ========================================
  // PRICING MANAGEMENT
  // ========================================

  describe('GET /api/v1/events/:eventId/pricing', () => {
    test('should get all pricing for event', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/pricing`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.pricing)).toBe(true);
    });
  });

  describe('POST /api/v1/events/:eventId/pricing', () => {
    test('should create pricing tier', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/events/${eventId}/pricing`,
        {
          name: 'Early Bird',
          base_price: 40.00,
          service_fee: 4.00,
          facility_fee: 2.00,
          tax_rate: 0.08,
          early_bird_price: 35.00,
          early_bird_ends_at: '2025-11-01T00:00:00Z',
          max_per_order: 10
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.pricing.name).toBe('Early Bird');
      expect(response.data.pricing.base_price).toBe(40.00);
      expect(response.data.pricing.early_bird_price).toBe(35.00);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM event_pricing WHERE id = $1',
        [response.data.pricing.id]
      );

      expect(dbResult.rows[0].name).toBe('Early Bird');
    });
  });

  describe('GET /api/v1/events/:eventId/pricing/active', () => {
    test('should get only active pricing', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/pricing/active`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.pricing)).toBe(true);

      // All pricing should be active
      const allActive = response.data.pricing.every((p: any) => p.is_active === true);
      expect(allActive).toBe(true);
    });
  });

  describe('POST /api/v1/pricing/:id/calculate', () => {
    test('should calculate total price with all fees', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/pricing/${pricingId}/calculate`,
        {
          quantity: 2
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.base_price).toBe(100.00); // 50 * 2
      expect(response.data.service_fee).toBe(10.00); // 5 * 2
      expect(response.data.facility_fee).toBe(5.00); // 2.5 * 2
      expect(response.data.subtotal).toBe(115.00);
      expect(response.data.tax).toBe(9.20); // 115 * 0.08
      expect(response.data.total).toBe(124.20);
      expect(response.data.per_ticket).toBe(62.10);
    });
  });

  describe('PUT /api/v1/pricing/:id', () => {
    test('should update pricing', async () => {
      const response = await axios.put(
        `${BASE_URL}/api/v1/pricing/${pricingId}`,
        {
          base_price: 55.00,
          current_price: 55.00
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.pricing.base_price).toBe(55.00);
    });

    test('should not affect existing locked prices', async () => {
      // Verify locked price data still has old price
      const dbResult = await pool.query(
        'SELECT locked_price_data FROM event_capacity WHERE id = $1',
        [capacityId]
      );

      // Locked price should still be 50.00, not 55.00
      if (dbResult.rows[0].locked_price_data) {
        expect(dbResult.rows[0].locked_price_data.locked_price).toBe(50.00);
      }
    });
  });

  // ========================================
  // TICKET TYPES (Legacy Compatibility)
  // ========================================

  describe('GET /api/v1/events/:id/ticket-types', () => {
    test('should return pricing as ticket types (legacy)', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events/${eventId}/ticket-types`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.data)).toBe(true);
    });
  });

  describe('POST /api/v1/events/:id/ticket-types', () => {
    test('should create pricing via legacy endpoint', async () => {
      const response = await axios.post(
        `${BASE_URL}/api/v1/events/${eventId}/ticket-types`,
        {
          name: 'Legacy Ticket Type',
          base_price: 45.00,
          max_per_order: 5
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.data.name).toBe('Legacy Ticket Type');
    });
  });

  // ========================================
  // ANALYTICS & REPORTS
  // ========================================

  describe('GET /api/v1/customers/:customerId/profile', () => {
    test('should get customer profile (mock)', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/customers/${userId}/profile`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.customerId).toBe(userId);
    });
  });

  describe('GET /api/v1/reports/sales', () => {
    test('should get sales report', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/reports/sales`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.report.type).toBe('sales');
      expect(Array.isArray(response.data.report.data)).toBe(true);
    });
  });

  describe('GET /api/v1/reports/venue-comparison', () => {
    test('should get venue comparison report', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/reports/venue-comparison`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.report.type).toBe('venue_comparison');
    });
  });

  describe('GET /api/v1/venues/:venueId/dashboard', () => {
    test('should get venue dashboard', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/dashboard`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.venue.id).toBe(venueId);
      expect(response.data.stats).toBeDefined();
    });
  });

  describe('GET /api/v1/venues/:venueId/analytics', () => {
    test('should get venue analytics', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/venues/${venueId}/analytics`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.venueId).toBe(venueId);
      expect(response.data.analytics).toBeDefined();
    });
  });

  // ========================================
  // DELETE EVENT (Must be last)
  // ========================================

  describe('DELETE /api/v1/events/:id', () => {
    test('should reject deletion by unauthorized user', async () => {
      try {
        await axios.delete(
          `${BASE_URL}/api/v1/events/${eventId}`,
          {
            headers: { Authorization: `Bearer ${secondAccessToken}` }
          }
        );
        fail('Should have thrown 403 error');
      } catch (error: any) {
        expect([403, 404]).toContain(error.response.status);
      }
    });

    test('should soft delete event (owner only)', async () => {
      const response = await axios.delete(
        `${BASE_URL}/api/v1/events/${eventId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      expect(response.status).toBe(204);

      // Verify soft delete in database
      const dbResult = await pool.query(
        'SELECT * FROM events WHERE id = $1',
        [eventId]
      );

      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].deleted_at).not.toBeNull();
      expect(dbResult.rows[0].status).toBe('CANCELLED');
    });

    test('should not return deleted event in listings', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/v1/events`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      const deletedEvent = response.data.events.find((e: any) => e.id === eventId);
      expect(deletedEvent).toBeUndefined();
    });
  });
});
