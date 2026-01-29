/**
 * COMPONENT TEST: ScalperDetectorService
 *
 * Tests ScalperDetectorService with mocked Redis and real DB
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
const mockRedisData: Map<string, string | number> = new Map();
const mockRedis = {
  incr: jest.fn(async (key: string) => {
    const current = parseInt(String(mockRedisData.get(key) || '0'));
    const newValue = current + 1;
    mockRedisData.set(key, newValue);
    return newValue;
  }),
  expire: jest.fn(async () => true),
  get: jest.fn(async (key: string) => mockRedisData.get(key) || null),
  setex: jest.fn(async (key: string, ttl: number, value: string) => {
    mockRedisData.set(key, value);
    return 'OK';
  }),
  del: jest.fn(async (key: string) => {
    mockRedisData.delete(key);
    return 1;
  }),
  exists: jest.fn(async (key: string) => mockRedisData.has(key) ? 1 : 0),
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

import { ScalperDetectorService, FraudDecision, SignalType } from '../../../../src/services/fraud/scalper-detector.service';

describe('ScalperDetectorService Component Tests', () => {
  let pool: Pool;
  let service: ScalperDetectorService;
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

    service = new ScalperDetectorService();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // Helper to create a transaction
  async function createTransaction(
    overrides: { eventId?: string; status?: string; stripeIntentId?: string } = {}
  ): Promise<string> {
    const txnId = uuidv4();
    await pool.query(`
      INSERT INTO payment_transactions (
        id, tenant_id, venue_id, user_id, event_id, type, amount, currency,
        status, platform_fee, venue_payout, stripe_payment_intent_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'ticket_purchase', 5000, 'USD', $6, 250, 4750, $7, NOW(), NOW())
    `, [
      txnId,
      tenantId,
      venueId,
      userId,
      overrides.eventId || eventId,
      overrides.status || 'completed',
      overrides.stripeIntentId || `pi_${uuidv4().slice(0, 24)}`,
    ]);
    return txnId;
  }

  // ===========================================================================
  // DETECT SCALPER - BASIC
  // ===========================================================================
  describe('detectScalper() - basic', () => {
    it('should approve normal user with no history', async () => {
      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' }
      );

      expect(result.decision).toBe(FraudDecision.APPROVE);
      expect(result.score).toBeLessThan(30);
      expect(result.signals).toHaveLength(0);
    });

    it('should return complete fraud check structure', async () => {
      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' },
        'device_fingerprint_123'
      );

      expect(result.userId).toBe(userId);
      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.deviceFingerprint).toBe('device_fingerprint_123');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.signals).toBeInstanceOf(Array);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // DETECT SCALPER - RAPID PURCHASES
  // ===========================================================================
  describe('detectScalper() - rapid purchases', () => {
    it('should flag rapid purchases', async () => {
      // Simulate 4 rapid attempts (threshold is 3)
      for (let i = 0; i < 4; i++) {
        await service.detectScalper(userId, tenantId, { ipAddress: '192.168.1.1' });
      }

      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' }
      );

      expect(result.score).toBeGreaterThanOrEqual(30);
      const rapidSignal = result.signals.find(s => s.type === SignalType.RAPID_PURCHASES);
      expect(rapidSignal).toBeDefined();
      expect(rapidSignal?.severity).toBe('high');
    });
  });

  // ===========================================================================
  // DETECT SCALPER - MULTIPLE EVENTS
  // ===========================================================================
  describe('detectScalper() - multiple events', () => {
    it('should flag purchases across many events', async () => {
      // Create transactions for 5 different events
      for (let i = 0; i < 5; i++) {
        const newEventId = uuidv4();
        await pool.query(`
          INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `, [newEventId, tenantId, venueId, `Event ${i}`, `event-${i}-${uuidv4().slice(0, 8)}`, new Date(Date.now() + 86400000 * (i + 1))]);

        await createTransaction({ eventId: newEventId });
      }

      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' }
      );

      const multiEventSignal = result.signals.find(s => s.type === SignalType.MULTI_EVENT);
      expect(multiEventSignal).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(20);
    });

    it('should not flag user with few events', async () => {
      // Create transactions for only 2 events
      await createTransaction();

      const newEventId = uuidv4();
      await pool.query(`
        INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `, [newEventId, tenantId, venueId, 'Event 2', `event-2-${uuidv4().slice(0, 8)}`, new Date(Date.now() + 86400000 * 2)]);
      await createTransaction({ eventId: newEventId });

      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' }
      );

      const multiEventSignal = result.signals.find(s => s.type === SignalType.MULTI_EVENT);
      expect(multiEventSignal).toBeUndefined();
    });
  });

  // ===========================================================================
  // DETECT SCALPER - PURCHASE PATTERNS
  // ===========================================================================
  describe('detectScalper() - purchase patterns', () => {
    it('should flag suspicious purchase patterns', async () => {
      // Create 12 transactions with different payment intents
      for (let i = 0; i < 12; i++) {
        await createTransaction({ stripeIntentId: `pi_unique_${i}_${uuidv4().slice(0, 16)}` });
      }

      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' }
      );

      const patternSignal = result.signals.find(s => s.type === SignalType.KNOWN_SCALPER);
      expect(patternSignal).toBeDefined();
      expect(patternSignal?.details.purchaseCount).toBe(12);
    });
  });

  // ===========================================================================
  // DETECT SCALPER - DEVICE FINGERPRINT
  // ===========================================================================
  describe('detectScalper() - device fingerprint', () => {
    it('should flag known bad device', async () => {
      const fingerprint = 'bad_device_123';

      // Flag the device first
      await service.flagDevice(fingerprint, 'Known bot');

      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' },
        fingerprint
      );

      const deviceSignal = result.signals.find(s => s.type === SignalType.BOT_BEHAVIOR);
      expect(deviceSignal).toBeDefined();
      expect(deviceSignal?.severity).toBe('high');
      expect(result.score).toBeGreaterThanOrEqual(35);
    });

    it('should not flag clean device', async () => {
      const result = await service.detectScalper(
        userId,
        tenantId,
        { ipAddress: '192.168.1.1' },
        'clean_device_456'
      );

      const deviceSignal = result.signals.find(s => s.type === SignalType.BOT_BEHAVIOR);
      expect(deviceSignal).toBeUndefined();
    });
  });

  // ===========================================================================
  // DECISION THRESHOLDS
  // ===========================================================================
  describe('decision thresholds', () => {
    it('should DECLINE when score >= 50', async () => {
      // Flag device (35 points) + rapid purchases (30 points) = 65 points
      const fingerprint = 'flagged_device';
      await service.flagDevice(fingerprint, 'Bot detected');

      // Trigger rapid purchase check (need > 3 attempts)
      for (let i = 0; i < 4; i++) {
        await service.detectScalper(userId, tenantId, {}, fingerprint);
      }

      const result = await service.detectScalper(userId, tenantId, {}, fingerprint);

      expect(result.decision).toBe(FraudDecision.DECLINE);
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('should REVIEW when score >= 30 but < 50', async () => {
      // Trigger only rapid purchases (30 points)
      for (let i = 0; i < 4; i++) {
        await service.detectScalper(userId, tenantId, {});
      }

      const result = await service.detectScalper(userId, tenantId, {});

      expect(result.decision).toBe(FraudDecision.REVIEW);
      expect(result.score).toBeGreaterThanOrEqual(30);
      expect(result.score).toBeLessThan(50);
    });

    it('should APPROVE when score < 30', async () => {
      const result = await service.detectScalper(userId, tenantId, {});

      expect(result.decision).toBe(FraudDecision.APPROVE);
      expect(result.score).toBeLessThan(30);
    });
  });

  // ===========================================================================
  // FLAG/UNFLAG DEVICE
  // ===========================================================================
  describe('flagDevice() / unflagDevice()', () => {
    it('should flag a device', async () => {
      const fingerprint = 'device_to_flag';

      await service.flagDevice(fingerprint, 'Suspicious activity');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `scalper:device:flagged:${fingerprint}`,
        30 * 24 * 60 * 60, // 30 days
        'Suspicious activity'
      );
    });

    it('should unflag a device', async () => {
      const fingerprint = 'device_to_unflag';
      await service.flagDevice(fingerprint, 'Test');

      await service.unflagDevice(fingerprint);

      expect(mockRedis.del).toHaveBeenCalledWith(`scalper:device:flagged:${fingerprint}`);
    });

    it('should flag with custom duration', async () => {
      const fingerprint = 'device_short_flag';

      await service.flagDevice(fingerprint, 'Short ban', 7);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `scalper:device:flagged:${fingerprint}`,
        7 * 24 * 60 * 60, // 7 days
        'Short ban'
      );
    });
  });

  // ===========================================================================
  // CONFIG MANAGEMENT
  // ===========================================================================
  describe('config management', () => {
    it('should return default config', () => {
      const config = service.getConfig();

      expect(config.rapidPurchaseThreshold).toBe(3);
      expect(config.multiEventThreshold).toBe(3);
      expect(config.declineThreshold).toBe(50);
    });

    it('should update config', () => {
      service.updateConfig({
        rapidPurchaseThreshold: 5,
        declineThreshold: 70,
      });

      const config = service.getConfig();

      expect(config.rapidPurchaseThreshold).toBe(5);
      expect(config.declineThreshold).toBe(70);
      expect(config.multiEventThreshold).toBe(3); // Unchanged
    });

    it('should accept custom config in constructor', () => {
      const customService = new ScalperDetectorService({
        rapidPurchaseThreshold: 10,
        reviewThreshold: 40,
      });

      const config = customService.getConfig();

      expect(config.rapidPurchaseThreshold).toBe(10);
      expect(config.reviewThreshold).toBe(40);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should handle Redis errors gracefully in rapid check', async () => {
      mockRedis.incr.mockRejectedValueOnce(new Error('Redis down'));

      const result = await service.detectScalper(userId, tenantId, {});

      // Should not crash, rapid check should return false
      expect(result.decision).toBeDefined();
    });

    it('should handle Redis errors gracefully in device check', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis down'));

      const result = await service.detectScalper(
        userId,
        tenantId,
        {},
        'some_device'
      );

      // Should not crash, device check should return not flagged
      expect(result.decision).toBeDefined();
    });
  });
});
