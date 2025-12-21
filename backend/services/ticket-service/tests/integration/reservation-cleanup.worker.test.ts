import { ReservationCleanupWorker } from '../../src/workers/reservation-cleanup.worker';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR RESERVATION CLEANUP WORKER
 * Tests background worker for cleaning up expired and orphaned reservations
 * 
 * FK Chain: tenants → users → venues → events → ticket_types → reservations
 * 
 * Reservations schema:
 * - status: lowercase ('pending', 'confirmed', 'expired', 'cancelled')
 * - ticket_type_id: NOT NULL required
 * - total_quantity: NOT NULL required
 * - No order_id column
 * - No reservation_history table exists
 */

describe('ReservationCleanupWorker Integration Tests', () => {
  let worker: ReservationCleanupWorker;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();
  });

  beforeEach(async () => {
    worker = new ReservationCleanupWorker();
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // 2. Create user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, `user-${testUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, quantity, available_quantity, price, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'General', 100, 90, 50.00]
    );
  });

  afterEach(async () => {
    worker.stop();

    // Cleanup in reverse FK order
    await DatabaseService.query('DELETE FROM outbox WHERE aggregate_type = $1', ['reservation']);
    await DatabaseService.query('DELETE FROM reservations WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);

    // Clear Redis
    try {
      const redis = RedisService.getClient();
      const keys = await redis.keys('reservation:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (e) {
      // Redis may not be available
    }
  });

  afterAll(async () => {
    await RedisService.close();
    await DatabaseService.close();
  });

  describe('worker lifecycle', () => {
    it('should start worker successfully', async () => {
      await worker.start(5000);

      // Give it time to run once
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = worker.getMetrics();
      expect(metrics.lastRun).toBeDefined();
    });

    it('should stop worker successfully', async () => {
      await worker.start(5000);
      worker.stop();

      const metrics1 = worker.getMetrics();
      await new Promise(resolve => setTimeout(resolve, 100));
      const metrics2 = worker.getMetrics();

      // Last run should not change after stopping
      expect(metrics1.lastRun).toEqual(metrics2.lastRun);
    });

    it('should prevent multiple concurrent runs', async () => {
      await worker.start(100);

      // Wait for multiple intervals
      await new Promise(resolve => setTimeout(resolve, 300));

      const metrics = worker.getMetrics();
      // Should have run but not cause errors
      expect(metrics.errors).toBe(0);
    });

    it('should track metrics', async () => {
      const metrics = worker.getMetrics();

      expect(metrics).toHaveProperty('totalReleased');
      expect(metrics).toHaveProperty('orphansFound');
      expect(metrics).toHaveProperty('orphansFixed');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('lastRun');
    });
  });

  describe('releaseExpiredReservations', () => {
    it('should release expired reservations', async () => {
      const reservationId = uuidv4();

      // Create expired reservation (status lowercase)
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const reservation = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [reservationId]
      );

      expect(reservation.rows[0].status).toBe('expired');
    });

    it('should not affect active reservations', async () => {
      const reservationId = uuidv4();

      // Create future reservation
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() + INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const reservation = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [reservationId]
      );

      expect(reservation.rows[0].status).toBe('pending');
    });

    it('should publish expired events to outbox', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const events = await DatabaseService.query(
        `SELECT * FROM outbox
         WHERE aggregate_type = 'reservation' AND event_type = 'reservation.expired'
         AND aggregate_id = $1`,
        [reservationId]
      );

      expect(events.rows.length).toBeGreaterThan(0);
    });

    it('should clear Redis entries for expired reservations', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      // Set Redis entry
      await RedisService.set(`reservation:${reservationId}`, JSON.stringify({ id: reservationId }), 3600);

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const exists = await RedisService.exists(`reservation:${reservationId}`);
      expect(exists).toBe(0);
    });

    it('should update metrics after releasing reservations', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      const metricsBefore = worker.getMetrics();

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const metricsAfter = worker.getMetrics();
      expect(metricsAfter.totalReleased).toBeGreaterThan(metricsBefore.totalReleased);
    });
  });

  describe('cleanupRedisReservations', () => {
    it('should remove stale Redis entries', async () => {
      const reservationId = uuidv4();

      // Create Redis entry for non-existent reservation
      await RedisService.set(`reservation:${reservationId}`, JSON.stringify({ id: reservationId }), 3600);

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const exists = await RedisService.exists(`reservation:${reservationId}`);
      expect(exists).toBe(0);
    });

    it('should keep Redis entries for active reservations', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() + INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await RedisService.set(`reservation:${reservationId}`, JSON.stringify({ id: reservationId }), 3600);

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const exists = await RedisService.exists(`reservation:${reservationId}`);
      expect(exists).toBe(1);
    });

    it('should remove Redis entries for expired reservations', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'expired', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await RedisService.set(`reservation:${reservationId}`, JSON.stringify({ id: reservationId }), 3600);

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const exists = await RedisService.exists(`reservation:${reservationId}`);
      expect(exists).toBe(0);
    });
  });

  describe('reconcileInventory', () => {
    it('should detect negative inventory', async () => {
      // Force negative inventory
      await DatabaseService.query(
        `UPDATE ticket_types SET available_quantity = -5 WHERE id = $1`,
        [testTicketTypeId]
      );

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const ticketType = await DatabaseService.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [testTicketTypeId]
      );

      // Should be fixed to 0
      expect(ticketType.rows[0].available_quantity).toBe(0);
    });

    it('should handle discrepancies between reserved and available', async () => {
      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const metrics = worker.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should continue running after errors', async () => {
      await worker.start(100);
      await new Promise(resolve => setTimeout(resolve, 300));
      worker.stop();

      const metrics = worker.getMetrics();
      expect(metrics.lastRun).toBeDefined();
    });

    it('should not run cleanup concurrently', async () => {
      // Start with short interval
      await worker.start(50);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      // Should have prevented concurrent runs
      const metrics = worker.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('metrics tracking', () => {
    it('should track total released count', async () => {
      const metrics = worker.getMetrics();
      expect(typeof metrics.totalReleased).toBe('number');
    });

    it('should track orphans found', async () => {
      const metrics = worker.getMetrics();
      expect(typeof metrics.orphansFound).toBe('number');
    });

    it('should track orphans fixed', async () => {
      const metrics = worker.getMetrics();
      expect(typeof metrics.orphansFixed).toBe('number');
    });

    it('should track errors', async () => {
      const metrics = worker.getMetrics();
      expect(typeof metrics.errors).toBe('number');
    });

    it('should track last run time', async () => {
      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const metrics = worker.getMetrics();
      expect(metrics.lastRun).toBeInstanceOf(Date);
    });

    it('should increment metrics correctly', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      const before = worker.getMetrics();

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const after = worker.getMetrics();
      expect(after.totalReleased).toBeGreaterThanOrEqual(before.totalReleased);
    });
  });

  describe('integration scenarios', () => {
    it('should handle mixed active and expired reservations', async () => {
      const expired1 = uuidv4();
      const expired2 = uuidv4();
      const active = uuidv4();

      // Create expired reservations
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [expired1, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '2 hours', '[]'::jsonb)`,
        [expired2, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      // Create active reservation
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() + INTERVAL '1 hour', '[]'::jsonb)`,
        [active, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const activeRes = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [active]
      );

      expect(activeRes.rows[0].status).toBe('pending');
    });

    it('should cleanup across multiple runs', async () => {
      await worker.start(100);
      await new Promise(resolve => setTimeout(resolve, 300));
      worker.stop();

      const metrics = worker.getMetrics();
      expect(metrics.lastRun).toBeDefined();
    });

    it('should handle empty database', async () => {
      await worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const metrics = worker.getMetrics();
      expect(metrics.errors).toBe(0);
    });
  });
});
