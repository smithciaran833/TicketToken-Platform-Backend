/**
 * COMPONENT TEST: PaymentAnalyticsService
 *
 * Tests analytics queries with REAL Database
 * FIXED: Aligned with actual payment_transactions schema
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

// Mock logger
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock cache service
const mockGetOrCompute = jest.fn();
jest.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    getOrCompute: mockGetOrCompute,
  },
}));

import { PaymentAnalyticsService } from '../../../src/services/payment-analytics.service';

describe('PaymentAnalyticsService Component Tests', () => {
  let pool: Pool;
  let service: PaymentAnalyticsService;
  let tenantId: string;
  let userId: string;
  let venueId: string;
  let venue2Id: string;
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
    venueId = uuidv4();
    venue2Id = uuidv4();
    eventId = uuidv4();

    // Clear mocks
    jest.clearAllMocks();
    
    // Mock cache to just execute the function
    mockGetOrCompute.mockImplementation(async (key: string, fn: Function) => fn());

    service = new PaymentAnalyticsService(pool);

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

    // Create test venues
    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venueId, tenantId, 'Venue A', `venue-a-${venueId.slice(0, 8)}`, 'venue-a@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000]);

    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venue2Id, tenantId, 'Venue B', `venue-b-${venue2Id.slice(0, 8)}`, 'venue-b@test.com', '456 Test Ave', 'Test City', 'TS', 'US', 'arena', 5000]);

    // Create test event
    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`, new Date(Date.now() + 86400000)]);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // HELPER: Create Payment Transaction
  // ===========================================================================
  async function createPayment(data: {
    amount: number; // in dollars
    status: string;
    type?: string;
    createdAt?: Date;
    metadata?: any;
  }) {
    const paymentId = uuidv4();
    const orderId = uuidv4();

    await pool.query(`
      INSERT INTO payment_transactions (
        id, tenant_id, venue_id, user_id, event_id, order_id, type, amount, currency,
        status, platform_fee, venue_payout, created_at, updated_at, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD', $9, $10, $11, $12, $12, $13)
    `, [
      paymentId,
      tenantId,
      venueId,
      userId,
      eventId,
      orderId,
      data.type || 'ticket_purchase',
      data.amount,
      data.status,
      data.amount * 0.05, // 5% platform fee
      data.amount * 0.95, // 95% venue payout
      data.createdAt || new Date(),
      JSON.stringify(data.metadata || {}),
    ]);

    return paymentId;
  }

  // ===========================================================================
  // OVERVIEW METRICS
  // ===========================================================================
  describe('getPaymentInsights() - Overview Metrics', () => {
    it('should calculate overview metrics correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Create test transactions
      await createPayment({ amount: 100, status: 'completed', createdAt: new Date('2024-01-15') });
      await createPayment({ amount: 50, status: 'completed', createdAt: new Date('2024-01-20') });
      await createPayment({ amount: 75, status: 'failed', createdAt: new Date('2024-01-25') });

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      expect(insights.overview.totalTransactions).toBe(3);
      expect(insights.overview.totalRevenueCents).toBe(22500); // (100 + 50 + 75) * 100
      expect(insights.overview.averageTransactionCents).toBe(7500); // 225 / 3 * 100
      expect(insights.overview.successRate).toBeCloseTo(0.666, 2); // 2/3
    });

    it('should return zero metrics for no transactions', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      expect(insights.overview.totalTransactions).toBe(0);
      expect(insights.overview.totalRevenueCents).toBe(0);
      expect(insights.overview.successRate).toBe(0);
    });
  });

  // ===========================================================================
  // TREND DATA
  // ===========================================================================
  describe('getTrendData()', () => {
    it('should aggregate transactions by day', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Day 1: 2 transactions
      await createPayment({ amount: 100, status: 'completed', createdAt: new Date('2024-01-15 10:00:00') });
      await createPayment({ amount: 50, status: 'completed', createdAt: new Date('2024-01-15 14:00:00') });

      // Day 2: 1 transaction
      await createPayment({ amount: 75, status: 'failed', createdAt: new Date('2024-01-20 09:00:00') });

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      expect(insights.trends).toHaveLength(2);
      
      // Find the day with 2 transactions
      const day1 = insights.trends.find(t => t.transactionCount === 2);
      expect(day1?.revenueCents).toBe(15000); // (100 + 50) * 100
      expect(day1?.successRate).toBe(1); // Both completed

      // Find the day with 1 transaction
      const day2 = insights.trends.find(t => t.transactionCount === 1);
      expect(day2?.revenueCents).toBe(7500); // 75 * 100
      expect(day2?.successRate).toBe(0); // Failed
    });
  });

  // ===========================================================================
  // PAYMENT BREAKDOWN
  // ===========================================================================
  describe('getPaymentBreakdown()', () => {
    it('should break down by status', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({ amount: 100, status: 'completed', createdAt: new Date('2024-01-15') });
      await createPayment({ amount: 50, status: 'completed', createdAt: new Date('2024-01-16') });
      await createPayment({ amount: 75, status: 'failed', createdAt: new Date('2024-01-17') });
      await createPayment({ amount: 25, status: 'pending', createdAt: new Date('2024-01-18') });

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      const completed = insights.breakdown.byStatus.find(s => s.status === 'completed');
      expect(completed?.count).toBe(2);
      expect(completed?.revenueCents).toBe(15000); // (100 + 50) * 100

      const failed = insights.breakdown.byStatus.find(s => s.status === 'failed');
      expect(failed?.count).toBe(1);
      expect(failed?.revenueCents).toBe(7500);
    });

    it('should break down by type', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({ amount: 100, status: 'completed', type: 'ticket_purchase', createdAt: new Date('2024-01-15') });
      await createPayment({ amount: 50, status: 'completed', type: 'ticket_purchase', createdAt: new Date('2024-01-16') });
      await createPayment({ amount: 25, status: 'completed', type: 'refund', createdAt: new Date('2024-01-17') });

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      const tickets = insights.breakdown.byType.find(t => t.type === 'ticket_purchase');
      expect(tickets?.count).toBe(2);
      expect(tickets?.revenueCents).toBe(15000);

      const refunds = insights.breakdown.byType.find(t => t.type === 'refund');
      expect(refunds?.count).toBe(1);
      expect(refunds?.revenueCents).toBe(2500);
    });

    it('should extract payment method from metadata', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({
        amount: 100,
        status: 'completed',
        createdAt: new Date('2024-01-15'),
        metadata: { payment_method: 'card' },
      });

      await createPayment({
        amount: 50,
        status: 'completed',
        createdAt: new Date('2024-01-16'),
        metadata: { payment_method: 'paypal' },
      });

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      const card = insights.breakdown.byMethod.find(m => m.method === 'card');
      expect(card?.count).toBe(1);
      expect(card?.revenueCents).toBe(10000);

      const paypal = insights.breakdown.byMethod.find(m => m.method === 'paypal');
      expect(paypal?.count).toBe(1);
      expect(paypal?.revenueCents).toBe(5000);
    });
  });

  // ===========================================================================
  // PERFORMANCE METRICS
  // ===========================================================================
  describe('getPerformanceMetrics()', () => {
    it('should calculate processing times', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Create payment and update it 2 seconds later
      const paymentId = await createPayment({
        amount: 100,
        status: 'completed',
        createdAt: new Date('2024-01-15 10:00:00'),
      });

      await pool.query(`
        UPDATE payment_transactions
        SET updated_at = created_at + INTERVAL '2 seconds'
        WHERE id = $1
      `, [paymentId]);

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      expect(insights.performance.avgProcessingTimeMs).toBeGreaterThan(0);
      expect(insights.performance.p95ProcessingTimeMs).toBeGreaterThan(0);
    });

    it('should calculate error rate', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({ amount: 100, status: 'completed', createdAt: new Date('2024-01-15') });
      await createPayment({ amount: 50, status: 'failed', createdAt: new Date('2024-01-16') });
      await createPayment({ amount: 75, status: 'failed', createdAt: new Date('2024-01-17') });

      const insights = await service.getPaymentInsights(tenantId, startDate, endDate);

      expect(insights.performance.errorRate).toBeCloseTo(0.666, 2); // 2/3 failed
    });
  });

  // ===========================================================================
  // REALTIME ACTIVITY
  // ===========================================================================
  describe('getRealtimeActivity()', () => {
    it('should return activity for last hour', async () => {
      const now = new Date();

      // Create transaction in last hour
      await createPayment({
        amount: 100,
        status: 'completed',
        createdAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
      });

      const activity = await service.getRealtimeActivity(tenantId);

      expect(activity.length).toBeGreaterThan(0);
      expect(activity[0]).toHaveProperty('timestamp');
      expect(activity[0]).toHaveProperty('count');
      expect(activity[0]).toHaveProperty('revenueCents');
    });
  });

  // ===========================================================================
  // TOP VENUES
  // ===========================================================================
  describe('getTopVenues()', () => {
    it('should rank venues by revenue', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Venue A: $150 total
      await createPayment({ amount: 100, status: 'completed', createdAt: new Date('2024-01-15') });
      await createPayment({ amount: 50, status: 'completed', createdAt: new Date('2024-01-16') });

      // Venue B: $200 total (should be #1)
      await pool.query(`
        INSERT INTO payment_transactions (
          id, tenant_id, venue_id, user_id, event_id, order_id, type, amount, currency,
          status, platform_fee, venue_payout, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'ticket_purchase', 200, 'USD', 'completed', 10, 190, $7, $7)
      `, [uuidv4(), tenantId, venue2Id, userId, eventId, uuidv4(), new Date('2024-01-17')]);

      const topVenues = await service.getTopVenues(tenantId, startDate, endDate, 10);

      expect(topVenues).toHaveLength(2);
      expect(topVenues[0].venueId).toBe(venue2Id); // Highest revenue first
      expect(topVenues[0].totalRevenueCents).toBe(20000);
      expect(topVenues[1].venueId).toBe(venueId);
      expect(topVenues[1].totalRevenueCents).toBe(15000);
    });

    it('should respect limit parameter', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({ amount: 100, status: 'completed', createdAt: new Date('2024-01-15') });

      const topVenues = await service.getTopVenues(tenantId, startDate, endDate, 1);

      expect(topVenues).toHaveLength(1);
    });
  });

  // ===========================================================================
  // FAILURE ANALYSIS
  // ===========================================================================
  describe('getFailureAnalysis()', () => {
    it('should analyze failure reasons from metadata', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({
        amount: 100,
        status: 'failed',
        createdAt: new Date('2024-01-15'),
        metadata: {
          error_code: 'card_declined',
          error_message: 'Insufficient funds',
          payment_method: 'card',
        },
      });

      await createPayment({
        amount: 50,
        status: 'failed',
        createdAt: new Date('2024-01-16'),
        metadata: {
          error_code: 'card_declined',
          error_message: 'Insufficient funds',
          payment_method: 'card',
        },
      });

      const failures = await service.getFailureAnalysis(tenantId, startDate, endDate);

      expect(failures).toHaveLength(1);
      expect(failures[0].errorCode).toBe('card_declined');
      expect(failures[0].count).toBe(2);
      expect(failures[0].failedRevenueCents).toBe(15000);
    });

    it('should handle missing error metadata', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({
        amount: 100,
        status: 'failed',
        createdAt: new Date('2024-01-15'),
        metadata: {},
      });

      const failures = await service.getFailureAnalysis(tenantId, startDate, endDate);

      expect(failures).toHaveLength(1);
      expect(failures[0].errorCode).toBe('unknown');
      expect(failures[0].errorMessage).toBe('No error message');
    });
  });

  // ===========================================================================
  // CSV EXPORT
  // ===========================================================================
  describe('exportAnalytics()', () => {
    it('should export transactions as CSV', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await createPayment({ amount: 100, status: 'completed', createdAt: new Date('2024-01-15') });
      await createPayment({ amount: 50, status: 'failed', createdAt: new Date('2024-01-16') });

      const csv = await service.exportAnalytics(tenantId, startDate, endDate);

      expect(csv).toContain('Transaction ID,Date,Amount (cents),Status,Type,Venue ID,User ID');
      expect(csv).toContain('completed');
      expect(csv).toContain('failed');
      expect(csv).toContain('10000'); // $100 in cents
      expect(csv).toContain('5000'); // $50 in cents
    });

    it('should handle empty result set', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const csv = await service.exportAnalytics(tenantId, startDate, endDate);

      expect(csv).toContain('Transaction ID,Date,Amount (cents),Status,Type,Venue ID,User ID');
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // Just header
    });
  });
});
