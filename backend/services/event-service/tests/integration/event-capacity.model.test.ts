/**
 * EventCapacityModel Integration Tests
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
import { EventCapacityModel, IEventCapacity } from '../../src/models/event-capacity.model';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('EventCapacityModel', () => {
  let context: TestContext;
  let capacityModel: EventCapacityModel;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    capacityModel = new EventCapacityModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);

    // Create a test event for capacity tests
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Capacity Test Event', `capacity-test-${testEventId.slice(0,8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  // Helper to create capacity directly
  async function createCapacityDirect(overrides: Partial<IEventCapacity> = {}): Promise<any> {
    const id = overrides.id || uuidv4();
    const sectionName = overrides.section_name || `Section-${id.slice(0,8)}`;

    const result = await pool.query(
      `INSERT INTO event_capacity (
        id, tenant_id, event_id, schedule_id, section_name, section_code, tier,
        total_capacity, available_capacity, reserved_capacity, buffer_capacity,
        sold_count, pending_count, is_active, is_visible, minimum_purchase, maximum_purchase
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        id,
        overrides.tenant_id || TEST_TENANT_ID,
        overrides.event_id || testEventId,
        overrides.schedule_id || null,
        sectionName,
        overrides.section_code || null,
        overrides.tier || null,
        overrides.total_capacity ?? 100,
        overrides.available_capacity ?? overrides.total_capacity ?? 100,
        overrides.reserved_capacity ?? 0,
        overrides.buffer_capacity ?? 0,
        overrides.sold_count ?? 0,
        overrides.pending_count ?? 0,
        overrides.is_active ?? true,
        overrides.is_visible ?? true,
        overrides.minimum_purchase ?? 1,
        overrides.maximum_purchase || null,
      ]
    );

    return result.rows[0];
  }

  // Helper to create schedule for tests
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

  // ==========================================================================
  // findById (inherited from BaseModel)
  // ==========================================================================
  describe('findById', () => {
    it('should find capacity by id', async () => {
      const created = await createCapacityDirect({ section_name: 'VIP Section' });

      const capacity = await capacityModel.findById(created.id);

      expect(capacity).toBeDefined();
      expect(capacity!.id).toBe(created.id);
      expect(capacity!.section_name).toBe('VIP Section');
    });

    it('should return null for non-existent capacity', async () => {
      const capacity = await capacityModel.findById(uuidv4());

      expect(capacity).toBeNull();
    });

    it('should not find soft-deleted capacity', async () => {
      const created = await createCapacityDirect();
      await pool.query('UPDATE event_capacity SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const capacity = await capacityModel.findById(created.id);

      expect(capacity).toBeNull();
    });
  });

  // ==========================================================================
  // findByEventId
  // ==========================================================================
  describe('findByEventId', () => {
    it('should find all active capacities for an event', async () => {
      await createCapacityDirect({ section_name: 'Section A', is_active: true });
      await createCapacityDirect({ section_name: 'Section B', is_active: true });
      await createCapacityDirect({ section_name: 'Section C', is_active: false });

      const capacities = await capacityModel.findByEventId(testEventId);

      expect(capacities.length).toBe(2);
    });

    it('should order by section_name ascending', async () => {
      await createCapacityDirect({ section_name: 'Zebra Section' });
      await createCapacityDirect({ section_name: 'Alpha Section' });

      const capacities = await capacityModel.findByEventId(testEventId);

      expect(capacities[0].section_name).toBe('Alpha Section');
      expect(capacities[1].section_name).toBe('Zebra Section');
    });

    it('should return empty array for event with no capacities', async () => {
      const capacities = await capacityModel.findByEventId(uuidv4());

      expect(capacities).toEqual([]);
    });
  });

  // ==========================================================================
  // findByScheduleId
  // ==========================================================================
  describe('findByScheduleId', () => {
    it('should find capacities for specific schedule', async () => {
      const scheduleId = await createTestSchedule();

      await createCapacityDirect({ section_name: 'Schedule Section', schedule_id: scheduleId });
      await createCapacityDirect({ section_name: 'No Schedule Section', schedule_id: null });

      const capacities = await capacityModel.findByScheduleId(scheduleId);

      expect(capacities.length).toBe(1);
      expect(capacities[0].section_name).toBe('Schedule Section');
    });

    it('should only return active capacities', async () => {
      const scheduleId = await createTestSchedule();

      await createCapacityDirect({ section_name: 'Active', schedule_id: scheduleId, is_active: true });
      await createCapacityDirect({ section_name: 'Inactive', schedule_id: scheduleId, is_active: false });

      const capacities = await capacityModel.findByScheduleId(scheduleId);

      expect(capacities.length).toBe(1);
      expect(capacities[0].section_name).toBe('Active');
    });
  });

  // ==========================================================================
  // getTotalCapacity
  // ==========================================================================
  describe('getTotalCapacity', () => {
    it('should sum total_capacity for all active sections', async () => {
      await createCapacityDirect({ section_name: 'Section A', total_capacity: 100, is_active: true });
      await createCapacityDirect({ section_name: 'Section B', total_capacity: 200, is_active: true });
      await createCapacityDirect({ section_name: 'Section C', total_capacity: 50, is_active: false });

      const total = await capacityModel.getTotalCapacity(testEventId);

      expect(total).toBe(300);
    });

    it('should filter by schedule_id when provided', async () => {
      const scheduleId = await createTestSchedule();

      await createCapacityDirect({ section_name: 'With Schedule', total_capacity: 100, schedule_id: scheduleId });
      await createCapacityDirect({ section_name: 'No Schedule', total_capacity: 200, schedule_id: null });

      const total = await capacityModel.getTotalCapacity(testEventId, scheduleId);

      expect(total).toBe(100);
    });

    it('should return 0 for event with no capacities', async () => {
      const total = await capacityModel.getTotalCapacity(uuidv4());

      expect(total).toBe(0);
    });
  });

  // ==========================================================================
  // getAvailableCapacity
  // ==========================================================================
  describe('getAvailableCapacity', () => {
    it('should sum available_capacity for all active sections', async () => {
      await createCapacityDirect({ section_name: 'Section A', available_capacity: 80, is_active: true });
      await createCapacityDirect({ section_name: 'Section B', available_capacity: 150, is_active: true });
      await createCapacityDirect({ section_name: 'Section C', available_capacity: 50, is_active: false });

      const available = await capacityModel.getAvailableCapacity(testEventId);

      expect(available).toBe(230);
    });

    it('should filter by schedule_id when provided', async () => {
      const scheduleId = await createTestSchedule();

      await createCapacityDirect({ section_name: 'With Schedule', available_capacity: 75, schedule_id: scheduleId });
      await createCapacityDirect({ section_name: 'No Schedule', available_capacity: 100, schedule_id: null });

      const available = await capacityModel.getAvailableCapacity(testEventId, scheduleId);

      expect(available).toBe(75);
    });

    it('should return 0 for event with no capacities', async () => {
      const available = await capacityModel.getAvailableCapacity(uuidv4());

      expect(available).toBe(0);
    });
  });

  // ==========================================================================
  // updateSoldCount
  // ==========================================================================
  describe('updateSoldCount', () => {
    it('should increment sold_count by quantity', async () => {
      const created = await createCapacityDirect({ sold_count: 10 });

      await capacityModel.updateSoldCount(created.id, 5);

      const dbResult = await pool.query('SELECT sold_count FROM event_capacity WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].sold_count).toBe(15);
    });

    it('should handle multiple increments', async () => {
      const created = await createCapacityDirect({ sold_count: 0 });

      await capacityModel.updateSoldCount(created.id, 3);
      await capacityModel.updateSoldCount(created.id, 7);

      const dbResult = await pool.query('SELECT sold_count FROM event_capacity WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].sold_count).toBe(10);
    });
  });

  // ==========================================================================
  // updatePendingCount
  // ==========================================================================
  describe('updatePendingCount', () => {
    it('should increment pending_count by quantity', async () => {
      const created = await createCapacityDirect({ pending_count: 5 });

      await capacityModel.updatePendingCount(created.id, 3);

      const dbResult = await pool.query('SELECT pending_count FROM event_capacity WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].pending_count).toBe(8);
    });
  });

  // ==========================================================================
  // decrementPendingCount
  // ==========================================================================
  describe('decrementPendingCount', () => {
    it('should decrement pending_count by quantity', async () => {
      const created = await createCapacityDirect({ pending_count: 10 });

      await capacityModel.decrementPendingCount(created.id, 4);

      const dbResult = await pool.query('SELECT pending_count FROM event_capacity WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].pending_count).toBe(6);
    });

    it('should handle decrement to zero', async () => {
      const created = await createCapacityDirect({ pending_count: 5 });

      await capacityModel.decrementPendingCount(created.id, 5);

      const dbResult = await pool.query('SELECT pending_count FROM event_capacity WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].pending_count).toBe(0);
    });
  });

  // ==========================================================================
  // create (inherited from BaseModel)
  // ==========================================================================
  describe('create', () => {
    it('should create a new capacity record', async () => {
      const capacity = await capacityModel.create({
        tenant_id: TEST_TENANT_ID,
        event_id: testEventId,
        section_name: 'New Section',
        total_capacity: 500,
        available_capacity: 500,
      });

      expect(capacity.id).toBeDefined();
      expect(capacity.section_name).toBe('New Section');
      expect(capacity.total_capacity).toBe(500);

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_capacity WHERE id = $1', [capacity.id]);
      expect(dbResult.rows.length).toBe(1);
    });

    it('should set default values', async () => {
      const capacity = await capacityModel.create({
        tenant_id: TEST_TENANT_ID,
        event_id: testEventId,
        section_name: 'Defaults Section',
        total_capacity: 100,
        available_capacity: 100,
      });

      const dbResult = await pool.query('SELECT * FROM event_capacity WHERE id = $1', [capacity.id]);
      expect(dbResult.rows[0].is_active).toBe(true);
      expect(dbResult.rows[0].is_visible).toBe(true);
      expect(dbResult.rows[0].minimum_purchase).toBe(1);
      expect(dbResult.rows[0].sold_count).toBe(0);
      expect(dbResult.rows[0].pending_count).toBe(0);
    });
  });

  // ==========================================================================
  // update (inherited from BaseModel)
  // ==========================================================================
  describe('update', () => {
    it('should update capacity fields', async () => {
      const created = await createCapacityDirect({ section_name: 'Original' });

      const updated = await capacityModel.update(created.id, {
        section_name: 'Updated Section',
        total_capacity: 200,
      });

      expect(updated!.section_name).toBe('Updated Section');
      expect(updated!.total_capacity).toBe(200);

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_capacity WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].section_name).toBe('Updated Section');
    });
  });

  // ==========================================================================
  // Unique constraint
  // ==========================================================================
  describe('unique constraint', () => {
    it('should enforce unique event_id + section_name + schedule_id', async () => {
      await createCapacityDirect({ section_name: 'Unique Section', schedule_id: null });

      await expect(
        createCapacityDirect({ section_name: 'Unique Section', schedule_id: null })
      ).rejects.toThrow();
    });

    it('should allow same section_name with different schedule_id', async () => {
      const scheduleId = await createTestSchedule();

      await createCapacityDirect({ section_name: 'Same Name', schedule_id: null });
      const second = await createCapacityDirect({ section_name: 'Same Name', schedule_id: scheduleId });

      expect(second.id).toBeDefined();
    });
  });

  // ==========================================================================
  // JSONB fields
  // ==========================================================================
  describe('JSONB fields', () => {
    it('should handle locked_price_data', async () => {
      const lockedPriceData = {
        pricing_id: uuidv4(),
        locked_price: 99.99,
        locked_at: new Date().toISOString(),
        service_fee: 5.00,
      };

      const id = uuidv4();
      await pool.query(
        `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, locked_price_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, TEST_TENANT_ID, testEventId, `JSONB-${id.slice(0,8)}`, 100, 100, JSON.stringify(lockedPriceData)]
      );

      const capacity = await capacityModel.findById(id);

      expect(capacity!.locked_price_data).toBeDefined();
      expect(capacity!.locked_price_data.locked_price).toBe(99.99);
    });

    it('should handle seat_map JSONB', async () => {
      const seatMap = {
        rows: ['A', 'B', 'C'],
        seatsPerRow: 10,
      };

      const id = uuidv4();
      await pool.query(
        `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, seat_map)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, TEST_TENANT_ID, testEventId, `SeatMap-${id.slice(0,8)}`, 100, 100, JSON.stringify(seatMap)]
      );

      const capacity = await capacityModel.findById(id);

      expect(capacity!.seat_map).toEqual(seatMap);
    });
  });
});
