/**
 * E2E Tests for Venue Service (MT1)
 * 
 * These tests verify end-to-end functionality of the venue service
 * by making actual HTTP requests to a running instance.
 * 
 * Prerequisites:
 * - Docker Compose environment running
 * - Database migrated
 * - Test data seeded
 * 
 * Run: npm run test:e2e
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3004';

describe('Venue Service E2E Tests', () => {
  let client: AxiosInstance;
  let authToken: string;
  let testTenantId: string;
  let createdVenueId: string;

  beforeAll(async () => {
    client = axios.create({
      baseURL: BASE_URL,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on non-2xx
    });

    // Get test auth token (mock for E2E or use test auth service)
    authToken = process.env.E2E_AUTH_TOKEN || 'test-jwt-token';
    testTenantId = process.env.E2E_TENANT_ID || '11111111-1111-1111-1111-111111111111';
  });

  describe('Health Checks', () => {
    it('should return healthy status', async () => {
      const response = await client.get('/health');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'ok');
      expect(response.data).toHaveProperty('timestamp');
    });

    it('should return readiness status', async () => {
      const response = await client.get('/health/ready');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('checks');
    });

    it('should return liveness status', async () => {
      const response = await client.get('/health/live');
      
      expect(response.status).toBe(200);
    });
  });

  describe('Venue CRUD Operations', () => {
    const testVenue = {
      name: `E2E Test Venue ${Date.now()}`,
      address: '123 Test Street',
      city: 'Test City',
      state: 'TS',
      country: 'US',
      postal_code: '12345',
      capacity: 5000,
      venue_type: 'arena',
    };

    it('should create a new venue', async () => {
      const response = await client.post('/api/v1/venues', testVenue, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data.name).toBe(testVenue.name);
      expect(response.data).toHaveProperty('slug');
      expect(response.data.tenant_id).toBe(testTenantId);

      createdVenueId = response.data.id;
    });

    it('should retrieve the created venue', async () => {
      const response = await client.get(`/api/v1/venues/${createdVenueId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(createdVenueId);
      expect(response.data.name).toBe(testVenue.name);
    });

    it('should list venues with pagination', async () => {
      const response = await client.get('/api/v1/venues', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
        params: {
          page: 1,
          limit: 10,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('data');
      expect(response.data).toHaveProperty('pagination');
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    it('should update the venue', async () => {
      const updateData = {
        name: `Updated E2E Venue ${Date.now()}`,
        capacity: 6000,
      };

      const response = await client.put(`/api/v1/venues/${createdVenueId}`, updateData, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.name).toBe(updateData.name);
      expect(response.data.capacity).toBe(updateData.capacity);
    });

    it('should delete the venue', async () => {
      const response = await client.delete(`/api/v1/venues/${createdVenueId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(204);

      // Verify deletion
      const getResponse = await client.get(`/api/v1/venues/${createdVenueId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });
      expect(getResponse.status).toBe(404);
    });
  });

  describe('Venue Settings', () => {
    let settingsVenueId: string;

    beforeAll(async () => {
      // Create a venue for settings tests
      const response = await client.post('/api/v1/venues', {
        name: `Settings Test Venue ${Date.now()}`,
        address: '456 Settings Ave',
        city: 'Test City',
        state: 'TS',
        country: 'US',
        postal_code: '12345',
        capacity: 1000,
        venue_type: 'theater',
      }, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });
      settingsVenueId = response.data.id;
    });

    afterAll(async () => {
      // Cleanup
      await client.delete(`/api/v1/venues/${settingsVenueId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });
    });

    it('should get venue settings', async () => {
      const response = await client.get(`/api/v1/venues/${settingsVenueId}/settings`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('venue_id', settingsVenueId);
    });

    it('should update venue settings', async () => {
      const settings = {
        ticket_resale_allowed: true,
        max_resale_price_multiplier: 1.5,
        require_seller_verification: true,
      };

      const response = await client.put(`/api/v1/venues/${settingsVenueId}/settings`, settings, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.ticket_resale_allowed).toBe(true);
      expect(response.data.max_resale_price_multiplier).toBe('1.50');
    });
  });

  describe('Multi-Tenant Isolation', () => {
    const tenant1Id = '22222222-2222-2222-2222-222222222222';
    const tenant2Id = '33333333-3333-3333-3333-333333333333';
    let tenant1VenueId: string;

    it('should create venue for tenant 1', async () => {
      const response = await client.post('/api/v1/venues', {
        name: 'Tenant 1 Venue',
        address: '111 Tenant St',
        city: 'City 1',
        state: 'T1',
        country: 'US',
        postal_code: '11111',
        capacity: 1000,
        venue_type: 'club',
      }, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': tenant1Id,
        },
      });

      expect(response.status).toBe(201);
      tenant1VenueId = response.data.id;
    });

    it('should NOT allow tenant 2 to access tenant 1 venue', async () => {
      const response = await client.get(`/api/v1/venues/${tenant1VenueId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': tenant2Id,
        },
      });

      expect(response.status).toBe(404);
    });

    it('should NOT list tenant 1 venues for tenant 2', async () => {
      const response = await client.get('/api/v1/venues', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': tenant2Id,
        },
      });

      expect(response.status).toBe(200);
      const venueIds = response.data.data.map((v: any) => v.id);
      expect(venueIds).not.toContain(tenant1VenueId);
    });

    afterAll(async () => {
      // Cleanup
      await client.delete(`/api/v1/venues/${tenant1VenueId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': tenant1Id,
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const response = await client.get('/api/v1/venues');
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid venue data', async () => {
      const response = await client.post('/api/v1/venues', {
        // Missing required fields
        name: '', // Empty name
      }, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
    });

    it('should return 404 for non-existent venue', async () => {
      const response = await client.get('/api/v1/venues/00000000-0000-0000-0000-000000000000', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });

      expect(response.status).toBe(404);
    });

    it('should return 409 for duplicate slug', async () => {
      const venue = {
        name: 'Duplicate Test Venue',
        slug: `duplicate-slug-${Date.now()}`,
        address: '789 Duplicate Lane',
        city: 'Test City',
        state: 'TS',
        country: 'US',
        postal_code: '12345',
        capacity: 1000,
        venue_type: 'stadium',
      };

      // Create first venue
      const response1 = await client.post('/api/v1/venues', venue, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });
      expect(response1.status).toBe(201);

      // Try to create second venue with same slug
      const response2 = await client.post('/api/v1/venues', { ...venue, name: 'Different Name' }, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });
      expect(response2.status).toBe(409);

      // Cleanup
      await client.delete(`/api/v1/venues/${response1.data.id}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Tenant-ID': testTenantId,
        },
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      // Make many concurrent requests
      for (let i = 0; i < 100; i++) {
        requests.push(
          client.get('/api/v1/venues', {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'X-Tenant-ID': testTenantId,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      // Some requests should be rate limited
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
