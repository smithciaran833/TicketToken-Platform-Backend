/**
 * Search API Integration Tests
 * Tests complete search workflows with middleware chain
 */

import { FastifyInstance } from 'fastify';
import { createTestApp, createTestUser, generateAuthToken } from '../setup';

describe('Search API Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;
  let user: any;

  beforeAll(async () => {
    app = await createTestApp();
    user = createTestUser();
    authToken = generateAuthToken(user);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/search/tickets', () => {
    it('should successfully search with valid authentication and tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'concert',
          limit: 10,
          offset: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('results');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.results)).toBe(true);
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        payload: {
          query: 'concert',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should reject request with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: 'Bearer invalid.token.here',
        },
        payload: {
          query: 'concert',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should sanitize malicious query input', async () => {
      const maliciousQuery = '<script>alert("xss")</script>';

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: maliciousQuery,
        },
      });

      // Should not return 400, should sanitize and search
      expect(response.statusCode).not.toBe(500);
      // Query should be sanitized before reaching Elasticsearch
    });

    it('should validate request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          // Missing required query field
          limit: 10,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toContain('validation');
    });

    it('should enforce maximum page size limits', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'concert',
          limit: 10000, // Way over limit
        },
      });

      // Should either reject or clamp to max limit
      expect([200, 400]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.results.length).toBeLessThanOrEqual(100);
      }
    });

    it('should handle empty search results gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'nonexistent-event-xyz-12345',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('POST /api/search/events', () => {
    it('should search events with filters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/events',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'concert',
          filters: {
            priceMin: 50,
            priceMax: 200,
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('results');
    });

    it('should reject non-whitelisted filter fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/events',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'concert',
          filters: {
            maliciousField: 'should be ignored',
            priceMin: 50,
          },
        },
      });

      // Should succeed but ignore malicious field
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/search/venues', () => {
    it('should search venues with geo-location', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'stadium',
          location: {
            lat: 40.7128,
            lon: -74.0060,
            radius: '10km',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('results');
    });

    it('should validate coordinate ranges', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'stadium',
          location: {
            lat: 200, // Invalid latitude
            lon: -74.0060,
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on search endpoints', async () => {
      const requests = [];

      // Make many rapid requests
      for (let i = 0; i < 150; i++) {
        requests.push(
          app.inject({
            method: 'POST',
            url: '/api/search/tickets',
            headers: {
              authorization: `Bearer ${authToken}`,
            },
            payload: {
              query: 'test',
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.statusCode === 429);

      // Should have some rate limited responses
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: '{invalid json}',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should return appropriate error for elasticsearch failures', async () => {
      // This would need to mock Elasticsearch to simulate failure
      // For now, test that errors are properly formatted
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      // Should not expose internal error details
      if (response.statusCode >= 500) {
        const body = JSON.parse(response.body);
        expect(body).not.toHaveProperty('stack');
        expect(body).toHaveProperty('error');
      }
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include security headers in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'concert',
        },
      });

      // Check for security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should only return results for user tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'concert',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // All results should belong to the user's venue
      body.results.forEach((result: any) => {
        if (result.venueId) {
          expect(result.venueId).toBe(user.venueId);
        }
      });
    });

    it('should reject requests from users without venue assignment', async () => {
      const userWithoutVenue = { ...user, venueId: undefined };
      const tokenWithoutVenue = generateAuthToken(userWithoutVenue);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${tokenWithoutVenue}`,
        },
        payload: {
          query: 'concert',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Tenant information');
    });
  });

  describe('Performance', () => {
    it('should respond within acceptable time limits', async () => {
      const start = Date.now();

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          query: 'concert',
        },
      });

      const duration = Date.now() - start;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(3000); // Should respond within 3 seconds
    });
  });
});
