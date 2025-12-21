/**
 * Domain Routes Integration Tests
 * 
 * Tests HTTP endpoints for custom domain management.
 * Uses app.inject() for in-process HTTP testing.
 * FK Chain: tenants → users → venues → custom_domains
 * 
 * Note: addCustomDomain requires white_label or enterprise tier
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  createTestToken,
  createTestVenue,
  createTestStaffMember,
  db,
  pool
} from '../setup';
import { v4 as uuidv4 } from 'uuid';

describe('Domain Routes Integration Tests', () => {
  let context: TestContext;
  let authToken: string;
  let whitelabelVenueId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = createTestToken(TEST_USER_ID, TEST_TENANT_ID, 'owner');
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await createTestStaffMember(db, {
      venue_id: TEST_VENUE_ID,
      user_id: TEST_USER_ID,
      role: 'owner',
    });

    // Create a white_label venue for domain tests (custom domains require white_label tier)
    whitelabelVenueId = uuidv4();
    await pool.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by, status, pricing_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [whitelabelVenueId, TEST_TENANT_ID, 'White Label Venue', `wl-venue-${Date.now()}`, 'wl@test.com', '123 WL St', 'WL City', 'WL', 'US', 'theater', 1000, TEST_USER_ID, 'ACTIVE', 'white_label']
    );

    // Clean custom_domains
    await pool.query('DELETE FROM custom_domains WHERE venue_id = $1', [whitelabelVenueId]);
  });

  // Helper to create a test domain directly in DB
  async function createTestDomain(venueId: string, domain: string): Promise<any> {
    const id = uuidv4();
    const verificationToken = uuidv4();
    
    await pool.query(
      `INSERT INTO custom_domains (id, venue_id, domain, verification_token, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, venueId, domain, verificationToken, 'pending']
    );
    
    const result = await pool.query('SELECT * FROM custom_domains WHERE id = $1', [id]);
    return result.rows[0];
  }

  // ==========================================================================
  // POST /api/v1/domains/:venueId/add
  // ==========================================================================
  describe('POST /api/v1/domains/:venueId/add', () => {
    it('should add custom domain for white_label venue', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/domains/${whitelabelVenueId}/add`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          domain: `test-${Date.now()}.example.com`
        }
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.domain).toBeDefined();
      // Response uses camelCase from mapToDomainObject
      expect(body.domain.venueId).toBe(whitelabelVenueId);
      expect(body.domain.verificationToken).toBeDefined();
    });

    it('should return 400 for standard tier venue', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/domains/${TEST_VENUE_ID}/add`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          domain: `standard-${Date.now()}.example.com`
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('white-label');
    });

    it('should return 400 for duplicate domain', async () => {
      const domain = `duplicate-${Date.now()}.example.com`;
      
      // Add domain first time
      await context.app.inject({
        method: 'POST',
        url: `/api/v1/domains/${whitelabelVenueId}/add`,
        headers: {
          'content-type': 'application/json'
        },
        payload: { domain }
      });

      // Try to add same domain again
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/domains/${whitelabelVenueId}/add`,
        headers: {
          'content-type': 'application/json'
        },
        payload: { domain }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 without domain in body', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/domains/${whitelabelVenueId}/add`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // POST /api/v1/domains/:domainId/verify
  // ==========================================================================
  describe('POST /api/v1/domains/:domainId/verify', () => {
    it('should attempt domain verification', async () => {
      const testDomain = await createTestDomain(whitelabelVenueId, `verify-${Date.now()}.example.com`);

      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/domains/${testDomain.id}/verify`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(typeof body.verified).toBe('boolean');
      expect(body.message).toBeDefined();
    });

    it('should return 400 for non-existent domain', async () => {
      const fakeDomainId = uuidv4();

      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/domains/${fakeDomainId}/verify`
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // GET /api/v1/domains/:domainId/status
  // ==========================================================================
  describe('GET /api/v1/domains/:domainId/status', () => {
    it('should return domain status', async () => {
      const testDomain = await createTestDomain(whitelabelVenueId, `status-${Date.now()}.example.com`);

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/domains/${testDomain.id}/status`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.domain).toBeDefined();
      expect(body.domain.id).toBe(testDomain.id);
      expect(body.domain.status).toBeDefined();
    });

    it('should return 404 for non-existent domain', async () => {
      const fakeDomainId = uuidv4();

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/domains/${fakeDomainId}/status`
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // GET /api/v1/domains/venue/:venueId
  // ==========================================================================
  describe('GET /api/v1/domains/venue/:venueId', () => {
    it('should return all domains for venue', async () => {
      // Create multiple domains
      await createTestDomain(whitelabelVenueId, `domain1-${Date.now()}.example.com`);
      await createTestDomain(whitelabelVenueId, `domain2-${Date.now()}.example.com`);

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/domains/venue/${whitelabelVenueId}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.domains).toBeDefined();
      expect(Array.isArray(body.domains)).toBe(true);
      expect(body.domains.length).toBe(2);
    });

    it('should return empty array for venue with no domains', async () => {
      const newVenue = await createTestVenue(db, {
        name: 'No Domains Venue',
        slug: `no-domains-${Date.now()}`,
      });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/domains/venue/${newVenue.id}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.domains).toEqual([]);
    });
  });

  // ==========================================================================
  // DELETE /api/v1/domains/:domainId
  // ==========================================================================
  describe('DELETE /api/v1/domains/:domainId', () => {
    it('should soft-delete custom domain (set status to suspended)', async () => {
      const testDomain = await createTestDomain(whitelabelVenueId, `delete-${Date.now()}.example.com`);

      const response = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/domains/${testDomain.id}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('removed');

      // Verify soft delete - status should be 'suspended'
      const checkResult = await pool.query(
        'SELECT * FROM custom_domains WHERE id = $1',
        [testDomain.id]
      );
      expect(checkResult.rows.length).toBe(1);
      expect(checkResult.rows[0].status).toBe('suspended');
    });

    it('should return 400 for non-existent domain', async () => {
      const fakeDomainId = uuidv4();

      const response = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/domains/${fakeDomainId}`
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
