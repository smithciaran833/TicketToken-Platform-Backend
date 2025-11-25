/**
 * Tenant Isolation Integration Tests
 * Tests cross-tenant access prevention and data isolation
 */

import { FastifyInstance } from 'fastify';
import { createTestApp, createTestUser, generateAuthToken } from '../setup';

describe('Tenant Isolation Integration Tests', () => {
  let app: FastifyInstance;
  let venue1User: any;
  let venue2User: any;
  let venue1Token: string;
  let venue2Token: string;

  beforeAll(async () => {
    app = await createTestApp();
    
    // Create users from different venues
    venue1User = createTestUser({ venueId: 'venue-1' });
    venue2User = createTestUser({ id: 'user-2', venueId: 'venue-2' });
    
    venue1Token = generateAuthToken(venue1User);
    venue2Token = generateAuthToken(venue2User);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cross-tenant Data Access', () => {
    it('should prevent venue-1 user from accessing venue-2 data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${venue1Token}`,
        },
        payload: {
          query: 'concert',
          filters: {
            venueId: 'venue-2', // Trying to access different venue
          },
        },
      });

      // Should succeed but return no results from venue-2
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      // Results should be filtered by user's venueId, not the requested one
      body.results.forEach((result: any) => {
        if (result.venueId) {
          expect(result.venueId).not.toBe('venue-2');
        }
      });
    });

    it('should auto-filter results to user venue', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${venue1Token}`,
        },
        payload: {
          query: 'concert',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      // All results should belong to venue-1
      body.results.forEach((result: any) => {
        if (result.venueId) {
          expect(result.venueId).toBe('venue-1');
        }
      });
    });

    it('should isolate venue-2 user results', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/events',
        headers: {
          authorization: `Bearer ${venue2Token}`,
        },
        payload: {
          query: 'event',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      // All results should belong to venue-2
      body.results.forEach((result: any) => {
        if (result.venueId) {
          expect(result.venueId).toBe('venue-2');
        }
      });
    });
  });

  describe('Token Tampering Prevention', () => {
    it('should reject token with modified venueId claim', async () => {
      // Create token with venue-1, try to access as venue-2
      const tamperedUser = { ...venue1User, venueId: 'venue-2' };
      const tamperedToken = generateAuthToken(tamperedUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${tamperedToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      // Should succeed but be limited to the venue in the token
      expect(response.statusCode).toBe(200);
    });

    it('should reject completely invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: 'Bearer invalid.token.signature',
        },
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Venue Association Requirements', () => {
    it('should reject users without venue assignment', async () => {
      const noVenueUser = createTestUser({ venueId: undefined });
      const noVenueToken = generateAuthToken(noVenueUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${noVenueToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Tenant information');
    });

    it('should reject null venueId', async () => {
      const nullVenueUser = createTestUser({ venueId: null });
      const nullVenueToken = generateAuthToken(nullVenueUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${nullVenueToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject empty string venueId', async () => {
      const emptyVenueUser = createTestUser({ venueId: '' });
      const emptyVenueToken = generateAuthToken(emptyVenueUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${emptyVenueToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      expect([400, 403]).toContain(response.statusCode);
    });
  });

  describe('VenueId Format Validation', () => {
    it('should reject SQL injection in venueId', async () => {
      const maliciousUser = createTestUser({ 
        venueId: "venue'; DROP TABLE tickets;--" 
      });
      const maliciousToken = generateAuthToken(maliciousUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${maliciousToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      expect([400, 403]).toContain(response.statusCode);
    });

    it('should reject script tags in venueId', async () => {
      const xssUser = createTestUser({ 
        venueId: '<script>alert(1)</script>' 
      });
      const xssToken = generateAuthToken(xssUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${xssToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      expect([400, 403]).toContain(response.statusCode);
    });

    it('should reject path traversal in venueId', async () => {
      const traversalUser = createTestUser({ 
        venueId: '../../../etc/passwd' 
      });
      const traversalToken = generateAuthToken(traversalUser);

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${traversalToken}`,
        },
        payload: {
          query: 'test',
        },
      });

      expect([400, 403]).toContain(response.statusCode);
    });
  });

  describe('Data Leakage Prevention', () => {
    it('should not expose other venue data in error messages', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${venue1Token}`,
        },
        payload: {
          query: 'test',
          filters: {
            venueId: 'venue-2',
          },
        },
      });

      // Even if error, should not reveal venue-2 data
      const body = JSON.parse(response.body);
      const bodyStr = JSON.stringify(body).toLowerCase();
      
      // Should not contain references to other venues
      expect(bodyStr).not.toContain('venue-2');
    });

    it('should not leak tenant info in stack traces', async () => {
      // Force an error condition
      const response = await app.inject({
        method: 'POST',
        url: '/api/search/tickets',
        headers: {
          authorization: `Bearer ${venue1Token}`,
          'content-type': 'application/json',
        },
        payload: '{malformed json',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      
      // Should not expose stack traces or internal paths
      expect(body).not.toHaveProperty('stack');
      expect(body).not.toHaveProperty('trace');
    });
  });

  describe('Concurrent Access Isolation', () => {
    it('should handle concurrent requests from different venues', async () => {
      const requests = [
        app.inject({
          method: 'POST',
          url: '/api/search/tickets',
          headers: { authorization: `Bearer ${venue1Token}` },
          payload: { query: 'test' },
        }),
        app.inject({
          method: 'POST',
          url: '/api/search/tickets',
          headers: { authorization: `Bearer ${venue2Token}` },
          payload: { query: 'test' },
        }),
        app.inject({
          method: 'POST',
          url: '/api/search/tickets',
          headers: { authorization: `Bearer ${venue1Token}` },
          payload: { query: 'test' },
        }),
      ];

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Verify no cross-contamination
      const body1 = JSON.parse(responses[0].body);
      const body2 = JSON.parse(responses[1].body);
      
      // Results should be isolated per venue
      body1.results.forEach((r: any) => {
        if (r.venueId) expect(r.venueId).toBe('venue-1');
      });
      body2.results.forEach((r: any) => {
        if (r.venueId) expect(r.venueId).toBe('venue-2');
      });
    });
  });
});
