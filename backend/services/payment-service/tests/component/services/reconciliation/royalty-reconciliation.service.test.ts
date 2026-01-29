/**
 * COMPONENT TEST: RoyaltyReconciliationService
 *
 * Tests royalty reconciliation with REAL PostgreSQL, mocked blockchain client.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

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

import {
  RoyaltyReconciliationService,
  BlockchainIndexerClient,
  SecondarySale
} from '../../../../src/services/reconciliation/royalty-reconciliation.service';

describe('RoyaltyReconciliationService Component Tests', () => {
  let pool: Pool;
  let service: RoyaltyReconciliationService;
  let mockBlockchainClient: jest.Mocked<BlockchainIndexerClient>;
  let tenantId: string;
  let venueId: string;
  let eventId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'tickettoken_db',
      user: 'postgres',
      password: 'postgres',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    venueId = uuidv4();
    eventId = uuidv4();

    // Create tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create venue
    await pool.query(`
      INSERT INTO venues (
        id, tenant_id, name, slug, email, address_line1, city, 
        state_province, country_code, venue_type, max_capacity, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [
      venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`,
      'venue@test.com', '123 Main St', 'Test City', 'TS', 'US', 'arena', 1000
    ]);

    // Create event
    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'PUBLISHED', NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`]);

    // Create mock blockchain client
    mockBlockchainClient = {
      getSecondarySales: jest.fn().mockResolvedValue([]),
      getTransaction: jest.fn().mockResolvedValue(null),
    };

    service = new RoyaltyReconciliationService(pool, mockBlockchainClient);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM royalty_discrepancies WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM royalty_distributions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM royalty_payouts WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM royalty_reconciliation_runs WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM event_royalty_settings WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venue_royalty_settings WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // Helper to create venue royalty settings
  async function createVenueRoyaltySettings(percentage: number = 10, minPayout: number = 1000) {
    await pool.query(`
      INSERT INTO venue_royalty_settings (
        tenant_id, venue_id, default_royalty_percentage, minimum_payout_amount_cents
      ) VALUES ($1, $2, $3, $4)
    `, [tenantId, venueId, percentage, minPayout]);
  }

  // Helper to create event royalty settings
  async function createEventRoyaltySettings(venuePercent: number, artistPercent: number = 0) {
    await pool.query(`
      INSERT INTO event_royalty_settings (
        tenant_id, event_id, venue_royalty_percentage, artist_royalty_percentage
      ) VALUES ($1, $2, $3, $4)
    `, [tenantId, eventId, venuePercent, artistPercent]);
  }

  // Helper to create a royalty distribution
  async function createDistribution(
    transactionId: string,
    recipientType: string,
    amountCents: number
  ): Promise<string> {
    const result = await pool.query(`
      INSERT INTO royalty_distributions (
        tenant_id, transaction_id, event_id, transaction_type,
        recipient_type, recipient_id, amount_cents, percentage, status
      ) VALUES ($1, $2, $3, 'secondary_sale', $4, $5, $6, 10, 'pending')
      RETURNING id
    `, [tenantId, transactionId, eventId, recipientType, venueId, amountCents]);
    return result.rows[0].id;
  }

  // Helper to create mock sale
  function createMockSale(overrides: Partial<SecondarySale> = {}): SecondarySale {
    return {
      signature: uuidv4(),
      tokenId: uuidv4(),
      price: 10000, // $100 in cents
      seller: '0xseller',
      buyer: '0xbuyer',
      timestamp: new Date(),
      eventId,
      venueId,
      tenantId,
      ...overrides
    };
  }

  // ===========================================================================
  // RECONCILIATION RUN
  // ===========================================================================
  describe('runReconciliation()', () => {
    it('should create a reconciliation run', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await service.runReconciliation(tenantId, startDate, endDate);

      expect(result.runId).toBeDefined();
      expect(result.transactionsChecked).toBe(0);
      expect(result.discrepanciesFound).toBe(0);

      // Verify run in database
      const run = await service.getReconciliationRun(result.runId);
      expect(run).not.toBeNull();
      expect(run.status).toBe('completed');
    });

    it('should detect missing distributions', async () => {
      const sale = createMockSale();
      mockBlockchainClient.getSecondarySales.mockResolvedValue([sale]);
      await createVenueRoyaltySettings(10);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await service.runReconciliation(tenantId, startDate, endDate);

      expect(result.transactionsChecked).toBe(1);
      expect(result.discrepanciesFound).toBe(1);
      expect(result.discrepanciesResolved).toBe(1);

      // Verify discrepancy recorded
      const discrepancies = await service.getDiscrepancies(result.runId);
      expect(discrepancies).toHaveLength(1);
      expect(discrepancies[0].discrepancy_type).toBe('missing_distribution');
    });

    it('should detect amount mismatches', async () => {
      const transactionId = uuidv4();
      const sale = createMockSale({ signature: transactionId, price: 10000 });
      mockBlockchainClient.getSecondarySales.mockResolvedValue([sale]);

      // Create distribution with wrong amount
      await createDistribution(transactionId, 'venue', 500); // Should be ~1000

      await createVenueRoyaltySettings(10);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await service.runReconciliation(tenantId, startDate, endDate);

      expect(result.discrepanciesFound).toBe(1);

      const discrepancies = await service.getDiscrepancies(result.runId);
      expect(discrepancies[0].discrepancy_type).toBe('incorrect_amount');
    });

    it('should not flag matching distributions', async () => {
      const transactionId = uuidv4();
      const sale = createMockSale({ signature: transactionId, price: 10000 });
      mockBlockchainClient.getSecondarySales.mockResolvedValue([sale]);

      // 10% venue + 5% platform = 1500 cents
      await createDistribution(transactionId, 'venue', 1000);
      await createDistribution(transactionId, 'platform', 500);
      await createVenueRoyaltySettings(10);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await service.runReconciliation(tenantId, startDate, endDate);

      expect(result.discrepanciesFound).toBe(0);
      expect(result.totalRoyaltiesPaid).toBe(1500);
    });
  });

  // ===========================================================================
  // CALCULATE EXPECTED ROYALTIES
  // ===========================================================================
  describe('calculateExpectedRoyalties()', () => {
    it('should use default venue percentage', async () => {
      await createVenueRoyaltySettings(10);

      const sale = createMockSale({ price: 10000 });
      const royalties = await service.calculateExpectedRoyalties(tenantId, sale);

      expect(royalties.venue).toBe(1000); // 10%
      expect(royalties.platform).toBe(500); // 5%
      expect(royalties.artist).toBe(0);
      expect(royalties.total).toBe(1500);
    });

    it('should use event-specific settings', async () => {
      await createVenueRoyaltySettings(10);
      await createEventRoyaltySettings(15, 5);

      const sale = createMockSale({ price: 10000 });
      const royalties = await service.calculateExpectedRoyalties(tenantId, sale);

      expect(royalties.venue).toBe(1500); // 15%
      expect(royalties.artist).toBe(500); // 5%
      expect(royalties.platform).toBe(500); // 5%
      expect(royalties.total).toBe(2500);
    });

    it('should default to 10% if no settings exist', async () => {
      const sale = createMockSale({ price: 10000 });
      const royalties = await service.calculateExpectedRoyalties(tenantId, sale);

      expect(royalties.venue).toBe(1000); // Default 10%
      expect(royalties.platform).toBe(500); // 5%
    });
  });

  // ===========================================================================
  // SCHEDULE PAYOUTS
  // ===========================================================================
  describe('schedulePayouts()', () => {
    it('should create payouts for pending distributions above threshold', async () => {
      await createVenueRoyaltySettings(10, 1000);
      
      // Create distributions totaling 2000 cents (above 1000 threshold)
      const txId = uuidv4();
      await createDistribution(txId, 'venue', 2000);

      const payoutsCreated = await service.schedulePayouts(tenantId);

      expect(payoutsCreated).toBe(1);

      // Verify payout created
      const payouts = await pool.query(
        'SELECT * FROM royalty_payouts WHERE tenant_id = $1',
        [tenantId]
      );
      expect(payouts.rows).toHaveLength(1);
      expect(parseFloat(payouts.rows[0].amount_cents)).toBe(2000);
      expect(payouts.rows[0].status).toBe('scheduled');

      // Verify distributions marked as scheduled
      const dists = await pool.query(
        'SELECT status FROM royalty_distributions WHERE tenant_id = $1',
        [tenantId]
      );
      expect(dists.rows[0].status).toBe('scheduled');
    });

    it('should skip payouts below minimum threshold', async () => {
      await createVenueRoyaltySettings(10, 5000); // High threshold

      const txId = uuidv4();
      await createDistribution(txId, 'venue', 1000); // Below threshold

      const payoutsCreated = await service.schedulePayouts(tenantId);

      expect(payoutsCreated).toBe(0);
    });

    it('should handle multiple recipients', async () => {
      await createVenueRoyaltySettings(10, 500);

      const txId1 = uuidv4();
      const txId2 = uuidv4();
      await createDistribution(txId1, 'venue', 1000);
      await createDistribution(txId2, 'platform', 800);

      const payoutsCreated = await service.schedulePayouts(tenantId);

      expect(payoutsCreated).toBe(2);
    });
  });

  // ===========================================================================
  // GET DISTRIBUTIONS
  // ===========================================================================
  describe('getRoyaltyDistributions()', () => {
    it('should return distributions within date range', async () => {
      const txId = uuidv4();
      await createDistribution(txId, 'venue', 1000);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2025-12-31');

      const distributions = await service.getRoyaltyDistributions(tenantId, startDate, endDate);

      expect(distributions).toHaveLength(1);
      expect(distributions[0].transaction_id).toBe(txId);
    });

    it('should filter by tenant', async () => {
      const otherTenantId = uuidv4();
      const txId = uuidv4();
      await createDistribution(txId, 'venue', 1000);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2025-12-31');

      const distributions = await service.getRoyaltyDistributions(otherTenantId, startDate, endDate);

      expect(distributions).toHaveLength(0);
    });
  });

  // ===========================================================================
  // RUN STATUS
  // ===========================================================================
  describe('getReconciliationRun()', () => {
    it('should return run details', async () => {
      const result = await service.runReconciliation(
        tenantId,
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      const run = await service.getReconciliationRun(result.runId);

      expect(run).not.toBeNull();
      expect(run.tenant_id).toBe(tenantId);
      expect(run.status).toBe('completed');
    });

    it('should return null for non-existent run', async () => {
      const run = await service.getReconciliationRun(uuidv4());
      expect(run).toBeNull();
    });
  });
});
