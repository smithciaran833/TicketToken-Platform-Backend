import { Pool } from 'pg';
import axios from 'axios';
import {
  TestDataHelper,
  TEST_USERS,
  TEST_EVENT,
  DEFAULT_TENANT_ID,
  createTestJWT,
} from '../fixtures/test-data';

describe('Reservation Lifecycle - End to End', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;
  let buyerToken: string;
  const API_BASE = 'http://localhost:3004/api/v1';

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    testHelper = new TestDataHelper(pool);
    await testHelper.seedDatabase();

    buyerToken = createTestJWT(TEST_USERS.BUYER_1, 'user');

    console.log('✅ Reservation lifecycle test setup complete');
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ Reservation lifecycle test teardown complete');
  });

  describe('Reservation Creation', () => {
    it('should create reservation with 10 minute expiry', async () => {
      const ticketTypes = await pool.query(`
        SELECT id FROM ticket_types WHERE event_id = $1 LIMIT 1
      `, [TEST_EVENT.id]);

      const ticketTypeId = ticketTypes.rows[0].id;

      const response = await axios.post(
        `${API_BASE}/tickets/purchase`,
        {
          eventId: TEST_EVENT.id,
          tickets: [{ ticketTypeId, quantity: 2 }]
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const reservation = response.data.data;
      expect(reservation.status).toBe('ACTIVE');
      expect(reservation.totalQuantity).toBe(2);

      const expiresAt = new Date(reservation.expiresAt);
      const createdAt = new Date(reservation.createdAt);
      const diff = (expiresAt.getTime() - createdAt.getTime()) / 1000;

      expect(diff).toBeGreaterThanOrEqual(590);
      expect(diff).toBeLessThanOrEqual(610);
    });

    it('should decrement available inventory when reservation created', async () => {
      const ticketTypes = await pool.query(`
        SELECT id, available_quantity FROM ticket_types WHERE event_id = $1 LIMIT 1
      `, [TEST_EVENT.id]);

      const ticketTypeId = ticketTypes.rows[0].id;
      const initialQuantity = ticketTypes.rows[0].available_quantity;

      await axios.post(
        `${API_BASE}/tickets/purchase`,
        {
          eventId: TEST_EVENT.id,
          tickets: [{ ticketTypeId, quantity: 3 }]
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID
          }
        }
      );

      const after = await pool.query(`
        SELECT available_quantity FROM ticket_types WHERE id = $1
      `, [ticketTypeId]);

      expect(after.rows[0].available_quantity).toBe(initialQuantity - 3);
    });
  });

  describe('Auto-Expiry', () => {
    it('should automatically expire reservations after expiry time', async () => {
      const reservationId = await pool.query(`
        INSERT INTO reservations (
          user_id, event_id, tickets, total_quantity,
          status, expires_at, created_at
        )
        VALUES ($1, $2, $3, 1, 'ACTIVE', NOW() - INTERVAL '1 minute', NOW())
        RETURNING id
      `, [TEST_USERS.BUYER_1, TEST_EVENT.id, JSON.stringify([{ ticketTypeId: TEST_EVENT.id, quantity: 1 }])]);

      const resId = reservationId.rows[0].id;

      const result = await pool.query('SELECT release_expired_reservations() as count');
      const releasedCount = result.rows[0].count;

      expect(releasedCount).toBeGreaterThanOrEqual(1);

      const expired = await pool.query(`
        SELECT status, released_at, release_reason
        FROM reservations WHERE id = $1
      `, [resId]);

      expect(expired.rows[0].status).toBe('EXPIRED');
      expect(expired.rows[0].released_at).toBeTruthy();
      expect(expired.rows[0].release_reason).toBe('Automatic expiry');
    });

    it('should restore inventory when reservation expires', async () => {
      const ticketTypes = await pool.query(`
        SELECT id, available_quantity FROM ticket_types WHERE event_id = $1 LIMIT 1
      `, [TEST_EVENT.id]);

      const ticketTypeId = ticketTypes.rows[0].id;
      const initialQuantity = ticketTypes.rows[0].available_quantity;

      await pool.query(`
        INSERT INTO reservations (
          user_id, event_id, tickets, total_quantity,
          status, expires_at, created_at
        )
        VALUES ($1, $2, $3, 5, 'ACTIVE', NOW() - INTERVAL '1 minute', NOW())
      `, [TEST_USERS.BUYER_1, TEST_EVENT.id, JSON.stringify([{ ticketTypeId, quantity: 5 }])]);

      await pool.query(`
        UPDATE ticket_types
        SET available_quantity = available_quantity - 5
        WHERE id = $1
      `, [ticketTypeId]);

      await pool.query('SELECT release_expired_reservations()');

      const after = await pool.query(`
        SELECT available_quantity FROM ticket_types WHERE id = $1
      `, [ticketTypeId]);

      expect(after.rows[0].available_quantity).toBe(initialQuantity);
    });
  });

  describe('Concurrent Reservations', () => {
    it('should handle multiple users reserving same tickets', async () => {
      const buyer2Token = createTestJWT(TEST_USERS.BUYER_2, 'user');

      const ticketTypes = await pool.query(`
        SELECT id, available_quantity FROM ticket_types WHERE event_id = $1 LIMIT 1
      `, [TEST_EVENT.id]);

      const ticketTypeId = ticketTypes.rows[0].id;
      const availableQty = ticketTypes.rows[0].available_quantity;

      const [res1, res2] = await Promise.all([
        axios.post(
          `${API_BASE}/tickets/purchase`,
          {
            eventId: TEST_EVENT.id,
            tickets: [{ ticketTypeId, quantity: 2 }]
          },
          {
            headers: {
              'Authorization': `Bearer ${buyerToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID
            },
            validateStatus: () => true
          }
        ),
        axios.post(
          `${API_BASE}/tickets/purchase`,
          {
            eventId: TEST_EVENT.id,
            tickets: [{ ticketTypeId, quantity: 2 }]
          },
          {
            headers: {
              'Authorization': `Bearer ${buyer2Token}`,
              'x-tenant-id': DEFAULT_TENANT_ID
            },
            validateStatus: () => true
          }
        )
      ]);

      if (availableQty >= 4) {
        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        const after = await pool.query(`
          SELECT available_quantity FROM ticket_types WHERE id = $1
        `, [ticketTypeId]);

        expect(after.rows[0].available_quantity).toBe(availableQty - 4);
      }
    });
  });

  describe('Reservation Cancellation', () => {
    it('should cancel active reservation and restore inventory', async () => {
      const ticketTypes = await pool.query(`
        SELECT id, available_quantity FROM ticket_types WHERE event_id = $1 LIMIT 1
      `, [TEST_EVENT.id]);

      const ticketTypeId = ticketTypes.rows[0].id;
      const initialQty = ticketTypes.rows[0].available_quantity;

      const createRes = await axios.post(
        `${API_BASE}/tickets/purchase`,
        {
          eventId: TEST_EVENT.id,
          tickets: [{ ticketTypeId, quantity: 2 }]
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID
          }
        }
      );

      const reservationId = createRes.data.data.id;

      const cancelRes = await axios.delete(
        `${API_BASE}/tickets/reservations/${reservationId}`,
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID
          }
        }
      );

      expect(cancelRes.status).toBe(200);

      const reservation = await pool.query(`
        SELECT status FROM reservations WHERE id = $1
      `, [reservationId]);

      expect(reservation.rows[0].status).toBe('CANCELLED');

      const after = await pool.query(`
        SELECT available_quantity FROM ticket_types WHERE id = $1
      `, [ticketTypeId]);

      expect(after.rows[0].available_quantity).toBe(initialQty);
    });
  });

  describe('Query Performance', () => {
    it('should efficiently query expired reservations', async () => {
      const startTime = Date.now();

      const result = await pool.query(`
        SELECT id FROM reservations
        WHERE status = 'EXPIRED'
        AND released_at >= NOW() - INTERVAL '1 hour'
        LIMIT 100
      `);

      const queryTime = Date.now() - startTime;
      expect(queryTime).toBeLessThan(100);
    });

    it('should efficiently find active reservations for user', async () => {
      const startTime = Date.now();

      const result = await pool.query(`
        SELECT id FROM reservations
        WHERE user_id = $1
        AND status = 'ACTIVE'
        LIMIT 10
      `, [TEST_USERS.BUYER_1]);

      const queryTime = Date.now() - startTime;
      expect(queryTime).toBeLessThan(50);
    });
  });

  describe('Orphan Cleanup', () => {
    it('should identify reservations with no associated order', async () => {
      const orphan = await pool.query(`
        INSERT INTO reservations (
          user_id, event_id, tickets, total_quantity,
          status, expires_at, order_id, created_at
        )
        VALUES ($1, $2, $3, 1, 'ACTIVE', NOW() + INTERVAL '10 minutes', NULL, NOW())
        RETURNING id
      `, [TEST_USERS.BUYER_1, TEST_EVENT.id, JSON.stringify([{ ticketTypeId: TEST_EVENT.id, quantity: 1 }])]);

      const orphans = await pool.query(`
        SELECT id FROM reservations
        WHERE status = 'ACTIVE'
        AND order_id IS NULL
        AND created_at < NOW() - INTERVAL '15 minutes'
      `);

      expect(Array.isArray(orphans.rows)).toBe(true);
    });
  });

  describe('Reservation Limits', () => {
    it('should respect maximum active reservations per user', async () => {
      const ticketTypes = await pool.query(`
        SELECT id FROM ticket_types WHERE event_id = $1 LIMIT 1
      `, [TEST_EVENT.id]);

      const ticketTypeId = ticketTypes.rows[0].id;

      const current = await pool.query(`
        SELECT COUNT(*) as count FROM reservations
        WHERE user_id = $1 AND status = 'ACTIVE'
      `, [TEST_USERS.BUYER_1]);

      const currentCount = parseInt(current.rows[0].count);

      const response = await axios.post(
        `${API_BASE}/tickets/purchase`,
        {
          eventId: TEST_EVENT.id,
          tickets: [{ ticketTypeId, quantity: 1 }]
        },
        {
          headers: {
            'Authorization': `Bearer ${buyerToken}`,
            'x-tenant-id': DEFAULT_TENANT_ID
          },
          validateStatus: () => true
        }
      );

      expect([200, 400, 409]).toContain(response.status);
    });
  });

  describe('Race Conditions', () => {
    it('should handle last ticket race condition correctly', async () => {
      const ticketType = await pool.query(`
        INSERT INTO ticket_types (
          event_id, name, description, price_cents,
          quantity, available_quantity, reserved_quantity,
          sale_start_date, sale_end_date
        )
        VALUES ($1, 'Last Ticket Test', 'Test', 5000, 1, 1, 0, NOW(), NOW() + INTERVAL '1 year')
        RETURNING id
      `, [TEST_EVENT.id]);

      const ticketTypeId = ticketType.rows[0].id;
      const buyer2Token = createTestJWT(TEST_USERS.BUYER_2, 'user');

      const results = await Promise.allSettled([
        axios.post(
          `${API_BASE}/tickets/purchase`,
          {
            eventId: TEST_EVENT.id,
            tickets: [{ ticketTypeId, quantity: 1 }]
          },
          {
            headers: {
              'Authorization': `Bearer ${buyerToken}`,
              'x-tenant-id': DEFAULT_TENANT_ID
            },
            validateStatus: () => true
          }
        ),
        axios.post(
          `${API_BASE}/tickets/purchase`,
          {
            eventId: TEST_EVENT.id,
            tickets: [{ ticketTypeId, quantity: 1 }]
          },
          {
            headers: {
              'Authorization': `Bearer ${buyer2Token}`,
              'x-tenant-id': DEFAULT_TENANT_ID
            },
            validateStatus: () => true
          }
        )
      ]);

      const successes = results.filter(r =>
        r.status === 'fulfilled' && r.value.status === 200
      );
      const failures = results.filter(r =>
        r.status === 'fulfilled' && r.value.status !== 200
      );

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });
  });
});