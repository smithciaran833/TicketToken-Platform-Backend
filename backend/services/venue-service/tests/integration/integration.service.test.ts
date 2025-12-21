/**
 * IntegrationService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { IntegrationService } from '../../src/services/integration.service';
import { v4 as uuidv4 } from 'uuid';

describe('IntegrationService', () => {
  let context: TestContext;
  let integrationService: IntegrationService;

  beforeAll(async () => {
    context = await setupTestApp();
    integrationService = new IntegrationService({
      db: context.db,
      logger: context.app.log
    });
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean integrations table
    await pool.query('DELETE FROM venue_integrations WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  // Helper to create test integration directly in DB
  async function createTestIntegration(options: {
    venue_id?: string;
    integration_type?: string;
    config_data?: any;
    is_active?: boolean;
    api_key_encrypted?: string;
  } = {}): Promise<any> {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO venue_integrations (id, venue_id, integration_type, config_data, is_active, api_key_encrypted)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        options.venue_id || TEST_VENUE_ID,
        options.integration_type || 'stripe',
        JSON.stringify(options.config_data || {}),
        options.is_active ?? true,
        options.api_key_encrypted || null
      ]
    );
    const result = await pool.query('SELECT * FROM venue_integrations WHERE id = $1', [id]);
    return result.rows[0];
  }

  // ==========================================================================
  // createIntegration
  // ==========================================================================
  describe('createIntegration', () => {
    it('should create a new integration', async () => {
      const data = {
        type: 'stripe',
        config: { webhook_secret: 'whsec_test' },
        status: 'active'
      };

      const result = await integrationService.createIntegration(TEST_VENUE_ID, data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.venue_id).toBe(TEST_VENUE_ID);
      expect(result.integration_type).toBe('stripe');
    });

    it('should create integration with encrypted credentials', async () => {
      const data = {
        type: 'square',
        config: { location_id: 'loc_123' },
        encrypted_credentials: 'encrypted_api_key_here'
      };

      const result = await integrationService.createIntegration(TEST_VENUE_ID, data);

      expect(result).toBeDefined();
      expect(result.integration_type).toBe('square');
    });

    it('should default status to active', async () => {
      const data = {
        type: 'stripe',
        config: {}
      };

      const result = await integrationService.createIntegration(TEST_VENUE_ID, data);

      expect(result.is_active).toBe(true);
    });
  });

  // ==========================================================================
  // getIntegration
  // ==========================================================================
  describe('getIntegration', () => {
    it('should return integration by id', async () => {
      const integration = await createTestIntegration({
        integration_type: 'stripe',
        config_data: { test: true }
      });

      const result = await integrationService.getIntegration(integration.id);

      expect(result).toBeDefined();
      expect(result!.id).toBe(integration.id);
      expect(result!.integration_type).toBe('stripe');
    });

    it('should return null for non-existent integration', async () => {
      const fakeId = uuidv4();

      const result = await integrationService.getIntegration(fakeId);

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // getVenueIntegrationByType
  // ==========================================================================
  describe('getVenueIntegrationByType', () => {
    it('should return integration by venue and type', async () => {
      await createTestIntegration({
        integration_type: 'stripe'
      });

      const result = await integrationService.getVenueIntegrationByType(TEST_VENUE_ID, 'stripe');

      expect(result).toBeDefined();
      expect(result!.integration_type).toBe('stripe');
      expect(result!.venue_id).toBe(TEST_VENUE_ID);
    });

    it('should return null when type not found', async () => {
      await createTestIntegration({
        integration_type: 'stripe'
      });

      const result = await integrationService.getVenueIntegrationByType(TEST_VENUE_ID, 'square');

      expect(result).toBeNull();
    });

    it('should return null for wrong venue', async () => {
      await createTestIntegration({
        integration_type: 'stripe'
      });

      const otherVenueId = uuidv4();
      const result = await integrationService.getVenueIntegrationByType(otherVenueId, 'stripe');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // listVenueIntegrations
  // ==========================================================================
  describe('listVenueIntegrations', () => {
    it('should return all integrations for a venue', async () => {
      await createTestIntegration({ integration_type: 'stripe' });
      await createTestIntegration({ integration_type: 'square' });

      const results = await integrationService.listVenueIntegrations(TEST_VENUE_ID);

      expect(results.length).toBe(2);
      expect(results.map(r => r.integration_type)).toContain('stripe');
      expect(results.map(r => r.integration_type)).toContain('square');
    });

    it('should return empty array for venue with no integrations', async () => {
      const results = await integrationService.listVenueIntegrations(TEST_VENUE_ID);

      expect(results).toEqual([]);
    });

    it('should not return other venue integrations', async () => {
      await createTestIntegration({ integration_type: 'stripe' });

      const otherVenueId = uuidv4();
      const results = await integrationService.listVenueIntegrations(otherVenueId);

      expect(results).toEqual([]);
    });
  });

  // ==========================================================================
  // updateIntegration
  // ==========================================================================
  describe('updateIntegration', () => {
    it('should update integration config', async () => {
      const integration = await createTestIntegration({
        integration_type: 'stripe',
        config_data: { old: 'config' }
      });

      const result = await integrationService.updateIntegration(integration.id, {
        config_data: { new: 'config', updated: true }
      });

      expect(result.config_data).toEqual({ new: 'config', updated: true });
    });

    it('should update integration status', async () => {
      const integration = await createTestIntegration({
        integration_type: 'stripe',
        is_active: true
      });

      const result = await integrationService.updateIntegration(integration.id, {
        is_active: false
      });

      expect(result.is_active).toBe(false);
    });

    it('should update last_sync_at', async () => {
      const integration = await createTestIntegration({
        integration_type: 'stripe'
      });

      const syncTime = new Date();
      const result: any = await integrationService.updateIntegration(integration.id, {
        last_sync_at: syncTime
      });

      expect(new Date(result.last_sync_at).getTime()).toBeCloseTo(syncTime.getTime(), -3);
    });
  });

  // ==========================================================================
  // deleteIntegration
  // ==========================================================================
  describe('deleteIntegration', () => {
    it('should delete integration', async () => {
      const integration = await createTestIntegration({
        integration_type: 'stripe'
      });

      await integrationService.deleteIntegration(integration.id);

      // Verify deletion (soft delete sets deleted_at)
      const result = await pool.query(
        'SELECT deleted_at FROM venue_integrations WHERE id = $1',
        [integration.id]
      );

      // If soft delete
      if (result.rows.length > 0) {
        expect(result.rows[0].deleted_at).not.toBeNull();
      } else {
        // Hard delete
        expect(result.rows.length).toBe(0);
      }
    });
  });

  // ==========================================================================
  // testIntegration
  // ==========================================================================
  describe('testIntegration', () => {
    it('should test stripe integration', async () => {
      const integration = await createTestIntegration({
        integration_type: 'stripe',
        api_key_encrypted: 'encrypted_key'
      });

      const result = await integrationService.testIntegration(integration.id);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Stripe');
    });

    it('should test square integration', async () => {
      const integration = await createTestIntegration({
        integration_type: 'square',
        api_key_encrypted: 'encrypted_key'
      });

      const result = await integrationService.testIntegration(integration.id);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Square');
    });

    it('should return not supported for unknown integration type', async () => {
      const integration = await createTestIntegration({
        integration_type: 'unknown_provider'
      });

      const result = await integrationService.testIntegration(integration.id);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not supported');
    });

    it('should throw error for non-existent integration', async () => {
      const fakeId = uuidv4();

      await expect(
        integrationService.testIntegration(fakeId)
      ).rejects.toThrow('Integration not found');
    });
  });

  // ==========================================================================
  // syncWithExternalSystem
  // ==========================================================================
  describe('syncWithExternalSystem', () => {
    it('should sync integration with external system', async () => {
      const integration = await createTestIntegration({
        integration_type: 'stripe'
      });

      // Should not throw
      await expect(
        integrationService.syncWithExternalSystem(integration.id)
      ).resolves.not.toThrow();
    });

    it('should throw error for non-existent integration', async () => {
      const fakeId = uuidv4();

      await expect(
        integrationService.syncWithExternalSystem(fakeId)
      ).rejects.toThrow('Integration not found');
    });
  });

  // ==========================================================================
  // Multiple integrations per venue
  // ==========================================================================
  describe('multiple integrations', () => {
    it('should support multiple different integration types per venue', async () => {
      await createTestIntegration({ integration_type: 'stripe' });
      await createTestIntegration({ integration_type: 'square' });
      await createTestIntegration({ integration_type: 'mailchimp' });

      const integrations = await integrationService.listVenueIntegrations(TEST_VENUE_ID);

      expect(integrations.length).toBe(3);
    });

    it('should enforce unique constraint on venue_id + integration_type', async () => {
      await createTestIntegration({ integration_type: 'stripe' });

      // Trying to create another stripe integration for same venue should fail
      await expect(
        pool.query(
          `INSERT INTO venue_integrations (id, venue_id, integration_type, config_data)
           VALUES ($1, $2, $3, $4)`,
          [uuidv4(), TEST_VENUE_ID, 'stripe', '{}']
        )
      ).rejects.toThrow();
    });
  });
});
