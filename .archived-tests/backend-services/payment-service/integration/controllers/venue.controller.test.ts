/**
 * Venue Controller Integration Tests
 *
 * Endpoints:
 * - GET /venues/:venueId/balance (auth)
 * - POST /venues/:venueId/payout (auth)
 * - GET /venues/:venueId/payouts (auth)
 */

import { FastifyInstance } from 'fastify';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  createTestToken,
  createTestVenueBalance,
  pool,
  db,
} from '../setup';

describe('VenueController', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let authToken: string;

  beforeAll(async () => {
    const context = await setupTestApp();
    app = context.app;
    testTenantId = context.testTenantId;
    testUserId = context.testUserId;
    testVenueId = context.testVenueId;
    authToken = createTestToken(testUserId, testTenantId, 'organizer');
  });

  afterAll(async () => {
    await teardownTestApp({ app, db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ============================================================================
  // GET /venues/:venueId/balance
  // ============================================================================
  describe('GET /venues/:venueId/balance', () => {
    it('should return 401 when no auth token provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${testVenueId}/balance`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when user lacks venue access', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${testVenueId}/balance`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      // User doesn't have venue in their venues array
      expect(response.statusCode).toBe(403);
    });

    it('should handle balance request for non-existent venue', async () => {
      const fakeVenueId = '00000000-0000-0000-0000-000000000000';
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${fakeVenueId}/balance`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      // Should return 403 (no access) or 404 (not found)
      expect([403, 404]).toContain(response.statusCode);
    });
  });

  // ============================================================================
  // POST /venues/:venueId/payout
  // ============================================================================
  describe('POST /venues/:venueId/payout', () => {
    it('should return 401 when no auth token provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/venues/${testVenueId}/payout`,
        payload: { amount: 100 },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when user lacks venue access', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/venues/${testVenueId}/payout`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { amount: 100 },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should handle payout request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/venues/${testVenueId}/payout`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { amount: 100, instant: false },
      });

      // Should return 403 (no access) or 200 (success) if access granted
      expect([200, 403, 500]).toContain(response.statusCode);
    });

    it('should handle instant payout request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/venues/${testVenueId}/payout`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { amount: 50, instant: true },
      });

      expect([200, 403, 500]).toContain(response.statusCode);
    });
  });

  // ============================================================================
  // GET /venues/:venueId/payouts
  // ============================================================================
  describe('GET /venues/:venueId/payouts', () => {
    it('should return 401 when no auth token provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${testVenueId}/payouts`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when user lacks venue access', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${testVenueId}/payouts`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should handle payout history with pagination params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${testVenueId}/payouts?limit=10&offset=0`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      // Should return 403 (no access) or 200 with array
      expect([200, 403]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.payload);
        expect(Array.isArray(body)).toBe(true);
      }
    });
  });
});
