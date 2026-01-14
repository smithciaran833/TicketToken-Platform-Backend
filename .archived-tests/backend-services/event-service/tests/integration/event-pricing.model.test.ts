/**
 * EventPricingModel Integration Tests
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
import { EventPricingModel, IEventPricing } from '../../src/models/event-pricing.model';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('EventPricingModel', () => {
  let context: TestContext;
  let pricingModel: EventPricingModel;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    pricingModel = new EventPricingModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);

    // Create a test event for pricing tests
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Pricing Test Event', `pricing-test-${testEventId.slice(0,8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  // Helper to create pricing directly
  async function createPricingDirect(overrides: Partial<IEventPricing> = {}): Promise<any> {
    const id = overrides.id || uuidv4();

    const result = await pool.query(
      `INSERT INTO event_pricing (
        id, tenant_id, event_id, schedule_id, capacity_id, name, description, tier,
        base_price, service_fee, facility_fee, tax_rate, is_dynamic, current_price,
        early_bird_price, early_bird_ends_at, last_minute_price, last_minute_starts_at,
        currency, sales_start_at, sales_end_at, max_per_order, max_per_customer,
        is_active, is_visible, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        id,
        TEST_TENANT_ID,
        overrides.event_id || testEventId,
        overrides.schedule_id || null,
        overrides.capacity_id || null,
        overrides.name || 'General Admission',
        overrides.description || null,
        overrides.tier || null,
        overrides.base_price ?? 50.00,
        overrides.service_fee ?? 0,
        overrides.facility_fee ?? 0,
        overrides.tax_rate ?? 0,
        overrides.is_dynamic ?? false,
        overrides.current_price || null,
        overrides.early_bird_price || null,
        overrides.early_bird_ends_at || null,
        overrides.last_minute_price || null,
        overrides.last_minute_starts_at || null,
        overrides.currency || 'USD',
        overrides.sales_start_at || null,
        overrides.sales_end_at || null,
        overrides.max_per_order || null,
        overrides.max_per_customer || null,
        overrides.is_active ?? true,
        overrides.is_visible ?? true,
        overrides.display_order ?? 0,
      ]
    );

    return result.rows[0];
  }

  // Helper to create schedule
  async function createTestSchedule(): Promise<string> {
    const scheduleId = uuidv4();
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO event_schedules (id, tenant_id, event_id, starts_at, ends_at, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [scheduleId, TEST_TENANT_ID, testEventId, startsAt, endsAt, 'UTC']
    );

    return scheduleId;
  }

  // Helper to create capacity
  async function createTestCapacity(): Promise<string> {
    const capacityId = uuidv4();

    await pool.query(
      `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [capacityId, TEST_TENANT_ID, testEventId, `Section-${capacityId.slice(0,8)}`, 100, 100]
    );

    return capacityId;
  }

  // ==========================================================================
  // findById (inherited from BaseModel)
  // ==========================================================================
  describe('findById', () => {
    it('should find pricing by id', async () => {
      const created = await createPricingDirect({ name: 'VIP Ticket' });

      const pricing = await pricingModel.findById(created.id);

      expect(pricing).toBeDefined();
      expect(pricing!.id).toBe(created.id);
      expect(pricing!.name).toBe('VIP Ticket');
    });

    it('should return null for non-existent pricing', async () => {
      const pricing = await pricingModel.findById(uuidv4());

      expect(pricing).toBeNull();
    });

    it('should not find soft-deleted pricing', async () => {
      const created = await createPricingDirect();
      await pool.query('UPDATE event_pricing SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const pricing = await pricingModel.findById(created.id);

      expect(pricing).toBeNull();
    });
  });

  // ==========================================================================
  // findByEventId
  // ==========================================================================
  describe('findByEventId', () => {
    it('should find all active pricing for an event', async () => {
      await createPricingDirect({ name: 'Tier 1', is_active: true, display_order: 1 });
      await createPricingDirect({ name: 'Tier 2', is_active: true, display_order: 2 });
      await createPricingDirect({ name: 'Tier 3', is_active: false });

      const pricing = await pricingModel.findByEventId(testEventId);

      expect(pricing.length).toBe(2);
    });

    it('should order by display_order then base_price', async () => {
      await createPricingDirect({ name: 'Expensive', base_price: 100, display_order: 1 });
      await createPricingDirect({ name: 'Cheap', base_price: 25, display_order: 1 });
      await createPricingDirect({ name: 'First', base_price: 50, display_order: 0 });

      const pricing = await pricingModel.findByEventId(testEventId);

      expect(pricing[0].name).toBe('First');
      expect(pricing[1].name).toBe('Cheap');
      expect(pricing[2].name).toBe('Expensive');
    });

    it('should return empty array for event with no pricing', async () => {
      const pricing = await pricingModel.findByEventId(uuidv4());

      expect(pricing).toEqual([]);
    });
  });

  // ==========================================================================
  // findByScheduleId
  // ==========================================================================
  describe('findByScheduleId', () => {
    it('should find pricing for specific schedule', async () => {
      const scheduleId = await createTestSchedule();

      await createPricingDirect({ name: 'Schedule Pricing', schedule_id: scheduleId });
      await createPricingDirect({ name: 'No Schedule', schedule_id: null });

      const pricing = await pricingModel.findByScheduleId(scheduleId);

      expect(pricing.length).toBe(1);
      expect(pricing[0].name).toBe('Schedule Pricing');
    });

    it('should only return active pricing', async () => {
      const scheduleId = await createTestSchedule();

      await createPricingDirect({ name: 'Active', schedule_id: scheduleId, is_active: true });
      await createPricingDirect({ name: 'Inactive', schedule_id: scheduleId, is_active: false });

      const pricing = await pricingModel.findByScheduleId(scheduleId);

      expect(pricing.length).toBe(1);
      expect(pricing[0].name).toBe('Active');
    });
  });

  // ==========================================================================
  // findByCapacityId
  // ==========================================================================
  describe('findByCapacityId', () => {
    it('should find pricing for specific capacity', async () => {
      const capacityId = await createTestCapacity();

      await createPricingDirect({ name: 'Capacity Pricing', capacity_id: capacityId, base_price: 75 });
      await createPricingDirect({ name: 'No Capacity', capacity_id: null });

      const pricing = await pricingModel.findByCapacityId(capacityId);

      expect(pricing.length).toBe(1);
      expect(pricing[0].name).toBe('Capacity Pricing');
    });

    it('should order by base_price ascending', async () => {
      const capacityId = await createTestCapacity();

      await createPricingDirect({ name: 'Expensive', capacity_id: capacityId, base_price: 100 });
      await createPricingDirect({ name: 'Cheap', capacity_id: capacityId, base_price: 25 });

      const pricing = await pricingModel.findByCapacityId(capacityId);

      expect(pricing[0].name).toBe('Cheap');
      expect(pricing[1].name).toBe('Expensive');
    });
  });

  // ==========================================================================
  // getActivePricing
  // ==========================================================================
  describe('getActivePricing', () => {
    it('should return active and visible pricing within sales window', async () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await createPricingDirect({
        name: 'Available',
        is_active: true,
        is_visible: true,
        sales_start_at: pastDate,
        sales_end_at: futureDate,
      });

      const pricing = await pricingModel.getActivePricing(testEventId);

      expect(pricing.length).toBe(1);
      expect(pricing[0].name).toBe('Available');
    });

    it('should exclude pricing where sales have not started', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await createPricingDirect({
        name: 'Not Yet',
        is_active: true,
        is_visible: true,
        sales_start_at: futureDate,
      });

      const pricing = await pricingModel.getActivePricing(testEventId);

      expect(pricing.length).toBe(0);
    });

    it('should exclude pricing where sales have ended', async () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      await createPricingDirect({
        name: 'Ended',
        is_active: true,
        is_visible: true,
        sales_end_at: pastDate,
      });

      const pricing = await pricingModel.getActivePricing(testEventId);

      expect(pricing.length).toBe(0);
    });

    it('should include pricing with null sales dates', async () => {
      await createPricingDirect({
        name: 'No Dates',
        is_active: true,
        is_visible: true,
        sales_start_at: null,
        sales_end_at: null,
      });

      const pricing = await pricingModel.getActivePricing(testEventId);

      expect(pricing.length).toBe(1);
    });

    it('should exclude inactive pricing', async () => {
      await createPricingDirect({ name: 'Inactive', is_active: false, is_visible: true });

      const pricing = await pricingModel.getActivePricing(testEventId);

      expect(pricing.length).toBe(0);
    });

    it('should exclude hidden pricing', async () => {
      await createPricingDirect({ name: 'Hidden', is_active: true, is_visible: false });

      const pricing = await pricingModel.getActivePricing(testEventId);

      expect(pricing.length).toBe(0);
    });
  });

  // ==========================================================================
  // calculateTotalPrice
  // ==========================================================================
  describe('calculateTotalPrice', () => {
    it('should calculate total with base price only', async () => {
      const created = await createPricingDirect({ base_price: 100.00 });

      const total = await pricingModel.calculateTotalPrice(created.id, 2);

      expect(total).toBe(200.00);
    });

    it('should include service fee', async () => {
      const created = await createPricingDirect({ base_price: 100.00, service_fee: 10.00 });

      const total = await pricingModel.calculateTotalPrice(created.id, 1);

      expect(total).toBe(110.00);
    });

    it('should include facility fee', async () => {
      const created = await createPricingDirect({ base_price: 100.00, facility_fee: 5.00 });

      const total = await pricingModel.calculateTotalPrice(created.id, 1);

      expect(total).toBe(105.00);
    });

    it('should apply tax rate', async () => {
      const created = await createPricingDirect({ base_price: 100.00, tax_rate: 0.10 });

      const total = await pricingModel.calculateTotalPrice(created.id, 1);

      expect(total).toBe(110.00);
    });

    it('should calculate with all fees and tax', async () => {
      const created = await createPricingDirect({
        base_price: 100.00,
        service_fee: 10.00,
        facility_fee: 5.00,
        tax_rate: 0.10,
      });

      // (100 + 10 + 5) * 1.10 = 126.50
      const total = await pricingModel.calculateTotalPrice(created.id, 1);

      expect(total).toBe(126.50);
    });

    it('should use current_price for dynamic pricing', async () => {
      const created = await createPricingDirect({
        base_price: 100.00,
        is_dynamic: true,
        current_price: 150.00,
      });

      const total = await pricingModel.calculateTotalPrice(created.id, 1);

      expect(total).toBe(150.00);
    });

    it('should multiply by quantity', async () => {
      const created = await createPricingDirect({
        base_price: 50.00,
        service_fee: 5.00,
        tax_rate: 0.08,
      });

      // (50 + 5) * 3 * 1.08 = 178.20
      const total = await pricingModel.calculateTotalPrice(created.id, 3);

      expect(total).toBe(178.2);
    });

    it('should return 0 for non-existent pricing', async () => {
      const total = await pricingModel.calculateTotalPrice(uuidv4(), 1);

      expect(total).toBe(0);
    });

    it('should default quantity to 1', async () => {
      const created = await createPricingDirect({ base_price: 75.00 });

      const total = await pricingModel.calculateTotalPrice(created.id);

      expect(total).toBe(75.00);
    });
  });

  // ==========================================================================
  // create (inherited from BaseModel)
  // ==========================================================================
  describe('create', () => {
    it('should create a new pricing record', async () => {
      const pricing = await pricingModel.create({
        tenant_id: TEST_TENANT_ID,
        event_id: testEventId,
        name: 'New Tier',
        base_price: 99.99,
      });

      expect(pricing.id).toBeDefined();
      expect(pricing.name).toBe('New Tier');
      expect(parseFloat(pricing.base_price)).toBe(99.99);

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_pricing WHERE id = $1', [pricing.id]);
      expect(dbResult.rows.length).toBe(1);
    });

    it('should set default values', async () => {
      const pricing = await pricingModel.create({
        tenant_id: TEST_TENANT_ID,
        event_id: testEventId,
        name: 'Defaults Tier',
        base_price: 50.00,
      });

      const dbResult = await pool.query('SELECT * FROM event_pricing WHERE id = $1', [pricing.id]);
      expect(dbResult.rows[0].is_active).toBe(true);
      expect(dbResult.rows[0].is_visible).toBe(true);
      expect(dbResult.rows[0].currency).toBe('USD');
      expect(parseFloat(dbResult.rows[0].service_fee)).toBe(0);
      expect(parseFloat(dbResult.rows[0].facility_fee)).toBe(0);
    });
  });

  // ==========================================================================
  // update (inherited from BaseModel)
  // ==========================================================================
  describe('update', () => {
    it('should update pricing fields', async () => {
      const created = await createPricingDirect({ name: 'Original', base_price: 50.00 });

      const updated = await pricingModel.update(created.id, {
        name: 'Updated Tier',
        base_price: 75.00,
      });

      expect(updated!.name).toBe('Updated Tier');
      expect(parseFloat(updated!.base_price as any)).toBe(75.00);

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_pricing WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].name).toBe('Updated Tier');
    });
  });
});
