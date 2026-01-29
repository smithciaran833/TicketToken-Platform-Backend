/**
 * COMPONENT TEST: VenueAnalyticsService
 *
 * Tests VenueAnalyticsService with REAL Database
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long-for-testing';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'tickettoken_db';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.LOG_LEVEL = 'silent';

// Shared pool
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
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
jest.mock('../../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { VenueAnalyticsService } from '../../../../src/services/core/venue-analytics.service';

describe('VenueAnalyticsService Component Tests', () => {
  let pool: Pool;
  let service: VenueAnalyticsService;
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

    service = new VenueAnalyticsService();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // Helper to create transactions
  async function createTransaction(
    amount: number,
    venuePayout: number,
    status: string = 'completed',
    createdAt: Date = new Date()
  ): Promise<string> {
    const txnId = uuidv4();
    await pool.query(`
      INSERT INTO payment_transactions (
        id, tenant_id, venue_id, user_id, event_id, type, amount, currency,
        status, platform_fee, venue_payout, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    `, [txnId, tenantId, venueId, userId, eventId, 'ticket_purchase', amount, 'USD', status, amount - venuePayout, venuePayout, createdAt]);
    return txnId;
  }

  // ===========================================================================
  // GET MONTHLY VOLUME
  // ===========================================================================
  describe('getMonthlyVolume()', () => {
    it('should return 0 for venue with no transactions', async () => {
      const volume = await service.getMonthlyVolume(venueId);

      expect(volume).toBe(0);
    });

    it('should sum venue_payout for completed transactions', async () => {
      await createTransaction(10000, 9500);
      await createTransaction(20000, 19000);
      await createTransaction(15000, 14250);

      const volume = await service.getMonthlyVolume(venueId);

      expect(volume).toBe(9500 + 19000 + 14250);
    });

    it('should exclude non-completed transactions', async () => {
      await createTransaction(10000, 9500, 'completed');
      await createTransaction(20000, 19000, 'pending');
      await createTransaction(15000, 14250, 'failed');

      const volume = await service.getMonthlyVolume(venueId);

      expect(volume).toBe(9500); // Only completed
    });

    it('should exclude transactions older than 30 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      await createTransaction(10000, 9500, 'completed', new Date());
      await createTransaction(20000, 19000, 'completed', oldDate);

      const volume = await service.getMonthlyVolume(venueId);

      expect(volume).toBe(9500); // Only recent
    });

    it('should return 0 for non-existent venue', async () => {
      const volume = await service.getMonthlyVolume(uuidv4());

      expect(volume).toBe(0);
    });
  });

  // ===========================================================================
  // GET VENUE METRICS
  // ===========================================================================
  describe('getVenueMetrics()', () => {
    it('should return zero metrics for venue with no transactions', async () => {
      const metrics = await service.getVenueMetrics(venueId);

      expect(metrics.venueId).toBe(venueId);
      expect(metrics.monthlyVolumeCents).toBe(0);
      expect(metrics.transactionCount).toBe(0);
      expect(metrics.averageTransactionCents).toBe(0);
      expect(metrics.period.start).toBeInstanceOf(Date);
      expect(metrics.period.end).toBeInstanceOf(Date);
    });

    it('should calculate correct metrics', async () => {
      await createTransaction(10000, 9500);
      await createTransaction(20000, 19000);
      await createTransaction(30000, 28500);

      const metrics = await service.getVenueMetrics(venueId);

      expect(metrics.monthlyVolumeCents).toBe(57000); // 9500 + 19000 + 28500
      expect(metrics.transactionCount).toBe(3);
      expect(metrics.averageTransactionCents).toBe(19000); // 57000 / 3
    });

    it('should respect custom day range', async () => {
      const recentDate = new Date();
      const olderDate = new Date();
      olderDate.setDate(olderDate.getDate() - 10);

      await createTransaction(10000, 9500, 'completed', recentDate);
      await createTransaction(20000, 19000, 'completed', olderDate);

      const metrics7Days = await service.getVenueMetrics(venueId, 7);
      const metrics30Days = await service.getVenueMetrics(venueId, 30);

      expect(metrics7Days.transactionCount).toBe(1);
      expect(metrics30Days.transactionCount).toBe(2);
    });
  });

  // ===========================================================================
  // GET VOLUME FOR PERIOD
  // ===========================================================================
  describe('getVolumeForPeriod()', () => {
    it('should return volume for specific date range', async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

      await createTransaction(10000, 9500, 'completed', now);
      await createTransaction(20000, 19000, 'completed', twoWeeksAgo);
      await createTransaction(30000, 28500, 'completed', threeWeeksAgo);

      // Last 10 days - should only get recent one
      const recentVolume = await service.getVolumeForPeriod(venueId, weekAgo, now);
      expect(recentVolume).toBe(9500);

      // Last 3 weeks - should get all
      const allVolume = await service.getVolumeForPeriod(venueId, threeWeeksAgo, now);
      expect(allVolume).toBe(57000);
    });

    it('should return 0 for empty period', async () => {
      await createTransaction(10000, 9500);

      const oldStart = new Date('2020-01-01');
      const oldEnd = new Date('2020-01-31');

      const volume = await service.getVolumeForPeriod(venueId, oldStart, oldEnd);

      expect(volume).toBe(0);
    });
  });

  // ===========================================================================
  // GET YEAR TO DATE VOLUME
  // ===========================================================================
  describe('getYearToDateVolume()', () => {
    it('should return YTD volume', async () => {
      await createTransaction(10000, 9500);
      await createTransaction(20000, 19000);

      const ytdVolume = await service.getYearToDateVolume(venueId);

      expect(ytdVolume).toBe(28500);
    });

    it('should return 0 for venue with no YTD transactions', async () => {
      const ytdVolume = await service.getYearToDateVolume(venueId);

      expect(ytdVolume).toBe(0);
    });
  });

  // ===========================================================================
  // GET MONTHLY VOLUME TREND
  // ===========================================================================
  describe('getMonthlyVolumeTrend()', () => {
    it('should return empty array for venue with no transactions', async () => {
      const trend = await service.getMonthlyVolumeTrend(venueId);

      expect(trend).toEqual([]);
    });

    it('should return monthly breakdown', async () => {
      // Create transactions in current month
      await createTransaction(10000, 9500);
      await createTransaction(20000, 19000);

      const trend = await service.getMonthlyVolumeTrend(venueId);

      expect(trend.length).toBeGreaterThan(0);
      expect(trend[0]).toHaveProperty('month');
      expect(trend[0]).toHaveProperty('volumeCents');
      expect(trend[0]).toHaveProperty('transactionCount');
      expect(trend[0].volumeCents).toBe(28500);
      expect(trend[0].transactionCount).toBe(2);
    });

    it('should order by month descending', async () => {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

      await createTransaction(10000, 9500, 'completed', now);
      await createTransaction(20000, 19000, 'completed', lastMonth);

      const trend = await service.getMonthlyVolumeTrend(venueId);

      expect(trend.length).toBe(2);
      // Most recent month should be first
      expect(trend[0].month > trend[1].month).toBe(true);
    });
  });

  // ===========================================================================
  // QUALIFIES FOR TIER UPGRADE
  // ===========================================================================
  describe('qualifiesForTierUpgrade()', () => {
    it('should return false for venue with insufficient history', async () => {
      await createTransaction(100000, 95000); // Only 1 month of data

      const qualifies = await service.qualifiesForTierUpgrade(venueId, 50000, 3);

      expect(qualifies).toBe(false);
    });

    it('should return false for venue with no transactions', async () => {
      const qualifies = await service.qualifiesForTierUpgrade(venueId, 50000, 3);

      expect(qualifies).toBe(false);
    });

    it('should return true when all months exceed threshold', async () => {
      const now = new Date();

      // Create transactions for 3 different months, all above threshold
      for (let i = 0; i < 3; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 15);
        await createTransaction(100000, 95000, 'completed', date);
        await createTransaction(100000, 95000, 'completed', date);
      }

      // Threshold of 100000 cents ($1000), each month has $1900
      const qualifies = await service.qualifiesForTierUpgrade(venueId, 100000, 3);

      expect(qualifies).toBe(true);
    });

    it('should return false when any month is below threshold', async () => {
      const now = new Date();

      // Month 1: above threshold
      const date1 = new Date(now.getFullYear(), now.getMonth(), 15);
      await createTransaction(100000, 95000, 'completed', date1);
      await createTransaction(100000, 95000, 'completed', date1);

      // Month 2: above threshold
      const date2 = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      await createTransaction(100000, 95000, 'completed', date2);
      await createTransaction(100000, 95000, 'completed', date2);

      // Month 3: below threshold (only $950)
      const date3 = new Date(now.getFullYear(), now.getMonth() - 2, 15);
      await createTransaction(10000, 9500, 'completed', date3);

      const qualifies = await service.qualifiesForTierUpgrade(venueId, 100000, 3);

      expect(qualifies).toBe(false);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle large transaction volumes', async () => {
      // $100,000 transaction
      await createTransaction(10000000, 9500000);

      const volume = await service.getMonthlyVolume(venueId);

      expect(volume).toBe(9500000);
    });

    it('should handle many transactions', async () => {
      // Create 50 transactions
      for (let i = 0; i < 50; i++) {
        await createTransaction(1000, 950);
      }

      const metrics = await service.getVenueMetrics(venueId);

      expect(metrics.transactionCount).toBe(50);
      expect(metrics.monthlyVolumeCents).toBe(47500); // 50 * 950
    });

    it('should isolate venues correctly', async () => {
      // Create another venue
      const otherVenueId = uuidv4();
      await pool.query(`
        INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `, [otherVenueId, tenantId, 'Other Venue', `other-${otherVenueId.slice(0, 8)}`, 'other@test.com', '456 Test St', 'Test City', 'TS', 'US', 'theater', 500]);

      // Create transactions for both venues
      await createTransaction(10000, 9500);

      const txnId = uuidv4();
      await pool.query(`
        INSERT INTO payment_transactions (
          id, tenant_id, venue_id, user_id, event_id, type, amount, currency,
          status, platform_fee, venue_payout, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `, [txnId, tenantId, otherVenueId, userId, eventId, 'ticket_purchase', 50000, 'USD', 'completed', 2500, 47500]);

      // Each venue should only see its own transactions
      const volume1 = await service.getMonthlyVolume(venueId);
      const volume2 = await service.getMonthlyVolume(otherVenueId);

      expect(volume1).toBe(9500);
      expect(volume2).toBe(47500);

      // Cleanup
      await pool.query('DELETE FROM payment_transactions WHERE venue_id = $1', [otherVenueId]);
      await pool.query('DELETE FROM venues WHERE id = $1', [otherVenueId]);
    });
  });
});
