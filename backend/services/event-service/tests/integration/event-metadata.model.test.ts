/**
 * EventMetadataModel Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  db,
  pool,
  redis,
} from './setup';
import { EventMetadataModel, IEventMetadata } from '../../src/models/event-metadata.model';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('EventMetadataModel', () => {
  let context: TestContext;
  let metadataModel: EventMetadataModel;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    metadataModel = new EventMetadataModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);

    // Create a test event for metadata tests
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Metadata Test Event', `metadata-test-${testEventId.slice(0,8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  // Helper to create metadata directly
  async function createMetadataDirect(eventId: string, overrides: Partial<IEventMetadata> = {}): Promise<any> {
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO event_metadata (
        id, tenant_id, event_id, headliner, supporting_acts, production_company,
        primary_sponsor, performance_rights_org, stage_setup_time_hours,
        production_budget, marketing_budget, projected_revenue, break_even_capacity,
        press_release, performers, sponsors, technical_requirements, custom_fields
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        id,
        TEST_TENANT_ID,
        eventId,
        overrides.headliner || null,
        overrides.supporting_acts || null,
        overrides.production_company || null,
        overrides.primary_sponsor || null,
        overrides.performance_rights_org || null,
        overrides.stage_setup_time_hours || null,
        overrides.production_budget || null,
        overrides.marketing_budget || null,
        overrides.projected_revenue || null,
        overrides.break_even_capacity || null,
        overrides.press_release || null,
        overrides.performers ? JSON.stringify(overrides.performers) : null,
        overrides.sponsors ? JSON.stringify(overrides.sponsors) : null,
        overrides.technical_requirements ? JSON.stringify(overrides.technical_requirements) : null,
        overrides.custom_fields ? JSON.stringify(overrides.custom_fields) : null,
      ]
    );

    return result.rows[0];
  }

  // ==========================================================================
  // findById (inherited from BaseModel)
  // ==========================================================================
  describe('findById', () => {
    it('should find metadata by id', async () => {
      const created = await createMetadataDirect(testEventId, { headliner: 'Test Headliner' });

      const metadata = await metadataModel.findById(created.id);

      expect(metadata).toBeDefined();
      expect(metadata!.id).toBe(created.id);
      expect(metadata!.headliner).toBe('Test Headliner');
    });

    it('should return null for non-existent metadata', async () => {
      const metadata = await metadataModel.findById(uuidv4());

      expect(metadata).toBeNull();
    });
  });

  // ==========================================================================
  // findByEventId
  // ==========================================================================
  describe('findByEventId', () => {
    it('should find metadata by event_id', async () => {
      await createMetadataDirect(testEventId, { headliner: 'Event Headliner' });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata).toBeDefined();
      expect(metadata!.event_id).toBe(testEventId);
      expect(metadata!.headliner).toBe('Event Headliner');
    });

    it('should return null for event with no metadata', async () => {
      const metadata = await metadataModel.findByEventId(uuidv4());

      expect(metadata).toBeNull();
    });

    it('should return single record (unique constraint on event_id)', async () => {
      await createMetadataDirect(testEventId, { headliner: 'Only One' });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata).toBeDefined();
      expect(metadata!.headliner).toBe('Only One');
    });
  });

  // ==========================================================================
  // upsert
  // ==========================================================================
  describe('upsert', () => {
    it('should create metadata if none exists', async () => {
      const newEventId = uuidv4();
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'New Event', `new-event-${newEventId.slice(0,8)}`, 'DRAFT', 'single', TEST_USER_ID]
      );

      const result = await metadataModel.upsert(newEventId, {
        headliner: 'New Headliner',
        production_company: 'New Productions',
      });

      expect(result.event_id).toBe(newEventId);
      expect(result.headliner).toBe('New Headliner');
      expect(result.production_company).toBe('New Productions');

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_metadata WHERE event_id = $1', [newEventId]);
      expect(dbResult.rows.length).toBe(1);
    });

    it('should update metadata if it already exists', async () => {
      await createMetadataDirect(testEventId, {
        headliner: 'Original Headliner',
        production_company: 'Original Productions',
      });

      const result = await metadataModel.upsert(testEventId, {
        headliner: 'Updated Headliner',
        primary_sponsor: 'Big Sponsor',
      });

      expect(result.headliner).toBe('Updated Headliner');
      expect(result.primary_sponsor).toBe('Big Sponsor');

      // Verify in database - should still be only one record
      const dbResult = await pool.query('SELECT * FROM event_metadata WHERE event_id = $1', [testEventId]);
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].headliner).toBe('Updated Headliner');
    });

    it('should update updated_at timestamp on update', async () => {
      const created = await createMetadataDirect(testEventId, { headliner: 'Test' });
      const originalUpdatedAt = created.updated_at;

      await new Promise(resolve => setTimeout(resolve, 50));

      const result = await metadataModel.upsert(testEventId, { headliner: 'Updated' });

      expect(new Date(result.updated_at).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });

  // ==========================================================================
  // JSONB fields
  // ==========================================================================
  describe('JSONB fields', () => {
    it('should handle performers array', async () => {
      const performers = [
        { name: 'Artist 1', role: 'headliner' },
        { name: 'Artist 2', role: 'opener' },
      ];

      await createMetadataDirect(testEventId, { performers });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata!.performers).toEqual(performers);
    });

    it('should handle sponsors array', async () => {
      const sponsors = [
        { name: 'Sponsor A', tier: 'gold' },
        { name: 'Sponsor B', tier: 'silver' },
      ];

      await createMetadataDirect(testEventId, { sponsors });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata!.sponsors).toEqual(sponsors);
    });

    it('should handle technical_requirements object', async () => {
      const techReqs = {
        stage_size: '40x30 ft',
        power_requirements: '200 amps',
        sound_check_duration: '2 hours',
      };

      await createMetadataDirect(testEventId, { technical_requirements: techReqs });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata!.technical_requirements).toEqual(techReqs);
    });

    it('should handle custom_fields object', async () => {
      const customFields = {
        custom_field_1: 'value1',
        custom_field_2: 123,
        nested: { key: 'value' },
      };

      await createMetadataDirect(testEventId, { custom_fields: customFields });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata!.custom_fields).toEqual(customFields);
    });
  });

  // ==========================================================================
  // Budget fields
  // ==========================================================================
  describe('budget fields', () => {
    it('should handle production_budget', async () => {
      await createMetadataDirect(testEventId, { production_budget: 50000.00 });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(parseFloat(metadata!.production_budget as any)).toBe(50000.00);
    });

    it('should handle marketing_budget', async () => {
      await createMetadataDirect(testEventId, { marketing_budget: 25000.50 });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(parseFloat(metadata!.marketing_budget as any)).toBe(25000.50);
    });

    it('should handle projected_revenue', async () => {
      await createMetadataDirect(testEventId, { projected_revenue: 150000.00 });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(parseFloat(metadata!.projected_revenue as any)).toBe(150000.00);
    });

    it('should handle break_even_capacity', async () => {
      await createMetadataDirect(testEventId, { break_even_capacity: 500 });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata!.break_even_capacity).toBe(500);
    });
  });

  // ==========================================================================
  // Text array fields
  // ==========================================================================
  describe('text array fields', () => {
    it('should handle supporting_acts array', async () => {
      const supportingActs = ['Band A', 'Band B', 'DJ C'];

      await createMetadataDirect(testEventId, { supporting_acts: supportingActs });

      const metadata = await metadataModel.findByEventId(testEventId);

      expect(metadata!.supporting_acts).toEqual(supportingActs);
    });
  });

  // ==========================================================================
  // Unique constraint
  // ==========================================================================
  describe('unique constraint', () => {
    it('should enforce unique event_id', async () => {
      await createMetadataDirect(testEventId, { headliner: 'First' });

      await expect(
        createMetadataDirect(testEventId, { headliner: 'Second' })
      ).rejects.toThrow();
    });
  });
});
