/**
 * COMPONENT TEST: DeviceFingerprintService
 *
 * Tests DeviceFingerprintService with REAL Database
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

import { DeviceFingerprintService } from '../../../../src/services/fraud/device-fingerprint.service';

describe('DeviceFingerprintService Component Tests', () => {
  let pool: Pool;
  let service: DeviceFingerprintService;
  let tenantId: string;
  let userId: string;
  let userId2: string;
  let venueId: string;
  let eventId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    userId2 = uuidv4();
    venueId = uuidv4();
    eventId = uuidv4();

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test users
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user1-${userId.slice(0, 8)}@test.com`, 'hash']);

    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId2, tenantId, `user2-${userId2.slice(0, 8)}@test.com`, 'hash']);

    // Create venue and event for transactions
    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`, 'venue@test.com', '123 Test', 'City', 'ST', 'US', 'theater', 1000]);

    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`, new Date(Date.now() + 86400000)]);

    service = new DeviceFingerprintService();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM device_activity WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // GENERATE FINGERPRINT
  // ===========================================================================
  describe('generateFingerprint()', () => {
    it('should generate consistent fingerprint for same device data', () => {
      const deviceData = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        screenResolution: '1920x1080',
        timezone: 'America/New_York',
        language: 'en-US',
        platform: 'Win32',
      };

      const fp1 = service.generateFingerprint(deviceData);
      const fp2 = service.generateFingerprint(deviceData);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different fingerprint for different device data', () => {
      const deviceData1 = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        screenResolution: '1920x1080',
        timezone: 'America/New_York',
        language: 'en-US',
        platform: 'Win32',
      };

      const deviceData2 = {
        userAgent: 'Mozilla/5.0 (Macintosh)',
        screenResolution: '2560x1440',
        timezone: 'America/Los_Angeles',
        language: 'en-US',
        platform: 'MacIntel',
      };

      const fp1 = service.generateFingerprint(deviceData1);
      const fp2 = service.generateFingerprint(deviceData2);

      expect(fp1).not.toBe(fp2);
    });

    it('should include optional fields in fingerprint', () => {
      const deviceDataBase = {
        userAgent: 'Mozilla/5.0',
        screenResolution: '1920x1080',
        timezone: 'UTC',
        language: 'en',
        platform: 'Linux',
      };

      const deviceDataWithPlugins = {
        ...deviceDataBase,
        plugins: ['Flash', 'Java'],
        fonts: ['Arial', 'Helvetica'],
      };

      const fp1 = service.generateFingerprint(deviceDataBase);
      const fp2 = service.generateFingerprint(deviceDataWithPlugins);

      expect(fp1).not.toBe(fp2);
    });
  });

  // ===========================================================================
  // RECORD DEVICE ACTIVITY
  // ===========================================================================
  describe('recordDeviceActivity()', () => {
    it('should record activity in database', async () => {
      const fingerprint = 'test_fingerprint_123';

      await service.recordDeviceActivity(
        tenantId,
        fingerprint,
        userId,
        'login',
        { browser: 'Chrome' }
      );

      const result = await pool.query(
        'SELECT * FROM device_activity WHERE device_fingerprint = $1 AND tenant_id = $2',
        [fingerprint, tenantId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].user_id).toBe(userId);
      expect(result.rows[0].activity_type).toBe('login');
      expect(result.rows[0].metadata).toEqual({ browser: 'Chrome' });
    });

    it('should record multiple activities', async () => {
      const fingerprint = 'test_fingerprint_456';

      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'login');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'purchase');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'logout');

      const result = await pool.query(
        'SELECT * FROM device_activity WHERE device_fingerprint = $1 AND tenant_id = $2',
        [fingerprint, tenantId]
      );

      expect(result.rows).toHaveLength(3);
    });
  });

  // ===========================================================================
  // GET DEVICE ACTIVITY
  // ===========================================================================
  describe('getDeviceActivity()', () => {
    it('should return empty array for unknown device', async () => {
      const activities = await service.getDeviceActivity('unknown_fp', tenantId);

      expect(activities).toEqual([]);
    });

    it('should return activities in reverse chronological order', async () => {
      const fingerprint = 'test_fp_activity';

      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'first');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'second');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'third');

      const activities = await service.getDeviceActivity(fingerprint, tenantId);

      expect(activities).toHaveLength(3);
      expect(activities[0].activityType).toBe('third');
      expect(activities[2].activityType).toBe('first');
    });

    it('should respect limit parameter', async () => {
      const fingerprint = 'test_fp_limit';

      for (let i = 0; i < 10; i++) {
        await service.recordDeviceActivity(tenantId, fingerprint, userId, `activity_${i}`);
      }

      const activities = await service.getDeviceActivity(fingerprint, tenantId, 5);

      expect(activities).toHaveLength(5);
    });
  });

  // ===========================================================================
  // GET ASSOCIATED ACCOUNT COUNT
  // ===========================================================================
  describe('getAssociatedAccountCount()', () => {
    it('should return 0 for unknown device', async () => {
      const count = await service.getAssociatedAccountCount('unknown_fp', tenantId);

      expect(count).toBe(0);
    });

    it('should count unique users', async () => {
      const fingerprint = 'shared_device_fp';

      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'login');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'purchase');
      await service.recordDeviceActivity(tenantId, fingerprint, userId2, 'login');

      const count = await service.getAssociatedAccountCount(fingerprint, tenantId);

      expect(count).toBe(2);
    });
  });

  // ===========================================================================
  // GET SUSPICIOUS ACTIVITY COUNT
  // ===========================================================================
  describe('getSuspiciousActivityCount()', () => {
    it('should return 0 for clean device', async () => {
      const fingerprint = 'clean_device';
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'login');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'purchase');

      const count = await service.getSuspiciousActivityCount(fingerprint, tenantId);

      expect(count).toBe(0);
    });

    it('should count suspicious activities', async () => {
      const fingerprint = 'suspicious_device';

      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'failed_payment');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'fraud_detected');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'login'); // Not suspicious

      const count = await service.getSuspiciousActivityCount(fingerprint, tenantId);

      expect(count).toBe(2);
    });
  });

  // ===========================================================================
  // CHECK GEOGRAPHIC ANOMALIES
  // ===========================================================================
  describe('checkGeographicAnomalies()', () => {
    it('should return no anomalies for device without location data', async () => {
      const fingerprint = 'no_location_device';
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'login');

      const result = await service.checkGeographicAnomalies(fingerprint, tenantId);

      expect(result.hasAnomalies).toBe(false);
    });

    it('should detect impossible travel', async () => {
      const fingerprint = 'travel_device';

      // Record activity in New York
      await pool.query(`
        INSERT INTO device_activity (tenant_id, device_fingerprint, user_id, activity_type, metadata, timestamp)
        VALUES ($1, $2, $3, 'login', '{"location": "New York"}', NOW() - INTERVAL '30 minutes')
      `, [tenantId, fingerprint, userId]);

      // Record activity in London 30 minutes later (impossible)
      await pool.query(`
        INSERT INTO device_activity (tenant_id, device_fingerprint, user_id, activity_type, metadata, timestamp)
        VALUES ($1, $2, $3, 'login', '{"location": "London"}', NOW())
      `, [tenantId, fingerprint, userId]);

      const result = await service.checkGeographicAnomalies(fingerprint, tenantId);

      expect(result.hasAnomalies).toBe(true);
      expect(result.details).toHaveProperty('location1', 'New York');
      expect(result.details).toHaveProperty('location2', 'London');
    });
  });

  // ===========================================================================
  // GET DEVICE AGE
  // ===========================================================================
  describe('getDeviceAge()', () => {
    it('should return -1 for unknown device', async () => {
      const age = await service.getDeviceAge('unknown_device', tenantId);

      expect(age).toBe(-1);
    });

    it('should return age in hours', async () => {
      const fingerprint = 'aged_device';

      // Create activity 2 hours ago
      await pool.query(`
        INSERT INTO device_activity (tenant_id, device_fingerprint, user_id, activity_type, timestamp)
        VALUES ($1, $2, $3, 'login', NOW() - INTERVAL '2 hours')
      `, [tenantId, fingerprint, userId]);

      const age = await service.getDeviceAge(fingerprint, tenantId);

      expect(age).toBeGreaterThanOrEqual(2);
      expect(age).toBeLessThan(3);
    });
  });

  // ===========================================================================
  // GET FAILED PAYMENT ATTEMPTS
  // ===========================================================================
  describe('getFailedPaymentAttempts()', () => {
    it('should return 0 for device with no failed payments', async () => {
      const count = await service.getFailedPaymentAttempts('clean_fp', tenantId);

      expect(count).toBe(0);
    });

    it('should count failed payment transactions', async () => {
      const fingerprint = 'failed_payments_device';

      // Create failed transactions
      for (let i = 0; i < 3; i++) {
        await pool.query(`
          INSERT INTO payment_transactions (
            id, tenant_id, venue_id, user_id, event_id, type, amount, currency,
            status, platform_fee, venue_payout, device_fingerprint, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'ticket_purchase', 1000, 'USD', 'failed', 50, 950, $6, NOW(), NOW())
        `, [uuidv4(), tenantId, venueId, userId, eventId, fingerprint]);
      }

      // Create successful transaction (should not count)
      await pool.query(`
        INSERT INTO payment_transactions (
          id, tenant_id, venue_id, user_id, event_id, type, amount, currency,
          status, platform_fee, venue_payout, device_fingerprint, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'ticket_purchase', 1000, 'USD', 'completed', 50, 950, $6, NOW(), NOW())
      `, [uuidv4(), tenantId, venueId, userId, eventId, fingerprint]);

      const count = await service.getFailedPaymentAttempts(fingerprint, tenantId);

      expect(count).toBe(3);
    });
  });

  // ===========================================================================
  // GET DEVICE RISK SCORE
  // ===========================================================================
  describe('getDeviceRiskScore()', () => {
    it('should return zero score for clean device', async () => {
      const fingerprint = 'very_clean_device';

      // Create old activity (not a new device)
      await pool.query(`
        INSERT INTO device_activity (tenant_id, device_fingerprint, user_id, activity_type, timestamp)
        VALUES ($1, $2, $3, 'login', NOW() - INTERVAL '30 days')
      `, [tenantId, fingerprint, userId]);

      const result = await service.getDeviceRiskScore(fingerprint, tenantId);

      expect(result.score).toBe(0);
      expect(result.factors).toHaveLength(0);
    });

    it('should increase score for multiple accounts', async () => {
      const fingerprint = 'multi_account_device';

      // Multiple users on same device
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'login');
      await service.recordDeviceActivity(tenantId, fingerprint, userId2, 'login');

      // Make it not a new device
      await pool.query(`
        UPDATE device_activity SET timestamp = NOW() - INTERVAL '30 days'
        WHERE device_fingerprint = $1 AND tenant_id = $2
      `, [fingerprint, tenantId]);

      const result = await service.getDeviceRiskScore(fingerprint, tenantId);

      const multiAccountFactor = result.factors.find(f => f.factor === 'multiple_accounts');
      expect(multiAccountFactor).toBeDefined();
      expect(multiAccountFactor?.value).toBe(2);
    });

    it('should increase score for suspicious activity', async () => {
      const fingerprint = 'suspicious_device_risk';

      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'failed_payment');
      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'fraud_detected');

      // Make it not a new device
      await pool.query(`
        UPDATE device_activity SET timestamp = NOW() - INTERVAL '30 days'
        WHERE device_fingerprint = $1 AND tenant_id = $2 LIMIT 1
      `, [fingerprint, tenantId]);

      const result = await service.getDeviceRiskScore(fingerprint, tenantId);

      const suspiciousFactor = result.factors.find(f => f.factor === 'suspicious_activity');
      expect(suspiciousFactor).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
    });

    it('should flag new devices', async () => {
      const fingerprint = 'brand_new_device';

      await service.recordDeviceActivity(tenantId, fingerprint, userId, 'login');

      const result = await service.getDeviceRiskScore(fingerprint, tenantId);

      const newDeviceFactor = result.factors.find(f => f.factor === 'new_device');
      expect(newDeviceFactor).toBeDefined();
    });
  });

  // ===========================================================================
  // COMPARE FINGERPRINTS
  // ===========================================================================
  describe('compareFingerprints()', () => {
    it('should return 100% similarity for identical fingerprints', () => {
      const fp = 'abc123def456';

      const result = service.compareFingerprints(fp, fp);

      expect(result.similar).toBe(true);
      expect(result.similarity).toBe(1.0);
    });

    it('should return 0% similarity for completely different fingerprints', () => {
      const fp1 = 'aaaaaaaaaa';
      const fp2 = 'bbbbbbbbbb';

      const result = service.compareFingerprints(fp1, fp2);

      expect(result.similar).toBe(false);
      expect(result.similarity).toBe(0);
    });

    it('should detect similar fingerprints', () => {
      const fp1 = 'abcdefghij';
      const fp2 = 'abcdefghik'; // Only last char different

      const result = service.compareFingerprints(fp1, fp2);

      expect(result.similarity).toBeGreaterThan(0.85);
      expect(result.similar).toBe(true);
    });

    it('should handle different length fingerprints', () => {
      const fp1 = 'abcdef';
      const fp2 = 'abcdefghij';

      const result = service.compareFingerprints(fp1, fp2);

      expect(result.similarity).toBeLessThan(1);
    });
  });
});
