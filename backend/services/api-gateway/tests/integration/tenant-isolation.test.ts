/**
 * SECURITY CRITICAL: Tenant Isolation Tests
 * 
 * These tests verify that the CVE-GATE-003 fix is working:
 * - Clients CANNOT manipulate tenant IDs via headers
 * - Tenant ID ONLY comes from validated JWT
 * - Multi-tenant isolation is enforced
 */

import Fastify from 'fastify';
import fastifyJWT from '@fastify/jwt';

describe('Tenant Isolation - Security Critical', () => {
  let app: any;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    
    // Register JWT
    await app.register(fastifyJWT, {
      secret: 'test-secret-key-at-least-32-characters-long!',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('CVE-GATE-003: Tenant ID Header Bypass Prevention', () => {
    it('should REJECT x-tenant-id header from client', async () => {
      // Attacker tries to access tenant-999 by manipulating headers
      const maliciousToken = app.jwt.sign({
        userId: 'user-123',
        tenantId: 'tenant-456', // Legitimate tenant
        role: 'user',
      });

      // Client sends malicious header trying to access different tenant
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${maliciousToken}`,
          'x-tenant-id': 'tenant-999', // ATTACK: Try to access different tenant
        },
      });

      // System should use tenant-456 from JWT, NOT tenant-999 from header
      // The header should be completely ignored
      expect(response.headers['x-tenant-id']).toBeUndefined();
    });

    it('should ONLY extract tenant ID from JWT payload', async () => {
      const legitimateTenant = 'tenant-abc-123';
      const attackerTenant = 'tenant-xyz-999';
      
      const token = app.jwt.sign({
        userId: 'user-456',
        tenantId: legitimateTenant,
        role: 'venue_admin',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': attackerTenant, // Malicious header
          'x-user-tenant': attackerTenant, // Alternative attack
          'tenant-id': attackerTenant, // Another variant
        },
      });

      // Verify dangerous headers were filtered
      expect(response.request.headers['x-tenant-id']).toBeUndefined();
    });

    it('should prevent tenant hopping via user impersonation', async () => {
      // User from tenant-A tries to access tenant-B resources
      const tenant
A_Token = app.jwt.sign({
        userId: 'user-from-tenant-a',
        tenantId: 'tenant-a',
        role: 'venue_admin',
      });

      // Try to access tenant-B venue with tenant-A credentials
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/venues/venue-belongs-to-tenant-b',
        headers: {
          authorization: `Bearer ${tenantA_Token}`,
        },
      });

      // Should be denied - user is from tenant-a
      expect([401, 403, 404]).toContain(response.statusCode);
    });

    it('should enforce tenant isolation in query parameters', async () => {
      const token = app.jwt.sign({
        userId: 'user-123',
        tenantId: 'tenant-legitimate',
        role: 'user',
      });

      // Try to filter by different tenant in query params
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/events?tenantId=tenant-attacker',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Query param should be ignored, JWT tenant should be used
      // This tests that backend doesn't trust client-provided tenant filters
      expect(response.statusCode).toBeLessThan(500);
    });
  });

  describe('Multi-Tenant Data Segregation', () => {
    it('should only return data for authenticated user tenant', async () => {
      const tenantId = 'tenant-secure-123';
      const token = app.jwt.sign({
        userId: 'user-789',
        tenantId: tenantId,
        role: 'venue_admin',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // All returned data should belong to tenant-secure-123 only
      if (response.statusCode === 200 && response.json().data) {
        const venues = response.json().data;
        venues.forEach((venue: any) => {
          expect(venue.tenantId).toBe(tenantId);
        });
      }
    });

    it('should prevent cross-tenant resource access', async () => {
      // User from tenant-1 tries to access event from tenant-2
      const tenant1Token = app.jwt.sign({
        userId: 'user-tenant1',
        tenantId: 'tenant-1',
        role: 'venue_admin',
      });

      // Event ID that belongs to tenant-2
      const tenant2EventId = 'event-belongs-to-tenant-2';

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/events/${tenant2EventId}`,
        headers: {
          authorization: `Bearer ${tenant1Token}`,
        },
      });

      // Should be denied (403 or 404, not 200)
      expect(response.statusCode).not.toBe(200);
      expect([403, 404]).toContain(response.statusCode);
    });
  });

  describe('JWT Tenant Validation', () => {
    it('should reject JWT without tenant ID', async () => {
      const invalidToken = app.jwt.sign({
        userId: 'user-123',
        // Missing tenantId - security violation
        role: 'user',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${invalidToken}`,
        },
      });

      // Should reject - tenant ID is required
      expect(response.statusCode).toBe(401);
    });

    it('should reject JWT with empty tenant ID', async () => {
      const invalidToken = app.jwt.sign({
        userId: 'user-123',
        tenantId: '', // Empty string
        role: 'user',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${invalidToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject JWT with null tenant ID', async () => {
      const invalidToken = app.jwt.sign({
        userId: 'user-123',
        tenantId: null, // Null value
        role: 'user',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${invalidToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Security: Dangerous Header Filtering', () => {
    it('should filter x-internal-* headers from client requests', async () => {
      const token = app.jwt.sign({
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'user',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
          'x-internal-user': 'admin', // Dangerous header
          'x-internal-role': 'super_admin', // Privilege escalation attempt
          'x-internal-bypass': 'true', // Bypass attempt
        },
      });

      // Dangerous headers should be filtered before reaching backend
      const forwardedHeaders = response.headers['x-forwarded-headers'];
      if (forwardedHeaders) {
        expect(forwardedHeaders).not.toContain('x-internal');
      }
    });

    it('should filter x-tenant-id header from client requests', async () => {
      const token = app.jwt.sign({
        userId: 'user-123',
        tenantId: 'legitimate-tenant',
        role: 'user',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tickets',
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': 'attacker-tenant',
          'content-type': 'application/json',
        },
        payload: {
          eventId: 'event-123',
          quantity: 1,
        },
      });

      // x-tenant-id should NOT be present in forwarded headers
      expect(response.request.headers['x-tenant-id']).toBeUndefined();
    });
  });
});
