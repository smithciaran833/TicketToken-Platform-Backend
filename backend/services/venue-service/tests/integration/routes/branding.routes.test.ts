/**
 * Branding Routes Integration Tests
 * 
 * Tests HTTP endpoints for venue branding management.
 * Uses app.inject() for in-process HTTP testing.
 * FK Chain: tenants → users → venues → venue_branding, venue_tier_history
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

describe('Branding Routes Integration Tests', () => {
  let context: TestContext;
  let authToken: string;

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
  });

  // ==========================================================================
  // GET /api/v1/branding/:venueId
  // ==========================================================================
  describe('GET /api/v1/branding/:venueId', () => {
    it('should return branding for venue', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/branding/${TEST_VENUE_ID}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.branding).toBeDefined();
    });

    it('should return default branding if none exists', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/branding/${TEST_VENUE_ID}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      // Default branding values
      expect(body.branding.primaryColor || body.branding.primary_color).toBeDefined();
    });
  });

  // ==========================================================================
  // PUT /api/v1/branding/:venueId
  // ==========================================================================
  describe('PUT /api/v1/branding/:venueId', () => {
    it('should create branding configuration', async () => {
      const brandingData = {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
        fontFamily: 'Roboto'
      };

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/branding/${TEST_VENUE_ID}`,
        headers: {
          'content-type': 'application/json'
        },
        payload: brandingData
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.branding).toBeDefined();
    });

    it('should update existing branding', async () => {
      // Create initial branding
      await context.app.inject({
        method: 'PUT',
        url: `/api/v1/branding/${TEST_VENUE_ID}`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          primaryColor: '#FF5733'
        }
      });

      // Update branding
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/branding/${TEST_VENUE_ID}`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          primaryColor: '#00FF00',
          logoUrl: 'https://example.com/logo.png'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.branding).toBeDefined();
    });
  });

  // ==========================================================================
  // GET /api/v1/branding/:venueId/css
  // ==========================================================================
  describe('GET /api/v1/branding/:venueId/css', () => {
    it('should return CSS variables for venue', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/branding/${TEST_VENUE_ID}/css`
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/css');
    });

    it('should include CSS custom properties', async () => {
      // First set some branding
      await context.app.inject({
        method: 'PUT',
        url: `/api/v1/branding/${TEST_VENUE_ID}`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          primaryColor: '#FF5733'
        }
      });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/branding/${TEST_VENUE_ID}/css`
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).toContain('--');
    });
  });

  // ==========================================================================
  // GET /api/v1/branding/pricing/tiers
  // ==========================================================================
  describe('GET /api/v1/branding/pricing/tiers', () => {
    it('should return all pricing tiers', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/branding/pricing/tiers'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.tiers).toBeDefined();
      expect(Array.isArray(body.tiers)).toBe(true);
      // Should have default tiers from migration
      expect(body.tiers.length).toBeGreaterThanOrEqual(1);
    });

    it('should include standard tier', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/branding/pricing/tiers'
      });

      const body = JSON.parse(response.payload);
      const standardTier = body.tiers.find((t: any) => t.tier_name === 'standard');
      expect(standardTier).toBeDefined();
    });
  });

  // ==========================================================================
  // POST /api/v1/branding/:venueId/tier
  // ==========================================================================
  describe('POST /api/v1/branding/:venueId/tier', () => {
    it('should change venue tier', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/branding/${TEST_VENUE_ID}/tier`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          newTier: 'white_label',
          reason: 'Upgrade requested',
          userId: TEST_USER_ID
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Tier changed');
    });

    it('should return 400 for invalid tier', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/branding/${TEST_VENUE_ID}/tier`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          newTier: 'invalid_tier_name',
          userId: TEST_USER_ID
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // GET /api/v1/branding/:venueId/tier/history
  // ==========================================================================
  describe('GET /api/v1/branding/:venueId/tier/history', () => {
    it('should return tier change history', async () => {
      // First change tier to create history
      await context.app.inject({
        method: 'POST',
        url: `/api/v1/branding/${TEST_VENUE_ID}/tier`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          newTier: 'white_label',
          reason: 'Test upgrade',
          userId: TEST_USER_ID
        }
      });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/branding/${TEST_VENUE_ID}/tier/history`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.history).toBeDefined();
      expect(Array.isArray(body.history)).toBe(true);
    });

    it('should return empty array for venue with no tier changes', async () => {
      const newVenue = await createTestVenue(db, {
        name: 'No Tier Changes Venue',
        slug: `no-tier-${Date.now()}`,
      });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/branding/${newVenue.id}/tier/history`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.history).toEqual([]);
    });
  });

  // ==========================================================================
  // GET /api/v1/branding/domain/:domain
  // ==========================================================================
  describe('GET /api/v1/branding/domain/:domain', () => {
    it('should return 404 for non-existent domain', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/branding/domain/nonexistent.example.com'
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
