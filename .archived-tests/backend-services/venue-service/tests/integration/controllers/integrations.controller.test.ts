/**
 * Integrations Controller Integration Tests
 * 
 * Tests venue integrations CRUD operations.
 * FK Chain: tenants → users → venues → venue_integrations
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
  ensureTestUser,
  db,
  pool
} from '../setup';
import { v4 as uuidv4 } from 'uuid';

describe('Integrations Controller Integration Tests', () => {
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
    await pool.query('DELETE FROM venue_integrations WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  // Helper to create test integration
  async function createTestIntegration(venueId: string, type: string = 'stripe'): Promise<any> {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO venue_integrations (id, venue_id, integration_type, integration_name, config_data, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, venueId, type, `${type} Integration`, JSON.stringify({ testKey: 'testValue' }), true]
    );
    const result = await pool.query('SELECT * FROM venue_integrations WHERE id = $1', [id]);
    return result.rows[0];
  }

  // ==========================================================================
  // GET /api/v1/venues/:venueId/integrations
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId/integrations', () => {
    it('should return list of integrations', async () => {
      await createTestIntegration(TEST_VENUE_ID, 'stripe');
      await createTestIntegration(TEST_VENUE_ID, 'mailchimp');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
    });

    it('should mask sensitive credentials', async () => {
      const id = uuidv4();
      await pool.query(
        `INSERT INTO venue_integrations (id, venue_id, integration_type, config_data, api_key_encrypted, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, TEST_VENUE_ID, 'stripe', JSON.stringify({}), 'encrypted_key', true]
      );

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body[0].api_key_encrypted).toBeUndefined();
      expect(body[0].config.apiKey).toBe('***');
    });

    it('should return 401 without auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-staff user', async () => {
      const randomUserId = uuidv4();
      await ensureTestUser(db, randomUserId);
      const randomToken = createTestToken(randomUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`,
        headers: { authorization: `Bearer ${randomToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // POST /api/v1/venues/:venueId/integrations
  // ==========================================================================
  describe('POST /api/v1/venues/:venueId/integrations', () => {
    it('should create integration', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          provider: 'stripe',
          config: { webhookUrl: 'https://example.com/webhook' },
          credentials: { apiKey: 'sk_test_123' }
        }
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toBeDefined();
      expect(body.integration_type).toBe('stripe');
    });

    it('should return 403 for viewer role', async () => {
      const viewerUserId = uuidv4();
      await ensureTestUser(db, viewerUserId);
      await createTestStaffMember(db, {
        venue_id: TEST_VENUE_ID,
        user_id: viewerUserId,
        role: 'viewer',
      });
      const viewerToken = createTestToken(viewerUserId, TEST_TENANT_ID, 'viewer');

      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`,
        headers: {
          authorization: `Bearer ${viewerToken}`,
          'content-type': 'application/json'
        },
        payload: { provider: 'stripe', credentials: { apiKey: 'test' } }
      });
      expect(response.statusCode).toBe(403);
    });

    it('should return 409 for duplicate integration type', async () => {
      await createTestIntegration(TEST_VENUE_ID, 'stripe');

      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: { provider: 'stripe', credentials: { apiKey: 'another' } }
      });
      expect(response.statusCode).toBe(409);
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/:venueId/integrations/:integrationId
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId/integrations/:integrationId', () => {
    it('should return integration by id', async () => {
      const integration = await createTestIntegration(TEST_VENUE_ID, 'stripe');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations/${integration.id}`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(integration.id);
    });

    it('should return 404 for non-existent integration', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations/${uuidv4()}`,
        headers: { authorization: `Bearer ${authToken}` }
      });
      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // PUT /api/v1/venues/:venueId/integrations/:integrationId
  // ==========================================================================
  describe('PUT /api/v1/venues/:venueId/integrations/:integrationId', () => {
    it('should update integration', async () => {
      const integration = await createTestIntegration(TEST_VENUE_ID, 'stripe');

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations/${integration.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: { config: { newSetting: 'value' }, status: 'inactive' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 404 for non-existent integration', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations/${uuidv4()}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: { status: 'inactive' }
      });
      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE /api/v1/venues/:venueId/integrations/:integrationId
  // ==========================================================================
  describe('DELETE /api/v1/venues/:venueId/integrations/:integrationId', () => {
    it('should delete integration when owner', async () => {
      const integration = await createTestIntegration(TEST_VENUE_ID, 'stripe');

      const response = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations/${integration.id}`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 for manager role', async () => {
      const managerUserId = uuidv4();
      await ensureTestUser(db, managerUserId);
      await createTestStaffMember(db, {
        venue_id: TEST_VENUE_ID,
        user_id: managerUserId,
        role: 'manager',
      });
      const managerToken = createTestToken(managerUserId, TEST_TENANT_ID, 'manager');

      const integration = await createTestIntegration(TEST_VENUE_ID, 'stripe');

      const response = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations/${integration.id}`,
        headers: { authorization: `Bearer ${managerToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // POST /api/v1/venues/:venueId/integrations/:integrationId/test
  // ==========================================================================
  describe('POST /api/v1/venues/:venueId/integrations/:integrationId/test', () => {
    it('should test integration connection', async () => {
      const integration = await createTestIntegration(TEST_VENUE_ID, 'stripe');

      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations/${integration.id}/test`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBeDefined();
      expect(body.message).toBeDefined();
    });
  });
});
