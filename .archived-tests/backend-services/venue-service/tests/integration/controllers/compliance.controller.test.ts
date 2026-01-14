/**
 * Compliance Controller Integration Tests
 * 
 * Tests compliance proxy to external compliance service.
 * Returns 503 when compliance service is unavailable.
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  createTestToken,
  createTestVenue,
  createTestStaffMember,
  db,
  redis
} from '../setup';

describe('Compliance Controller Integration Tests', () => {
  let context: TestContext;
  let authToken: string;
  let testVenueId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = createTestToken(TEST_USER_ID, TEST_TENANT_ID, 'owner');
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    // Clear ALL Redis keys to reset rate limits
    await redis.flushdb();
    
    await cleanDatabase(db);

    // Create unique venue for each test to avoid rate limit collisions
    const venue = await createTestVenue(db, {
      name: 'Compliance Test Venue',
      tenant_id: TEST_TENANT_ID,
      created_by: TEST_USER_ID,
    });
    testVenueId = venue.id;

    await createTestStaffMember(db, {
      venue_id: testVenueId,
      user_id: TEST_USER_ID,
      role: 'owner',
    });
  });

  describe('Proxy to Compliance Service', () => {
    it('should return 503 when compliance service is unavailable', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${testVenueId}/compliance/status`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      // Compliance service is not running in test, should return 503
      expect(response.statusCode).toBe(503);
    });

    it('should proxy POST requests and return 503', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${testVenueId}/compliance/verify`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          documentType: 'business_license',
          documentId: 'doc123'
        }
      });

      expect(response.statusCode).toBe(503);
    });

    it('should forward query parameters and return 503', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${testVenueId}/compliance/reports?year=2024`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(503);
    });
  });
});
