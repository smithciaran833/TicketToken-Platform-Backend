/**
 * Schedule Controller Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import * as scheduleController from '../../src/controllers/schedule.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Schedule Controller', () => {
  let context: TestContext;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Test Event', `test-${testEventId.slice(0, 8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  function createMockRequest(overrides: any = {}): any {
    return {
      params: overrides.params || {},
      body: overrides.body || {},
      headers: overrides.headers || { authorization: `Bearer ${generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' })}` },
      tenantId: TEST_TENANT_ID,
      container: (context.app as any).container,
      log: { error: jest.fn() },
    };
  }

  function createMockReply(): any {
    const reply: any = {
      statusCode: 200,
      sentData: null,
      status: jest.fn((code: number) => { reply.statusCode = code; return reply; }),
      send: jest.fn((data: any) => { reply.sentData = data; return reply; }),
    };
    return reply;
  }

  async function createScheduleDirect(overrides: any = {}) {
    const scheduleId = uuidv4();
    const startsAt = overrides.starts_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = overrides.ends_at || new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO event_schedules (id, tenant_id, event_id, starts_at, ends_at, timezone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [scheduleId, TEST_TENANT_ID, overrides.event_id || testEventId, startsAt, endsAt, overrides.timezone || 'UTC', 'SCHEDULED']
    );
    return { id: scheduleId, starts_at: startsAt };
  }

  describe('getSchedules', () => {
    it('should return schedules for event', async () => {
      await createScheduleDirect();
      await createScheduleDirect({ starts_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });

      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await scheduleController.getSchedules(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.data.schedules.length).toBe(2);
    });

    it('should return 404 for non-existent event', async () => {
      const request = createMockRequest({ params: { eventId: uuidv4() } });
      const reply = createMockReply();

      await scheduleController.getSchedules(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('createSchedule', () => {
    it('should create schedule', async () => {
      const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);

      const request = createMockRequest({
        params: { eventId: testEventId },
        body: { starts_at: startsAt, ends_at: endsAt, timezone: 'America/New_York' },
      });
      const reply = createMockReply();

      await scheduleController.createSchedule(request, reply);

      expect(reply.statusCode).toBe(201);
      expect(reply.sentData.data.timezone).toBe('America/New_York');
    });

    it('should return 422 for invalid data', async () => {
      const request = createMockRequest({
        params: { eventId: testEventId },
        body: { starts_at: 'invalid' },
      });
      const reply = createMockReply();

      await scheduleController.createSchedule(request, reply);

      expect(reply.statusCode).toBe(422);
    });
  });

  describe('getSchedule', () => {
    it('should return schedule by id', async () => {
      const schedule = await createScheduleDirect();

      const request = createMockRequest({ params: { eventId: testEventId, scheduleId: schedule.id } });
      const reply = createMockReply();

      await scheduleController.getSchedule(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.data.id).toBe(schedule.id);
    });

    it('should return 404 for non-existent schedule', async () => {
      const request = createMockRequest({ params: { eventId: testEventId, scheduleId: uuidv4() } });
      const reply = createMockReply();

      await scheduleController.getSchedule(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('updateSchedule', () => {
    it('should update schedule', async () => {
      const schedule = await createScheduleDirect({ timezone: 'UTC' });

      const request = createMockRequest({
        params: { eventId: testEventId, scheduleId: schedule.id },
        body: { timezone: 'America/Chicago' },
      });
      const reply = createMockReply();

      await scheduleController.updateSchedule(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.data.timezone).toBe('America/Chicago');
    });
  });

  describe('getUpcomingSchedules', () => {
    it('should return only upcoming schedules', async () => {
      // Future schedule
      await createScheduleDirect({ starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await scheduleController.getUpcomingSchedules(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.data.schedules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getNextSchedule', () => {
    it('should return next schedule', async () => {
      await createScheduleDirect({ starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await scheduleController.getNextSchedule(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.data).toBeDefined();
    });

    it('should return 404 when no upcoming schedules', async () => {
      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await scheduleController.getNextSchedule(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });
});
