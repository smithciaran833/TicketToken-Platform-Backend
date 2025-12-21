/**
 * CancellationService Integration Tests
 * Tests: cancelEvent, validateCancellationPermission
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, db, pool, redis } from './setup';
import { CancellationService } from '../../src/services/cancellation.service';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('CancellationService', () => {
  let context: TestContext;
  let service: CancellationService;

  beforeAll(async () => {
    context = await setupTestApp();
    service = new CancellationService(db);
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  async function createEvent(overrides: any = {}) {
    const eventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by, cancellation_deadline_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eventId, overrides.tenant_id || TEST_TENANT_ID, TEST_VENUE_ID, overrides.name || 'Test Event',
       `test-${eventId.slice(0, 8)}`, overrides.status || 'PUBLISHED', 'single',
       overrides.created_by || TEST_USER_ID, overrides.cancellation_deadline_hours ?? 24]
    );
    return eventId;
  }

  async function createSchedule(eventId: string, startsAt: Date) {
    const scheduleId = uuidv4();
    await pool.query(
      `INSERT INTO event_schedules (id, tenant_id, event_id, starts_at, ends_at, timezone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [scheduleId, TEST_TENANT_ID, eventId, startsAt, new Date(startsAt.getTime() + 4 * 3600000), 'UTC', 'SCHEDULED']
    );
    return scheduleId;
  }

  describe('cancelEvent', () => {
    it('should cancel event and update status', async () => {
      const eventId = await createEvent();
      const result = await service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID,
        cancellation_reason: 'Weather'
      }, TEST_TENANT_ID);

      expect(result.status).toBe('CANCELLED');
      expect(result.cancellation_reason).toBe('Weather');
      expect(result.trigger_refunds).toBe(true);

      const dbEvent = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
      expect(dbEvent.rows[0].status).toBe('CANCELLED');
    });

    it('should throw for non-existent event', async () => {
      await expect(service.cancelEvent({
        event_id: uuidv4(),
        cancelled_by: TEST_USER_ID,
        cancellation_reason: 'Test'
      }, TEST_TENANT_ID)).rejects.toThrow('Event not found');
    });

    it('should throw for already cancelled event', async () => {
      const eventId = await createEvent({ status: 'CANCELLED' });
      await expect(service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID,
        cancellation_reason: 'Test'
      }, TEST_TENANT_ID)).rejects.toThrow('already cancelled');
    });

    it('should throw for soft-deleted event', async () => {
      const eventId = await createEvent();
      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [eventId]);
      await expect(service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID,
        cancellation_reason: 'Test'
      }, TEST_TENANT_ID)).rejects.toThrow('Event not found');
    });

    it('should enforce cancellation deadline for non-creator', async () => {
      const eventId = await createEvent({ cancellation_deadline_hours: 48, created_by: uuidv4() });
      await createSchedule(eventId, new Date(Date.now() + 1 * 3600000)); // 1 hour from now

      await expect(service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID, // different user
        cancellation_reason: 'Too late'
      }, TEST_TENANT_ID)).rejects.toThrow('deadline');
    });

    it('should allow creator to bypass deadline', async () => {
      const eventId = await createEvent({ cancellation_deadline_hours: 48, created_by: TEST_USER_ID });
      await createSchedule(eventId, new Date(Date.now() + 1 * 3600000));

      const result = await service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID, // same as creator
        cancellation_reason: 'Creator override'
      }, TEST_TENANT_ID);

      expect(result.status).toBe('CANCELLED');
    });

    it('should respect trigger_refunds parameter', async () => {
      const eventId = await createEvent();
      const result = await service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID,
        cancellation_reason: 'Test',
        trigger_refunds: false
      }, TEST_TENANT_ID);

      expect(result.trigger_refunds).toBe(false);
    });

    it('should create audit log entry', async () => {
      const eventId = await createEvent();
      await service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID,
        cancellation_reason: 'Audit test'
      }, TEST_TENANT_ID);

      const audit = await pool.query(
        `SELECT * FROM audit_logs WHERE entity_id = $1 AND action = 'CANCEL'`,
        [eventId]
      );
      expect(audit.rows.length).toBe(1);
      expect(audit.rows[0].actor_id).toBe(TEST_USER_ID);
    });

    it('should handle different tenant isolation', async () => {
      const eventId = await createEvent({ tenant_id: TEST_TENANT_ID });
      const otherTenant = uuidv4();

      await expect(service.cancelEvent({
        event_id: eventId,
        cancelled_by: TEST_USER_ID,
        cancellation_reason: 'Wrong tenant'
      }, otherTenant)).rejects.toThrow('Event not found');
    });
  });

  describe('validateCancellationPermission', () => {
    it('should return true for event creator', async () => {
      const eventId = await createEvent({ created_by: TEST_USER_ID });
      const result = await service.validateCancellationPermission(eventId, TEST_USER_ID, TEST_TENANT_ID);
      expect(result).toBe(true);
    });

    it('should return false for non-creator', async () => {
      const eventId = await createEvent({ created_by: uuidv4() });
      const result = await service.validateCancellationPermission(eventId, TEST_USER_ID, TEST_TENANT_ID);
      expect(result).toBe(false);
    });

    it('should return false for non-existent event', async () => {
      const result = await service.validateCancellationPermission(uuidv4(), TEST_USER_ID, TEST_TENANT_ID);
      expect(result).toBe(false);
    });

    it('should return false for deleted event', async () => {
      const eventId = await createEvent({ created_by: TEST_USER_ID });
      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [eventId]);
      const result = await service.validateCancellationPermission(eventId, TEST_USER_ID, TEST_TENANT_ID);
      expect(result).toBe(false);
    });
  });
});
