/**
 * COMPONENT TEST: VelocityCheckerService
 *
 * Tests VelocityCheckerService with mocked Redis and real DB
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Shared pool
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'tickettoken_db',
      user: 'postgres',
      password: 'postgres',
    });
  }
  return sharedPool;
}

// Mock Redis
const mockRedisData: Map<string, number> = new Map();
const mockRedis = {
  incr: jest.fn(async (key: string) => {
    const current = mockRedisData.get(key) || 0;
    const newValue = current + 1;
    mockRedisData.set(key, newValue);
    return newValue;
  }),
  expire: jest.fn(async () => true),
  del: jest.fn(async (key: string) => {
    mockRedisData.delete(key);
    return 1;
  }),
};

jest.mock('../../../../src/services/redisService', () => ({
  RedisService: {
    getClient: () => mockRedis,
  },
}));

// Mock database config
jest.mock('../../../../src/config/database', () => ({
  query: async (text: string, values?: any[]) => {
    return getSharedPool().query(text, values);
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { VelocityCheckerService } from '../../../../src/services/fraud/velocity-checker.service';

describe('VelocityCheckerService Component Tests', () => {
  let pool: Pool;
  let service: VelocityCheckerService;
  let tenantId: string;
  let userId: string;
  let eventId: string;
  let venueId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    eventId = uuidv4();
    venueId = uuidv4();

    // Clear mock Redis data
    mockRedisData.clear();
    jest.clearAllMocks();

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);

    // Create test venue
    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000]);

    // Create test event
    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`, new Date(Date.now() + 86400000)]);

    service = new VelocityCheckerService();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM velocity_records WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // CHECK VELOCITY
  // ===========================================================================
  describe('checkVelocity()', () => {
    const ipAddress = '192.168.1.100';
    const paymentToken = 'pm_test_123';

    it('should allow first attempt', async () => {
      const result = await service.checkVelocity(userId, eventId, ipAddress, paymentToken);

      expect(result.allowed).toBe(true);
      expect(result.counts?.user).toBe(1);
      expect(result.counts?.ip).toBe(1);
      expect(result.counts?.paymentMethod).toBe(1);
    });

    it('should track multiple attempts', async () => {
      await service.checkVelocity(userId, eventId, ipAddress, paymentToken);
      await service.checkVelocity(userId, eventId, ipAddress, paymentToken);
      const result = await service.checkVelocity(userId, eventId, ipAddress, paymentToken);

      expect(result.allowed).toBe(true);
      expect(result.counts?.user).toBe(3);
    });

    it('should block after user limit exceeded', async () => {
      // Default limit is 5 per user
      for (let i = 0; i < 5; i++) {
        await service.checkVelocity(userId, eventId, ipAddress, paymentToken);
      }

      const result = await service.checkVelocity(userId, eventId, ipAddress, paymentToken);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum');
      expect(result.reason).toContain('purchase attempts');
    });

    it('should block after IP limit exceeded', async () => {
      // Default limit is 10 per IP
      // Use different users to hit IP limit, not user limit
      for (let i = 0; i < 10; i++) {
        const differentUser = uuidv4();
        await service.checkVelocity(differentUser, eventId, ipAddress, paymentToken);
      }

      const result = await service.checkVelocity(uuidv4(), eventId, ipAddress, paymentToken);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('IP');
    });

    it('should block after payment method limit exceeded', async () => {
      // Default limit is 5 per payment method
      // Use different users and IPs to hit payment method limit
      for (let i = 0; i < 5; i++) {
        const differentUser = uuidv4();
        const differentIp = `192.168.1.${i}`;
        await service.checkVelocity(differentUser, eventId, differentIp, paymentToken);
      }

      const result = await service.checkVelocity(uuidv4(), eventId, '192.168.1.99', paymentToken);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('payment method');
    });

    it('should set expiry on Redis keys', async () => {
      await service.checkVelocity(userId, eventId, ipAddress, paymentToken);

      expect(mockRedis.expire).toHaveBeenCalledWith(
        expect.stringContaining('velocity:user:'),
        300
      );
    });

    it('should track different events separately', async () => {
      const event2 = uuidv4();

      // Max out attempts for event 1
      for (let i = 0; i < 5; i++) {
        await service.checkVelocity(userId, eventId, ipAddress, paymentToken);
      }

      // Should still be allowed for event 2
      const result = await service.checkVelocity(userId, event2, ipAddress, paymentToken);

      expect(result.allowed).toBe(true);
    });
  });

  // ===========================================================================
  // RECORD PURCHASE
  // ===========================================================================
  describe('recordPurchase()', () => {
    it('should record purchase in database', async () => {
      const ipAddress = '192.168.1.100';
      const paymentToken = 'pm_test_123';

      await service.recordPurchase(tenantId, userId, eventId, ipAddress, paymentToken);

      const result = await pool.query(
        'SELECT * FROM velocity_records WHERE user_id = $1 AND event_id = $2',
        [userId, eventId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].ip_address).toBe(ipAddress);
      expect(result.rows[0].payment_method_token).toBe(paymentToken);
    });

    it('should record multiple purchases', async () => {
      await service.recordPurchase(tenantId, userId, eventId, '1.1.1.1', 'pm_1');
      await service.recordPurchase(tenantId, userId, eventId, '2.2.2.2', 'pm_2');

      const result = await pool.query(
        'SELECT * FROM velocity_records WHERE user_id = $1',
        [userId]
      );

      expect(result.rows).toHaveLength(2);
    });
  });

  // ===========================================================================
  // GET VELOCITY STATS
  // ===========================================================================
  describe('getVelocityStats()', () => {
    it('should return zero stats for new user', async () => {
      const stats = await service.getVelocityStats(userId, tenantId);

      expect(stats.recentAttempts).toBe(0);
      expect(stats.successfulPurchases).toBe(0);
      expect(stats.failedAttempts).toBe(0);
    });

    it('should count recent transactions', async () => {
      // Create some transactions
      for (let i = 0; i < 3; i++) {
        await pool.query(`
          INSERT INTO payment_transactions (
            id, tenant_id, venue_id, user_id, event_id, type, amount, currency,
            status, platform_fee, venue_payout, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'ticket_purchase', 1000, 'USD', 'completed', 50, 950, NOW(), NOW())
        `, [uuidv4(), tenantId, venueId, userId, eventId]);
      }

      // Create a failed transaction
      await pool.query(`
        INSERT INTO payment_transactions (
          id, tenant_id, venue_id, user_id, event_id, type, amount, currency,
          status, platform_fee, venue_payout, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'ticket_purchase', 1000, 'USD', 'failed', 50, 950, NOW(), NOW())
      `, [uuidv4(), tenantId, venueId, userId, eventId]);

      const stats = await service.getVelocityStats(userId, tenantId);

      expect(stats.recentAttempts).toBe(4);
      expect(stats.successfulPurchases).toBe(3);
      expect(stats.failedAttempts).toBe(1);
    });
  });

  // ===========================================================================
  // GET VELOCITY RECORDS
  // ===========================================================================
  describe('getVelocityRecords()', () => {
    it('should return empty array for new user', async () => {
      const records = await service.getVelocityRecords(userId, tenantId);

      expect(records).toEqual([]);
    });

    it('should return recorded purchases', async () => {
      await service.recordPurchase(tenantId, userId, eventId, '1.1.1.1', 'pm_1');
      await service.recordPurchase(tenantId, userId, eventId, '2.2.2.2', 'pm_2');

      const records = await service.getVelocityRecords(userId, tenantId);

      expect(records).toHaveLength(2);
      expect(records[0]).toHaveProperty('eventId');
      expect(records[0]).toHaveProperty('ipAddress');
      expect(records[0]).toHaveProperty('createdAt');
    });
  });

  // ===========================================================================
  // CLEAR VELOCITY LIMITS
  // ===========================================================================
  describe('clearVelocityLimits()', () => {
    it('should clear Redis key for user', async () => {
      // First make some attempts
      await service.checkVelocity(userId, eventId, '1.1.1.1', 'pm_1');
      await service.checkVelocity(userId, eventId, '1.1.1.1', 'pm_1');

      await service.clearVelocityLimits(userId, eventId);

      expect(mockRedis.del).toHaveBeenCalledWith(`velocity:user:${userId}:${eventId}`);
    });
  });

  // ===========================================================================
  // LIMITS MANAGEMENT
  // ===========================================================================
  describe('limits management', () => {
    it('should return default limits', () => {
      const limits = service.getLimits();

      expect(limits.perUser).toBe(5);
      expect(limits.perIp).toBe(10);
      expect(limits.perPaymentMethod).toBe(5);
      expect(limits.windowSeconds).toBe(300);
    });

    it('should update limits', () => {
      service.updateLimits({ perUser: 10, perIp: 20 });

      const limits = service.getLimits();

      expect(limits.perUser).toBe(10);
      expect(limits.perIp).toBe(20);
      expect(limits.perPaymentMethod).toBe(5); // Unchanged
    });

    it('should accept custom limits in constructor', () => {
      const customService = new VelocityCheckerService({
        perUser: 3,
        windowSeconds: 60,
      });

      const limits = customService.getLimits();

      expect(limits.perUser).toBe(3);
      expect(limits.windowSeconds).toBe(60);
    });

    it('should enforce custom limits', async () => {
      const strictService = new VelocityCheckerService({ perUser: 2 });
      const ipAddress = '192.168.1.100';
      const paymentToken = 'pm_test_123';

      // Clear the mock data to start fresh
      mockRedisData.clear();

      await strictService.checkVelocity(userId, eventId, ipAddress, paymentToken);
      await strictService.checkVelocity(userId, eventId, ipAddress, paymentToken);
      const result = await strictService.checkVelocity(userId, eventId, ipAddress, paymentToken);

      expect(result.allowed).toBe(false);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should allow request when Redis fails', async () => {
      // Make Redis throw an error
      mockRedis.incr.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await service.checkVelocity(userId, eventId, '1.1.1.1', 'pm_1');

      // Should fail open (allow the request)
      expect(result.allowed).toBe(true);
    });
  });
});
