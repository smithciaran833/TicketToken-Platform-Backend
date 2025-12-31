/**
 * End-to-End Tests for Event Service
 * 
 * CRITICAL FIX for audit findings (10-testing.md):
 * - Tests event CRUD operations through full API
 * - Tests state transitions
 * - Tests capacity management
 * - Tests tenant isolation
 */

import request from 'supertest';
import { v4 as uuid } from 'uuid';
import { FastifyInstance } from 'fastify';

// Test configuration
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3003';
const API_PREFIX = '/api/v1';

// Test fixtures
const testTenant = uuid();
const testUser = uuid();

// Mock auth token (in real E2E tests, obtain from auth service)
function getAuthHeaders() {
  // This would be a real JWT in production E2E tests
  return {
    'Authorization': `Bearer ${process.env.E2E_TEST_TOKEN || 'test-token'}`,
    'X-Tenant-ID': testTenant,
    'Content-Type': 'application/json',
  };
}

describe('Event Service E2E Tests', () => {
  let createdEventId: string;

  describe('Health Checks', () => {
    it('GET /health/live - should return 200', async () => {
      const response = await request(BASE_URL)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('GET /health/ready - should return 200 when ready', async () => {
      const response = await request(BASE_URL)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
    });

    it('GET /health - should return comprehensive health', async () => {
      const response = await request(BASE_URL)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service', 'event-service');
      expect(response.body).toHaveProperty('checks');
    });

    it('GET /metrics - should return Prometheus metrics', async () => {
      const response = await request(BASE_URL)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
    });
  });

  describe('Event CRUD Operations', () => {
    const eventData = {
      name: 'E2E Test Concert',
      description: 'A test concert event for E2E testing',
      event_type: 'CONCERT',
      venue_id: uuid(),
      artist_name: 'Test Artist',
      schedule: {
        starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(), // 3 hours later
        timezone: 'America/New_York',
      },
    };

    describe('POST /api/v1/events - Create Event', () => {
      it('should create a new event successfully', async () => {
        const response = await request(BASE_URL)
          .post(`${API_PREFIX}/events`)
          .set(getAuthHeaders())
          .send(eventData)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('name', eventData.name);
        expect(response.body).toHaveProperty('status', 'DRAFT');
        expect(response.body).toHaveProperty('tenant_id', testTenant);

        createdEventId = response.body.id;
      });

      it('should reject event without authentication', async () => {
        await request(BASE_URL)
          .post(`${API_PREFIX}/events`)
          .send(eventData)
          .expect(401);
      });

      it('should reject event with invalid data', async () => {
        const invalidData = {
          name: '', // Empty name
          event_type: 'INVALID_TYPE',
        };

        await request(BASE_URL)
          .post(`${API_PREFIX}/events`)
          .set(getAuthHeaders())
          .send(invalidData)
          .expect(400);
      });

      it('should reject event too far in the future (>365 days)', async () => {
        const tooFarData = {
          ...eventData,
          schedule: {
            starts_at: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
            ends_at: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          },
        };

        await request(BASE_URL)
          .post(`${API_PREFIX}/events`)
          .set(getAuthHeaders())
          .send(tooFarData)
          .expect(400);
      });
    });

    describe('GET /api/v1/events/:id - Get Event', () => {
      it('should retrieve created event', async () => {
        const response = await request(BASE_URL)
          .get(`${API_PREFIX}/events/${createdEventId}`)
          .set(getAuthHeaders())
          .expect(200);

        expect(response.body).toHaveProperty('id', createdEventId);
        expect(response.body).toHaveProperty('name', eventData.name);
      });

      it('should return 404 for non-existent event', async () => {
        const fakeId = uuid();
        await request(BASE_URL)
          .get(`${API_PREFIX}/events/${fakeId}`)
          .set(getAuthHeaders())
          .expect(404);
      });

      it('should return 400 for invalid UUID', async () => {
        await request(BASE_URL)
          .get(`${API_PREFIX}/events/invalid-uuid`)
          .set(getAuthHeaders())
          .expect(400);
      });
    });

    describe('PUT /api/v1/events/:id - Update Event', () => {
      it('should update event successfully', async () => {
        const updateData = {
          name: 'Updated E2E Test Concert',
          description: 'Updated description',
        };

        const response = await request(BASE_URL)
          .put(`${API_PREFIX}/events/${createdEventId}`)
          .set(getAuthHeaders())
          .send(updateData)
          .expect(200);

        expect(response.body).toHaveProperty('name', updateData.name);
        expect(response.body).toHaveProperty('description', updateData.description);
      });

      it('should reject update for non-existent event', async () => {
        const fakeId = uuid();
        await request(BASE_URL)
          .put(`${API_PREFIX}/events/${fakeId}`)
          .set(getAuthHeaders())
          .send({ name: 'Test' })
          .expect(404);
      });
    });

    describe('GET /api/v1/events - List Events', () => {
      it('should list events for tenant', async () => {
        const response = await request(BASE_URL)
          .get(`${API_PREFIX}/events`)
          .set(getAuthHeaders())
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body).toHaveProperty('pagination');
      });

      it('should support pagination', async () => {
        const response = await request(BASE_URL)
          .get(`${API_PREFIX}/events?page=1&limit=10`)
          .set(getAuthHeaders())
          .expect(200);

        expect(response.body.pagination).toHaveProperty('page', 1);
        expect(response.body.pagination).toHaveProperty('limit', 10);
      });

      it('should support status filtering', async () => {
        const response = await request(BASE_URL)
          .get(`${API_PREFIX}/events?status=DRAFT`)
          .set(getAuthHeaders())
          .expect(200);

        if (response.body.data.length > 0) {
          response.body.data.forEach((event: any) => {
            expect(event.status).toBe('DRAFT');
          });
        }
      });
    });
  });

  describe('Event State Transitions', () => {
    let stateTestEventId: string;

    beforeAll(async () => {
      // Create an event for state transition tests
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/events`)
        .set(getAuthHeaders())
        .send({
          name: 'State Transition Test Event',
          description: 'Event for testing state transitions',
          event_type: 'CONCERT',
          venue_id: uuid(),
          schedule: {
            starts_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          },
        });

      stateTestEventId = response.body.id;
    });

    it('should start in DRAFT state', async () => {
      const response = await request(BASE_URL)
        .get(`${API_PREFIX}/events/${stateTestEventId}`)
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body.status).toBe('DRAFT');
    });

    it('should transition from DRAFT to PUBLISHED', async () => {
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/events/${stateTestEventId}/publish`)
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body.status).toBe('PUBLISHED');
    });

    it('should transition from PUBLISHED to ON_SALE', async () => {
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/events/${stateTestEventId}/start-sales`)
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body.status).toBe('ON_SALE');
    });

    it('should transition from ON_SALE to SALES_PAUSED', async () => {
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/events/${stateTestEventId}/pause-sales`)
        .set(getAuthHeaders())
        .expect(200);

      expect(response.body.status).toBe('SALES_PAUSED');
    });

    it('should not allow invalid transitions', async () => {
      // Try to go from SALES_PAUSED directly to COMPLETED
      await request(BASE_URL)
        .post(`${API_PREFIX}/events/${stateTestEventId}/complete`)
        .set(getAuthHeaders())
        .expect(400);
    });

    it('should transition to CANCELLED', async () => {
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/events/${stateTestEventId}/cancel`)
        .set(getAuthHeaders())
        .send({ reason: 'E2E test cancellation' })
        .expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });

    it('should not allow transitions from CANCELLED', async () => {
      await request(BASE_URL)
        .post(`${API_PREFIX}/events/${stateTestEventId}/publish`)
        .set(getAuthHeaders())
        .expect(400);
    });
  });

  describe('Capacity Management', () => {
    let capacityEventId: string;

    beforeAll(async () => {
      // Create an event for capacity tests
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/events`)
        .set(getAuthHeaders())
        .send({
          name: 'Capacity Test Event',
          description: 'Event for testing capacity management',
          event_type: 'CONCERT',
          venue_id: uuid(),
          schedule: {
            starts_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          },
        });

      capacityEventId = response.body.id;
    });

    describe('POST /api/v1/events/:id/capacity - Add Capacity Tier', () => {
      it('should add a capacity tier', async () => {
        const tierData = {
          tier_name: 'General Admission',
          total_capacity: 100,
          price_cents: 5000,
          currency: 'USD',
        };

        const response = await request(BASE_URL)
          .post(`${API_PREFIX}/events/${capacityEventId}/capacity`)
          .set(getAuthHeaders())
          .send(tierData)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('tier_name', tierData.tier_name);
        expect(response.body).toHaveProperty('total_capacity', tierData.total_capacity);
        expect(response.body).toHaveProperty('available_capacity', tierData.total_capacity);
      });

      it('should add multiple capacity tiers', async () => {
        const vipTier = {
          tier_name: 'VIP',
          total_capacity: 20,
          price_cents: 15000,
          currency: 'USD',
        };

        await request(BASE_URL)
          .post(`${API_PREFIX}/events/${capacityEventId}/capacity`)
          .set(getAuthHeaders())
          .send(vipTier)
          .expect(201);
      });

      it('should reject invalid capacity', async () => {
        const invalidTier = {
          tier_name: 'Invalid',
          total_capacity: -10, // Invalid
          price_cents: 5000,
        };

        await request(BASE_URL)
          .post(`${API_PREFIX}/events/${capacityEventId}/capacity`)
          .set(getAuthHeaders())
          .send(invalidTier)
          .expect(400);
      });
    });

    describe('GET /api/v1/events/:id/capacity - Get Capacity', () => {
      it('should retrieve all capacity tiers', async () => {
        const response = await request(BASE_URL)
          .get(`${API_PREFIX}/events/${capacityEventId}/capacity`)
          .set(getAuthHeaders())
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('PUT /api/v1/events/:id/capacity/:tierId - Update Capacity', () => {
      it('should update capacity tier', async () => {
        // First get the tiers
        const tiersResponse = await request(BASE_URL)
          .get(`${API_PREFIX}/events/${capacityEventId}/capacity`)
          .set(getAuthHeaders());

        const tierId = tiersResponse.body[0].id;

        const response = await request(BASE_URL)
          .put(`${API_PREFIX}/events/${capacityEventId}/capacity/${tierId}`)
          .set(getAuthHeaders())
          .send({ total_capacity: 150 })
          .expect(200);

        expect(response.body.total_capacity).toBe(150);
      });
    });
  });

  describe('Pricing Management', () => {
    let pricingEventId: string;

    beforeAll(async () => {
      const response = await request(BASE_URL)
        .post(`${API_PREFIX}/events`)
        .set(getAuthHeaders())
        .send({
          name: 'Pricing Test Event',
          description: 'Event for testing pricing',
          event_type: 'CONCERT',
          venue_id: uuid(),
          schedule: {
            starts_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
            ends_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          },
        });

      pricingEventId = response.body.id;
    });

    describe('POST /api/v1/events/:id/pricing - Add Pricing', () => {
      it('should add pricing tier', async () => {
        const pricingData = {
          tier_name: 'Early Bird',
          base_price_cents: 4000,
          currency: 'USD',
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const response = await request(BASE_URL)
          .post(`${API_PREFIX}/events/${pricingEventId}/pricing`)
          .set(getAuthHeaders())
          .send(pricingData)
          .expect(201);

        expect(response.body).toHaveProperty('tier_name', pricingData.tier_name);
        expect(response.body).toHaveProperty('base_price_cents', pricingData.base_price_cents);
      });

      it('should reject overlapping pricing windows', async () => {
        const overlappingPricing = {
          tier_name: 'Early Bird', // Same tier name
          base_price_cents: 3500,
          currency: 'USD',
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        };

        await request(BASE_URL)
          .post(`${API_PREFIX}/events/${pricingEventId}/pricing`)
          .set(getAuthHeaders())
          .send(overlappingPricing)
          .expect(400);
      });
    });
  });

  describe('Tenant Isolation', () => {
    const otherTenant = uuid();

    it('should not access events from other tenants', async () => {
      // Create event with test tenant
      const createResponse = await request(BASE_URL)
        .post(`${API_PREFIX}/events`)
        .set(getAuthHeaders())
        .send({
          name: 'Tenant Isolation Test',
          event_type: 'CONCERT',
          venue_id: uuid(),
          schedule: {
            starts_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            ends_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          },
        });

      const eventId = createResponse.body.id;

      // Try to access with different tenant
      const otherTenantHeaders = {
        ...getAuthHeaders(),
        'X-Tenant-ID': otherTenant,
      };

      await request(BASE_URL)
        .get(`${API_PREFIX}/events/${eventId}`)
        .set(otherTenantHeaders)
        .expect(404);
    });

    it('should not update events from other tenants', async () => {
      if (createdEventId) {
        const otherTenantHeaders = {
          ...getAuthHeaders(),
          'X-Tenant-ID': otherTenant,
        };

        await request(BASE_URL)
          .put(`${API_PREFIX}/events/${createdEventId}`)
          .set(otherTenantHeaders)
          .send({ name: 'Hacked Name' })
          .expect(404);
      }
    });
  });

  describe('DELETE /api/v1/events/:id - Delete Event', () => {
    it('should soft delete event', async () => {
      if (createdEventId) {
        await request(BASE_URL)
          .delete(`${API_PREFIX}/events/${createdEventId}`)
          .set(getAuthHeaders())
          .expect(200);

        // Verify event is no longer retrievable
        await request(BASE_URL)
          .get(`${API_PREFIX}/events/${createdEventId}`)
          .set(getAuthHeaders())
          .expect(404);
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on excessive requests', async () => {
      const requests = [];
      
      // Send 150 requests quickly (default limit is 100/min)
      for (let i = 0; i < 150; i++) {
        requests.push(
          request(BASE_URL)
            .get(`${API_PREFIX}/events`)
            .set(getAuthHeaders())
        );
      }

      const results = await Promise.all(requests);
      const rateLimited = results.filter(r => r.status === 429);

      // Some requests should be rate limited
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 30000); // 30 second timeout
  });

  describe('Idempotency', () => {
    it('should return same response for same idempotency key', async () => {
      const idempotencyKey = uuid();
      const eventData = {
        name: 'Idempotency Test Event',
        event_type: 'CONCERT',
        venue_id: uuid(),
        schedule: {
          starts_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
        },
      };

      // First request
      const response1 = await request(BASE_URL)
        .post(`${API_PREFIX}/events`)
        .set({
          ...getAuthHeaders(),
          'Idempotency-Key': idempotencyKey,
        })
        .send(eventData)
        .expect(201);

      // Second request with same key
      const response2 = await request(BASE_URL)
        .post(`${API_PREFIX}/events`)
        .set({
          ...getAuthHeaders(),
          'Idempotency-Key': idempotencyKey,
        })
        .send(eventData)
        .expect(201);

      // Should get same response
      expect(response1.body.id).toBe(response2.body.id);
      expect(response2.headers['idempotency-replayed']).toBe('true');
    });
  });
});
