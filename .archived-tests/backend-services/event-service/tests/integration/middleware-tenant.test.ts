/**
 * Tenant Middleware Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext,
  generateTestToken,
  cleanDatabase,
  db,
  pool,
  redis,
} from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Tenant Middleware', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  // ==========================================================================
  // tenantHook
  // ==========================================================================
  describe('tenantHook', () => {
    it('should reject request without user (no auth)', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with missing tenant_id in token', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        type: 'access',
        // Missing tenant_id
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with non-existent tenant', async () => {
      const fakeTenantId = uuidv4();
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: fakeTenantId,
        type: 'access',
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('INVALID_TENANT');
    });

    it('should reject request with inactive tenant', async () => {
      // Create an inactive tenant
      const inactiveTenantId = uuidv4();
      await pool.query(
        `INSERT INTO tenants (id, name, slug, status) VALUES ($1, $2, $3, $4)`,
        [inactiveTenantId, 'Inactive Tenant', `inactive-${inactiveTenantId.slice(0, 8)}`, 'suspended']
      );

      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: inactiveTenantId,
        type: 'access',
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('INACTIVE_TENANT');
    });

    it('should allow request with valid active tenant', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Should not be 401 or 403 (tenant-related errors)
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(403);
    });

    it('should set tenantId on request', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
      });

      // Make a request that would use tenantId
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // If successful, tenant context was set correctly
      expect(response.statusCode).not.toBe(403);
    });
  });

  // ==========================================================================
  // optionalTenantHook
  // ==========================================================================
  describe('optionalTenantHook', () => {
    it('should use default tenant for public endpoints', async () => {
      // Health endpoint should work without auth
      const response = await context.app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should use token tenant_id when authenticated', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).not.toBe(401);
    });
  });

  // ==========================================================================
  // Tenant isolation
  // ==========================================================================
  describe('tenant isolation', () => {
    it('should not return events from other tenants', async () => {
      // Create another tenant
      const otherTenantId = uuidv4();
      await pool.query(
        `INSERT INTO tenants (id, name, slug, status) VALUES ($1, $2, $3, $4)`,
        [otherTenantId, 'Other Tenant', `other-${otherTenantId.slice(0, 8)}`, 'active']
      );

      // Create a user for the other tenant
      const otherUserId = uuidv4();
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
        [otherUserId, otherTenantId, 'other@test.com', 'hash', 'admin']
      );

      // Create an event for the other tenant
      const otherEventId = uuidv4();
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [otherEventId, otherTenantId, '00000000-0000-0000-0000-000000000077', 'Other Tenant Event', 'other-event', 'DRAFT', 'single', otherUserId]
      );

      // Request with TEST_TENANT_ID should not see other tenant's event
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
      });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/events/${otherEventId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Should be 404 (not found) or 403 (forbidden) - not the actual event
      expect([403, 404]).toContain(response.statusCode);
    });

    it('should return events from own tenant', async () => {
      // Create an event for TEST_TENANT_ID
      const eventId = uuidv4();
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [eventId, TEST_TENANT_ID, '00000000-0000-0000-0000-000000000077', 'My Tenant Event', `my-event-${eventId.slice(0,8)}`, 'DRAFT', 'single', TEST_USER_ID]
      );

      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
      });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/events/${eventId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.id).toBe(eventId);
    });
  });
});
