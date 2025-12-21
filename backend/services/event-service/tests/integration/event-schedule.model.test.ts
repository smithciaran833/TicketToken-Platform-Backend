/**
 * EventScheduleModel Integration Tests
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
import { EventScheduleModel, IEventSchedule } from '../../src/models/event-schedule.model';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('EventScheduleModel', () => {
  let context: TestContext;
  let scheduleModel: EventScheduleModel;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    scheduleModel = new EventScheduleModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);

    // Create a test event for schedule tests
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Schedule Test Event', `schedule-test-${testEventId.slice(0,8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  // Helper to create schedule directly
  async function createScheduleDirect(overrides: Partial<IEventSchedule> = {}): Promise<any> {
    const id = overrides.id || uuidv4();
    const startsAt = overrides.starts_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = overrides.ends_at || new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO event_schedules (
        id, tenant_id, event_id, starts_at, ends_at, doors_open_at, timezone, status,
        is_recurring, capacity_override, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id,
        overrides.tenant_id || TEST_TENANT_ID,
        overrides.event_id || testEventId,
        startsAt,
        endsAt,
        overrides.doors_open_at || null,
        overrides.timezone || 'UTC',
        overrides.status || 'SCHEDULED',
        overrides.is_recurring ?? false,
        overrides.capacity_override || null,
        overrides.notes || null,
      ]
    );

    return result.rows[0];
  }

  // ==========================================================================
  // findById
  // ==========================================================================
  describe('findById', () => {
    it('should find schedule by id', async () => {
      const created = await createScheduleDirect();

      const schedule = await scheduleModel.findById(created.id);

      expect(schedule).toBeDefined();
      expect(schedule!.id).toBe(created.id);
      expect(schedule!.event_id).toBe(testEventId);
    });

    it('should return null for non-existent schedule', async () => {
      const schedule = await scheduleModel.findById(uuidv4());

      expect(schedule).toBeNull();
    });

    it('should find schedule even with deleted_at set (no soft delete filter)', async () => {
      const created = await createScheduleDirect();
      await pool.query('UPDATE event_schedules SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const schedule = await scheduleModel.findById(created.id);

      // Model overrides findById to NOT check deleted_at
      expect(schedule).toBeDefined();
      expect(schedule!.id).toBe(created.id);
    });
  });

  // ==========================================================================
  // findByEventId
  // ==========================================================================
  describe('findByEventId', () => {
    it('should find all schedules for an event', async () => {
      const startsAt1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const startsAt2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: startsAt1 });
      await createScheduleDirect({ starts_at: startsAt2 });

      const schedules = await scheduleModel.findByEventId(testEventId);

      expect(schedules.length).toBe(2);
    });

    it('should order schedules by starts_at ascending', async () => {
      const laterDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const earlierDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: laterDate });
      await createScheduleDirect({ starts_at: earlierDate });

      const schedules = await scheduleModel.findByEventId(testEventId);

      expect(new Date(schedules[0].starts_at).getTime()).toBeLessThan(
        new Date(schedules[1].starts_at).getTime()
      );
    });

    it('should filter by tenant_id when provided', async () => {
      const otherTenantId = uuidv4();
      await pool.query(
        `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
        [otherTenantId, 'Other Tenant', `other-tenant-${otherTenantId.slice(0,8)}`]
      );

      await createScheduleDirect({ tenant_id: TEST_TENANT_ID });

      const schedules = await scheduleModel.findByEventId(testEventId, otherTenantId);

      expect(schedules.length).toBe(0);
    });

    it('should return empty array for event with no schedules', async () => {
      const schedules = await scheduleModel.findByEventId(uuidv4());

      expect(schedules).toEqual([]);
    });
  });

  // ==========================================================================
  // findUpcomingSchedules
  // ==========================================================================
  describe('findUpcomingSchedules', () => {
    it('should return only future schedules with valid status', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: futureDate, status: 'SCHEDULED' });
      await createScheduleDirect({ starts_at: pastDate, status: 'SCHEDULED' });
      await createScheduleDirect({ starts_at: futureDate, status: 'CANCELLED' });

      const schedules = await scheduleModel.findUpcomingSchedules(testEventId);

      expect(schedules.length).toBe(1);
      expect(schedules[0].status).toBe('SCHEDULED');
    });

    it('should include CONFIRMED status', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: futureDate, status: 'CONFIRMED' });

      const schedules = await scheduleModel.findUpcomingSchedules(testEventId);

      expect(schedules.length).toBe(1);
      expect(schedules[0].status).toBe('CONFIRMED');
    });

    it('should order by starts_at ascending', async () => {
      const laterDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const earlierDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: laterDate, status: 'SCHEDULED' });
      await createScheduleDirect({ starts_at: earlierDate, status: 'SCHEDULED' });

      const schedules = await scheduleModel.findUpcomingSchedules(testEventId);

      expect(new Date(schedules[0].starts_at).getTime()).toBeLessThan(
        new Date(schedules[1].starts_at).getTime()
      );
    });
  });

  // ==========================================================================
  // findSchedulesByDateRange
  // ==========================================================================
  describe('findSchedulesByDateRange', () => {
    it('should return schedules within date range', async () => {
      const inRangeDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const outOfRangeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: inRangeDate });
      await createScheduleDirect({ starts_at: outOfRangeDate });

      const startDate = new Date(Date.now());
      const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const schedules = await scheduleModel.findSchedulesByDateRange(startDate, endDate);

      expect(schedules.length).toBe(1);
    });

    it('should order results by starts_at ascending', async () => {
      const date1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const date2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: date1 });
      await createScheduleDirect({ starts_at: date2 });

      const startDate = new Date(Date.now());
      const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const schedules = await scheduleModel.findSchedulesByDateRange(startDate, endDate);

      expect(new Date(schedules[0].starts_at).getTime()).toBeLessThan(
        new Date(schedules[1].starts_at).getTime()
      );
    });
  });

  // ==========================================================================
  // getNextSchedule
  // ==========================================================================
  describe('getNextSchedule', () => {
    it('should return the next upcoming schedule', async () => {
      const earlierDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const laterDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await createScheduleDirect({ starts_at: laterDate, status: 'SCHEDULED' });
      await createScheduleDirect({ starts_at: earlierDate, status: 'SCHEDULED' });

      const nextSchedule = await scheduleModel.getNextSchedule(testEventId);

      expect(nextSchedule).toBeDefined();
      expect(new Date(nextSchedule!.starts_at).getTime()).toBe(earlierDate.getTime());
    });

    it('should return null when no upcoming schedules', async () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await createScheduleDirect({ starts_at: pastDate, status: 'SCHEDULED' });

      const nextSchedule = await scheduleModel.getNextSchedule(testEventId);

      expect(nextSchedule).toBeNull();
    });

    it('should exclude cancelled schedules', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createScheduleDirect({ starts_at: futureDate, status: 'CANCELLED' });

      const nextSchedule = await scheduleModel.getNextSchedule(testEventId);

      expect(nextSchedule).toBeNull();
    });
  });

  // ==========================================================================
  // updateWithTenant
  // ==========================================================================
  describe('updateWithTenant', () => {
    it('should update schedule when tenant matches', async () => {
      const created = await createScheduleDirect({ notes: 'Original notes' });

      const updated = await scheduleModel.updateWithTenant(created.id, TEST_TENANT_ID, {
        notes: 'Updated notes',
        status: 'CONFIRMED',
      });

      expect(updated).toBeDefined();
      expect(updated!.notes).toBe('Updated notes');
      expect(updated!.status).toBe('CONFIRMED');

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_schedules WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].notes).toBe('Updated notes');
    });

    it('should return null when tenant does not match', async () => {
      const created = await createScheduleDirect();
      const wrongTenantId = uuidv4();

      const updated = await scheduleModel.updateWithTenant(created.id, wrongTenantId, {
        notes: 'Should not update',
      });

      expect(updated).toBeNull();

      // Verify database unchanged
      const dbResult = await pool.query('SELECT notes FROM event_schedules WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].notes).toBeNull();
    });

    it('should update updated_at timestamp', async () => {
      const created = await createScheduleDirect();
      const originalUpdatedAt = created.updated_at;

      await new Promise(resolve => setTimeout(resolve, 50));

      const updated = await scheduleModel.updateWithTenant(created.id, TEST_TENANT_ID, {
        notes: 'Trigger update',
      });

      expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });

  // ==========================================================================
  // create (inherited from BaseModel)
  // ==========================================================================
  describe('create', () => {
    it('should create a new schedule', async () => {
      const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);

      const schedule = await scheduleModel.create({
        tenant_id: TEST_TENANT_ID,
        event_id: testEventId,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: 'America/New_York',
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.event_id).toBe(testEventId);
      expect(schedule.timezone).toBe('America/New_York');

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_schedules WHERE id = $1', [schedule.id]);
      expect(dbResult.rows.length).toBe(1);
    });
  });

  // ==========================================================================
  // Status constraints
  // ==========================================================================
  describe('status constraints', () => {
    it('should accept all valid status values', async () => {
      const validStatuses = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED'];

      for (const status of validStatuses) {
        const schedule = await createScheduleDirect({ status: status as any });
        expect(schedule.status).toBe(status);
        await pool.query('DELETE FROM event_schedules WHERE id = $1', [schedule.id]);
      }
    });
  });
});
