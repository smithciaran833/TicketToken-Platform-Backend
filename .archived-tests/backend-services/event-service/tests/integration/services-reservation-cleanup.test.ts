/**
 * ReservationCleanupService Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, db, pool, redis } from './setup';
import { ReservationCleanupService } from '../../src/services/reservation-cleanup.service';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('ReservationCleanupService', () => {
  let context: TestContext;
  let service: ReservationCleanupService;

  beforeAll(async () => {
    context = await setupTestApp();
    service = new ReservationCleanupService(db, 1);
  }, 30000);

  afterAll(async () => {
    service.stop();
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
    service.stop();
  });

  async function createEventWithExpiredReservation() {
    const eventId = uuidv4();
    const capacityId = uuidv4();

    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Test', `test-${eventId.slice(0, 8)}`, 'PUBLISHED', 'single', TEST_USER_ID]
    );

    await pool.query(
      `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count, reserved_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [capacityId, TEST_TENANT_ID, eventId, 'GA', 100, 80, 20, 0, new Date(Date.now() - 60000)]
    );

    return { eventId, capacityId };
  }

  describe('start/stop', () => {
    it('should start and report running', () => {
      service.start();
      expect(service.getStatus().isRunning).toBe(true);
    });

    it('should stop and report not running', () => {
      service.start();
      service.stop();
      expect(service.getStatus().isRunning).toBe(false);
    });

    it('should not start twice', () => {
      service.start();
      service.start(); // Should warn but not crash
      expect(service.getStatus().isRunning).toBe(true);
    });
  });

  describe('triggerCleanup', () => {
    it('should release expired reservations manually', async () => {
      const { capacityId } = await createEventWithExpiredReservation();

      const released = await service.triggerCleanup();
      expect(released).toBe(20);

      const result = await pool.query('SELECT available_capacity, reserved_capacity FROM event_capacity WHERE id = $1', [capacityId]);
      expect(result.rows[0].available_capacity).toBe(100);
      expect(result.rows[0].reserved_capacity).toBe(0);
    });

    it('should return 0 when no expired reservations', async () => {
      const released = await service.triggerCleanup();
      expect(released).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return status object', () => {
      const status = service.getStatus();
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('intervalMinutes');
      expect(status.intervalMinutes).toBe(1);
    });
  });
});
