import { ReservationExpiryWorker } from '../../src/workers/reservation-expiry.worker';
import { DatabaseService } from '../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR RESERVATION EXPIRY WORKER
 * Tests scheduled expiration of reservations
 * 
 * FK Chain: tenants → users → venues → events → ticket_types → reservations
 * 
 * Reservations schema:
 * - status: lowercase ('pending', 'confirmed', 'expired', 'cancelled')
 * - ticket_type_id: NOT NULL required
 * - total_quantity: NOT NULL required
 * - quantity: NOT NULL required
 * - No order_id column
 */

describe('ReservationExpiryWorker Integration Tests', () => {
  let worker: ReservationExpiryWorker;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    worker = new ReservationExpiryWorker();
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
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('worker lifecycle', () => {
    it('should start worker successfully', () => {
      worker.start(5000);

      // Worker should be running
      expect((worker as any).intervalId).toBeDefined();
    });

    it('should stop worker successfully', () => {
      worker.start(5000);
      worker.stop();

      expect((worker as any).intervalId).toBeNull();
    });

    it('should not start multiple instances', () => {
      worker.start(5000);
      const intervalId1 = (worker as any).intervalId;

      worker.start(5000); // Try to start again
      const intervalId2 = (worker as any).intervalId;

      expect(intervalId1).toBe(intervalId2);
    });

    it('should handle stop when not running', () => {
      expect(() => worker.stop()).not.toThrow();
    });

    it('should use custom interval', () => {
      worker.start(10000);

      expect((worker as any).intervalId).toBeDefined();
    });

    it('should use default interval', () => {
      worker.start();

      expect((worker as any).intervalId).toBeDefined();
    });
  });

  describe('processExpiredReservations', () => {
    it('should expire reservations past expiry time', async () => {
      const reservationId = uuidv4();

      // Create expired reservation (status lowercase)
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const reservation = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [reservationId]
      );

      expect(reservation.rows[0].status).toBe('expired');
    });

    it('should not expire future reservations', async () => {
      const reservationId = uuidv4();

      // Create future reservation
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() + INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const reservation = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [reservationId]
      );

      expect(reservation.rows[0].status).toBe('pending');
    });

    it('should write expiry events to outbox', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 2, 2, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const events = await DatabaseService.query(
        `SELECT * FROM outbox
         WHERE aggregate_type = 'reservation'
         AND event_type = 'reservation.expired'
         AND aggregate_id = $1`,
        [reservationId]
      );

      expect(events.rows.length).toBeGreaterThan(0);
    });

    it('should include correct payload in outbox events', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 3, 3, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const events = await DatabaseService.query(
        `SELECT * FROM outbox
         WHERE aggregate_type = 'reservation'
         AND aggregate_id = $1`,
        [reservationId]
      );

      const payload = events.rows[0].payload;
      expect(payload.reservationId).toBe(reservationId);
      expect(payload.userId).toBe(testUserId);
      expect(payload.quantity).toBe(3);
    });

    it('should process multiple expired reservations', async () => {
      const res1 = uuidv4();
      const res2 = uuidv4();
      const res3 = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [res1, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '2 hours', '[]'::jsonb)`,
        [res2, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '30 minutes', '[]'::jsonb)`,
        [res3, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      const expired = await DatabaseService.query(
        'SELECT * FROM reservations WHERE user_id = $1 AND status = $2',
        [testUserId, 'expired']
      );

      expect(expired.rows.length).toBe(3);
    });

    it('should run immediately on start', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(60000); // Long interval

      // Should process immediately, not wait for interval
      await new Promise(resolve => setTimeout(resolve, 100));
      worker.stop();

      const reservation = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [reservationId]
      );

      expect(reservation.rows[0].status).toBe('expired');
    });

    it('should prevent concurrent processing', async () => {
      worker.start(50); // Very short interval

      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      // Should not cause errors from concurrent runs
      const isRunning = (worker as any).isRunning;
      expect(isRunning).toBe(false);
    });
  });

  describe('stored procedure integration', () => {
    it('should call release_expired_reservations procedure', async () => {
      const reservationId = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [reservationId, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      // Procedure should have marked as expired and set released_at
      const reservation = await DatabaseService.query(
        'SELECT status, released_at FROM reservations WHERE id = $1',
        [reservationId]
      );

      expect(reservation.rows[0].status).toBe('expired');
      expect(reservation.rows[0].released_at).toBeDefined();
    });

    it('should get count of released reservations', async () => {
      const res1 = uuidv4();
      const res2 = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [res1, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [res2, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      // Should have released both
      const allExpired = await DatabaseService.query(
        'SELECT * FROM reservations WHERE user_id = $1 AND status = $2',
        [testUserId, 'expired']
      );

      expect(allExpired.rows.length).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should continue running after errors', async () => {
      worker.start(100);

      // Let it run multiple times
      await new Promise(resolve => setTimeout(resolve, 300));
      worker.stop();

      // Should still be in valid state
      expect((worker as any).isRunning).toBe(false);
      expect((worker as any).intervalId).toBeNull();
    });

    it('should handle empty database', async () => {
      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      // Should complete without errors
      expect((worker as any).isRunning).toBe(false);
    });
  });

  describe('timing and intervals', () => {
    it('should respect configured interval', async () => {
      const startTime = Date.now();

      worker.start(200); // 200ms interval

      await new Promise(resolve => setTimeout(resolve, 500));
      worker.stop();

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(500);
    });

    it('should process on each interval', async () => {
      const res1 = uuidv4();

      // Create first expired reservation
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [res1, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(100);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Add second expired reservation after first interval
      const res2 = uuidv4();
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [res2, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await new Promise(resolve => setTimeout(resolve, 150));
      worker.stop();

      // Both should be expired
      const expired = await DatabaseService.query(
        'SELECT * FROM reservations WHERE user_id = $1 AND status = $2',
        [testUserId, 'expired']
      );

      expect(expired.rows.length).toBe(2);
    });
  });

  describe('integration scenarios', () => {
    it('should handle mixed statuses', async () => {
      const pendingRes = uuidv4();
      const confirmedRes = uuidv4();
      const expiredRes = uuidv4();
      const cancelledRes = uuidv4();

      // pending - should expire
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [pendingRes, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      // confirmed - should stay confirmed
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [confirmedRes, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      // expired - already expired
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'expired', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [expiredRes, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      // cancelled - should stay cancelled
      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'cancelled', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [cancelledRes, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      // Only pending should become expired
      const pendingResult = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [pendingRes]
      );

      expect(pendingResult.rows[0].status).toBe('expired');

      // Confirmed should stay confirmed
      const confirmedResult = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [confirmedRes]
      );

      expect(confirmedResult.rows[0].status).toBe('confirmed');
    });

    it('should process reservations from different users', async () => {
      const user2Id = uuidv4();

      // Create second user
      await DatabaseService.query(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user2Id, `user2-${user2Id.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
      );

      const res1 = uuidv4();
      const res2 = uuidv4();

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [res1, testTenantId, testUserId, testEventId, testTicketTypeId]
      );

      await DatabaseService.query(
        `INSERT INTO reservations
         (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
         VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
        [res2, testTenantId, user2Id, testEventId, testTicketTypeId]
      );

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 200));
      worker.stop();

      // Both should be expired
      const expired1 = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [res1]
      );
      const expired2 = await DatabaseService.query(
        'SELECT status FROM reservations WHERE id = $1',
        [res2]
      );

      expect(expired1.rows[0].status).toBe('expired');
      expect(expired2.rows[0].status).toBe('expired');
    });

    it('should handle high volume of expirations', async () => {
      const reservations = [];
      for (let i = 0; i < 20; i++) {
        const id = uuidv4();
        reservations.push(id);
        await DatabaseService.query(
          `INSERT INTO reservations
           (id, tenant_id, user_id, event_id, ticket_type_id, status, quantity, total_quantity, expires_at, tickets)
           VALUES ($1, $2, $3, $4, $5, 'pending', 1, 1, NOW() - INTERVAL '1 hour', '[]'::jsonb)`,
          [id, testTenantId, testUserId, testEventId, testTicketTypeId]
        );
      }

      worker.start(10000);
      await new Promise(resolve => setTimeout(resolve, 500));
      worker.stop();

      const expired = await DatabaseService.query(
        'SELECT * FROM reservations WHERE user_id = $1 AND status = $2',
        [testUserId, 'expired']
      );

      expect(expired.rows.length).toBe(20);
    });
  });
});
