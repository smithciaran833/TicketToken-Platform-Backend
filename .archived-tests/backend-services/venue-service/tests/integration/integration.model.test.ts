/**
 * IntegrationModel Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { IntegrationModel, IIntegration } from '../../src/models/integration.model';
import { v4 as uuidv4 } from 'uuid';

describe('IntegrationModel', () => {
  let context: TestContext;
  let integrationModel: IntegrationModel;

  beforeAll(async () => {
    context = await setupTestApp();
    integrationModel = new IntegrationModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await pool.query('DELETE FROM venue_integrations WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  // ==========================================================================
  // create
  // ==========================================================================
  describe('create', () => {
    it('should create integration with type field', async () => {
      const integration = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: { account_id: 'acct_123' }
      });

      expect(integration.id).toBeDefined();
      expect(integration.venue_id).toBe(TEST_VENUE_ID);
      expect(integration.integration_type).toBe('stripe');
      expect(integration.is_active).toBe(true);
    });

    it('should create integration with integration_type field', async () => {
      const integration = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        integration_type: 'square',
        config_data: { location_id: 'loc_123' }
      });

      expect(integration.integration_type).toBe('square');
      expect(integration.config_data).toEqual({ location_id: 'loc_123' });
    });

    it('should set default is_active to true', async () => {
      const integration = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'mailchimp',
        config: {}
      });

      expect(integration.is_active).toBe(true);
    });

    it('should allow setting is_active to false', async () => {
      const integration = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {},
        is_active: false
      });

      expect(integration.is_active).toBe(false);
    });

    it('should store encrypted credentials', async () => {
      const integration = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {},
        encrypted_credentials: {
          apiKey: 'encrypted_api_key',
          secretKey: 'encrypted_secret'
        }
      });

      expect(integration.api_key_encrypted).toBe('encrypted_api_key');
      expect(integration.api_secret_encrypted).toBe('encrypted_secret');
    });

    it('should generate integration name from type', async () => {
      const integration = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });

      expect(integration.integration_name).toBe('stripe Integration');
    });

    it('should use custom name if provided', async () => {
      const integration = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        name: 'My Custom Integration',
        config: {}
      });

      expect(integration.integration_name).toBe('My Custom Integration');
    });
  });

  // ==========================================================================
  // findById
  // ==========================================================================
  describe('findById', () => {
    it('should find integration by id', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: { test: true }
      });

      const found = await integrationModel.findById(created.id!);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.integration_type).toBe('stripe');
    });

    it('should find inactive integration', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {},
        is_active: false
      });

      const found = await integrationModel.findById(created.id!);

      expect(found).toBeDefined();
      expect(found!.is_active).toBe(false);
    });

    it('should return undefined for non-existent id', async () => {
      const found = await integrationModel.findById(uuidv4());

      expect(found).toBeUndefined();
    });
  });

  // ==========================================================================
  // findByVenue
  // ==========================================================================
  describe('findByVenue', () => {
    it('should return all active integrations for venue', async () => {
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'stripe', config: {} });
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'square', config: {} });
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'mailchimp', config: {} });

      const integrations = await integrationModel.findByVenue(TEST_VENUE_ID);

      expect(integrations.length).toBe(3);
    });

    it('should not return inactive integrations', async () => {
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'stripe', config: {} });
      const inactive = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'square',
        config: {},
        is_active: false
      });

      const integrations = await integrationModel.findByVenue(TEST_VENUE_ID);

      expect(integrations.length).toBe(1);
      expect(integrations.find(i => i.id === inactive.id)).toBeUndefined();
    });

    it('should return empty array for venue with no integrations', async () => {
      const integrations = await integrationModel.findByVenue(TEST_VENUE_ID);

      expect(integrations).toEqual([]);
    });

    it('should not return other venue integrations', async () => {
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'stripe', config: {} });

      const otherVenueId = uuidv4();
      const integrations = await integrationModel.findByVenue(otherVenueId);

      expect(integrations).toEqual([]);
    });
  });

  // ==========================================================================
  // findByVenueAndType
  // ==========================================================================
  describe('findByVenueAndType', () => {
    it('should find integration by venue and type', async () => {
      await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: { webhook_secret: 'whsec_123' }
      });

      const found = await integrationModel.findByVenueAndType(TEST_VENUE_ID, 'stripe');

      expect(found).toBeDefined();
      expect(found!.integration_type).toBe('stripe');
      expect(found!.config_data).toEqual({ webhook_secret: 'whsec_123' });
    });

    it('should return undefined for non-existent type', async () => {
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'stripe', config: {} });

      const found = await integrationModel.findByVenueAndType(TEST_VENUE_ID, 'square');

      expect(found).toBeUndefined();
    });

    it('should not find inactive integration', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });
      await integrationModel.delete(created.id!);

      const found = await integrationModel.findByVenueAndType(TEST_VENUE_ID, 'stripe');

      expect(found).toBeUndefined();
    });
  });

  // ==========================================================================
  // update
  // ==========================================================================
  describe('update', () => {
    it('should update config_data', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: { old: 'config' }
      });

      const updated = await integrationModel.update(created.id!, {
        config_data: { new: 'config', updated: true }
      });

      expect(updated.config_data).toEqual({ new: 'config', updated: true });
    });

    it('should update config via config field', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: { old: 'value' }
      });

      const updated = await integrationModel.update(created.id!, {
        config: { new: 'value' }
      });

      expect(updated.config_data).toEqual({ new: 'value' });
    });

    it('should update is_active via status field', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });

      const updated = await integrationModel.update(created.id!, {
        status: 'inactive'
      });

      expect(updated.is_active).toBe(false);
    });

    it('should update is_active directly', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });

      const updated = await integrationModel.update(created.id!, {
        is_active: false
      });

      expect(updated.is_active).toBe(false);
    });

    it('should update updated_at timestamp', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await integrationModel.update(created.id!, {
        config: { updated: true }
      });

      expect(new Date(updated.updated_at!).getTime()).toBeGreaterThan(
        new Date(created.updated_at!).getTime()
      );
    });
  });

  // ==========================================================================
  // delete (soft delete via is_active)
  // ==========================================================================
  describe('delete', () => {
    it('should soft delete by setting is_active to false', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });

      await integrationModel.delete(created.id!);

      const found = await integrationModel.findById(created.id!);
      expect(found).toBeDefined();
      expect(found!.is_active).toBe(false);
    });

    it('should not appear in findByVenue after delete', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });

      await integrationModel.delete(created.id!);

      const integrations = await integrationModel.findByVenue(TEST_VENUE_ID);
      expect(integrations.find(i => i.id === created.id)).toBeUndefined();
    });

    it('should not appear in findByVenueAndType after delete', async () => {
      const created = await integrationModel.create({
        venue_id: TEST_VENUE_ID,
        type: 'stripe',
        config: {}
      });

      await integrationModel.delete(created.id!);

      const found = await integrationModel.findByVenueAndType(TEST_VENUE_ID, 'stripe');
      expect(found).toBeUndefined();
    });
  });

  // ==========================================================================
  // Multiple integrations
  // ==========================================================================
  describe('multiple integrations', () => {
    it('should support multiple different types per venue', async () => {
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'stripe', config: {} });
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'square', config: {} });
      await integrationModel.create({ venue_id: TEST_VENUE_ID, type: 'mailchimp', config: {} });

      const integrations = await integrationModel.findByVenue(TEST_VENUE_ID);

      expect(integrations.length).toBe(3);
      const types = integrations.map(i => i.integration_type);
      expect(types).toContain('stripe');
      expect(types).toContain('square');
      expect(types).toContain('mailchimp');
    });
  });

  // ==========================================================================
  // withTransaction
  // ==========================================================================
  describe('withTransaction', () => {
    it('should work within transaction', async () => {
      let createdId: string;

      await context.db.transaction(async (trx) => {
        const trxModel = integrationModel.withTransaction(trx);
        const created = await trxModel.create({
          venue_id: TEST_VENUE_ID,
          type: 'stripe',
          config: { trx: true }
        });
        createdId = created.id!;
      });

      const found = await integrationModel.findById(createdId!);
      expect(found).toBeDefined();
      expect(found!.config_data).toEqual({ trx: true });
    });

    it('should rollback on error', async () => {
      let createdId: string | undefined;

      try {
        await context.db.transaction(async (trx) => {
          const trxModel = integrationModel.withTransaction(trx);
          const created = await trxModel.create({
            venue_id: TEST_VENUE_ID,
            type: 'stripe',
            config: {}
          });
          createdId = created.id;
          throw new Error('Force rollback');
        });
      } catch (e) {
        // Expected
      }

      if (createdId) {
        const found = await integrationModel.findById(createdId);
        expect(found).toBeUndefined();
      }
    });
  });
});
