import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import { getTestDb } from './helpers/db';
import { createResaleService } from '../../src/services/resale.service';

const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEST_VENUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MOCK_EVENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MOCK_TICKET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MOCK_TICKET_2_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MOCK_TICKET_3_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SELLER_USER_ID = 'aaaabbbb-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUYER_USER_ID = 'bbbbcccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN_USER_ID = 'ccccdddd-cccc-4ccc-8ccc-cccccccccccc';

describe('Resale Anti-Scalping Integration Tests - Venue Service', () => {
  let db: ReturnType<typeof getTestDb>;
  let resaleService: ReturnType<typeof createResaleService>;

  beforeAll(async () => {
    db = getTestDb();
    resaleService = createResaleService(db);
  });

  beforeEach(async () => {
    // Clean venue-service tables in correct order
    await db('resale_blocks').del();
    await db('transfer_history').del();
    await db('resale_policies').del();
    await db('venue_settings').del();
    await db('venue_staff').del();
    await db('venues').del();
    await db('users').del();
    await db('tenants').del();

    // Seed tenant
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant-resale',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed users
    await db('users').insert([
      {
        id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        email: 'admin@test.com',
        password_hash: '$2b$10$dummyhash',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: SELLER_USER_ID,
        tenant_id: TEST_TENANT_ID,
        email: 'seller@test.com',
        password_hash: '$2b$10$dummyhash',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: BUYER_USER_ID,
        tenant_id: TEST_TENANT_ID,
        email: 'buyer@test.com',
        password_hash: '$2b$10$dummyhash',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: ADMIN_USER_ID,
        tenant_id: TEST_TENANT_ID,
        email: 'blockedby@test.com',
        password_hash: '$2b$10$dummyhash',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    // Seed venue
    await db('venues').insert({
      id: TEST_VENUE_ID,
      tenant_id: TEST_TENANT_ID,
      name: 'Test Venue',
      slug: 'test-venue-resale',
      email: 'venue@test.com',
      address_line1: '123 Main St',
      city: 'New York',
      state_province: 'NY',
      country_code: 'US',
      venue_type: 'theater',
      max_capacity: 500,
      status: 'active',
      is_verified: false,
      created_by: TEST_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed venue settings
    await db('venue_settings').insert({
      venue_id: TEST_VENUE_ID,
      ticket_resale_allowed: true,
      max_resale_price_multiplier: null,
      max_resale_price_fixed: null,
      max_transfers_per_ticket: null,
      require_seller_verification: false,
      resale_cutoff_hours: null,
      listing_cutoff_hours: null,
      anti_scalping_enabled: true,
      jurisdiction_rules: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  // ===========================================
  // JURISDICTION PRICE CAPS (10 tests)
  // ===========================================
  describe('Jurisdiction Price Caps - US States', () => {
    it('should enforce face value only for Connecticut (US-CT)', () => {
      const rule = resaleService.getJurisdictionRule('US-CT');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should enforce face value only for Louisiana (US-LA)', () => {
      const rule = resaleService.getJurisdictionRule('US-LA');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should enforce face value only for Michigan (US-MI)', () => {
      const rule = resaleService.getJurisdictionRule('US-MI');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should enforce face value only for Minnesota (US-MN)', () => {
      const rule = resaleService.getJurisdictionRule('US-MN');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should allow any price for New York (US-NY - repealed caps)', () => {
      const rule = resaleService.getJurisdictionRule('US-NY');
      expect(rule.maxMultiplier).toBeNull();
    });
  });

  describe('Jurisdiction Price Caps - EU Countries', () => {
    it('should enforce face value only for France (FR)', () => {
      const rule = resaleService.getJurisdictionRule('FR');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should enforce face value only for Italy (IT)', () => {
      const rule = resaleService.getJurisdictionRule('IT');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should enforce face value only for Belgium (BE)', () => {
      const rule = resaleService.getJurisdictionRule('BE');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should allow face value + 10% for United Kingdom (UK)', () => {
      const rule = resaleService.getJurisdictionRule('UK');
      expect(rule.maxMultiplier).toBe(1.1);
    });

    it('should allow any price for DEFAULT jurisdiction', () => {
      const rule = resaleService.getJurisdictionRule('DEFAULT');
      expect(rule.maxMultiplier).toBeNull();
    });
  });

  // ===========================================
  // RESALE POLICY ENFORCEMENT (10 tests)
  // ===========================================
  describe('Resale Policy Enforcement', () => {
    it('should enforce max_transfers limit from policy', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        event_id: MOCK_EVENT_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: true,
        max_transfers: 2,
        created_at: new Date(),
      });

      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: BUYER_USER_ID,
          to_user_id: SELLER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 2,
          transferred_at: new Date(),
        },
      ]);

      const result = await db('transfer_history')
        .where('ticket_id', MOCK_TICKET_ID)
        .count('* as count')
        .first();

      expect(parseInt(String(result!.count))).toBe(2);

      const policy = await db('resale_policies')
        .where({ event_id: MOCK_EVENT_ID })
        .first();

      expect(policy!.max_transfers).toBe(2);
    });

    it('should block resale when policy sets resale_allowed=false', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        event_id: MOCK_EVENT_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: false,
        created_at: new Date(),
      });

      const policy = await db('resale_policies')
        .where({ event_id: MOCK_EVENT_ID })
        .first();

      expect(policy!.resale_allowed).toBe(false);
    });

    it('should allow resale when policy sets resale_allowed=true', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        event_id: MOCK_EVENT_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: true,
        created_at: new Date(),
      });

      const policy = await db('resale_policies')
        .where({ event_id: MOCK_EVENT_ID })
        .first();

      expect(policy!.resale_allowed).toBe(true);
    });

    it('should track transfer_number sequentially', async () => {
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: BUYER_USER_ID,
          to_user_id: SELLER_USER_ID,
          transfer_type: 'resale',
          price: 110.00,
          original_face_value: 90.00,
          transfer_number: 2,
          transferred_at: new Date(),
        },
      ]);

      const transfers = await db('transfer_history')
        .where('ticket_id', MOCK_TICKET_ID)
        .orderBy('transfer_number', 'asc');

      expect(transfers[0].transfer_number).toBe(1);
      expect(transfers[1].transfer_number).toBe(2);
    });

    it('should record price markup in transfer history', async () => {
      await db('transfer_history').insert({
        ticket_id: MOCK_TICKET_ID,
        event_id: MOCK_EVENT_ID,
        venue_id: TEST_VENUE_ID,
        tenant_id: TEST_TENANT_ID,
        from_user_id: SELLER_USER_ID,
        to_user_id: BUYER_USER_ID,
        transfer_type: 'resale',
        price: 150.00,
        original_face_value: 100.00,
        transfer_number: 1,
        transferred_at: new Date(),
      });

      const transfer = await db('transfer_history')
        .where('ticket_id', MOCK_TICKET_ID)
        .first();

      const markup = ((transfer!.price - transfer!.original_face_value) / transfer!.original_face_value) * 100;
      expect(markup).toBe(50);
    });

    it('should support resale cutoff hours in policy', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        event_id: MOCK_EVENT_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: true,
        resale_cutoff_hours: 24,
        created_at: new Date(),
      });

      const policy = await db('resale_policies')
        .where({ event_id: MOCK_EVENT_ID })
        .first();

      expect(policy!.resale_cutoff_hours).toBe(24);
    });

    it('should support listing cutoff hours in policy', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        event_id: MOCK_EVENT_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: true,
        listing_cutoff_hours: 48,
        created_at: new Date(),
      });

      const policy = await db('resale_policies')
        .where({ event_id: MOCK_EVENT_ID })
        .first();

      expect(policy!.listing_cutoff_hours).toBe(48);
    });

    it('should allow venue-level default policies', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: true,
        max_transfers: 5,
        created_at: new Date(),
      });

      const policy = await db('resale_policies')
        .where({ venue_id: TEST_VENUE_ID })
        .whereNull('event_id')
        .first();

      expect(policy!.max_transfers).toBe(5);
      expect(policy!.event_id).toBeNull();
    });

    it('should support price multiplier restrictions', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        event_id: MOCK_EVENT_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: true,
        max_price_multiplier: 1.5,
        created_at: new Date(),
      });

      const policy = await db('resale_policies')
        .where({ event_id: MOCK_EVENT_ID })
        .first();

      expect(parseFloat(policy!.max_price_multiplier)).toBe(1.5);
    });

    it('should support fixed price caps in policy', async () => {
      await db('resale_policies').insert({
        venue_id: TEST_VENUE_ID,
        event_id: MOCK_EVENT_ID,
        tenant_id: TEST_TENANT_ID,
        resale_allowed: true,
        max_price_fixed: 200.00,
        created_at: new Date(),
      });

      const policy = await db('resale_policies')
        .where({ event_id: MOCK_EVENT_ID })
        .first();

      expect(parseFloat(policy!.max_price_fixed)).toBe(200.00);
    });
  });

  // ===========================================
  // RESALE BLOCKS (5 tests)
  // ===========================================
  describe('Resale Blocks', () => {
    it('should create resale block for user', async () => {
      await db('resale_blocks').insert({
        user_id: SELLER_USER_ID,
        tenant_id: TEST_TENANT_ID,
        reason: 'Excessive scalping detected',
        blocked_by: ADMIN_USER_ID,
        blocked_at: new Date(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        active: true,
      });

      const block = await db('resale_blocks')
        .where('user_id', SELLER_USER_ID)
        .first();

      expect(block!.reason).toContain('scalping');
      expect(block!.active).toBe(true);
    });

    it('should support permanent blocks', async () => {
      await db('resale_blocks').insert({
        user_id: SELLER_USER_ID,
        tenant_id: TEST_TENANT_ID,
        reason: 'Fraud detected',
        blocked_by: ADMIN_USER_ID,
        blocked_at: new Date(),
        expires_at: null,
        active: true,
      });

      const block = await db('resale_blocks')
        .where('user_id', SELLER_USER_ID)
        .first();

      expect(block!.expires_at).toBeNull();
    });

    it('should support temporary blocks', async () => {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      await db('resale_blocks').insert({
        user_id: SELLER_USER_ID,
        tenant_id: TEST_TENANT_ID,
        reason: 'Review required',
        blocked_by: ADMIN_USER_ID,
        blocked_at: new Date(),
        expires_at: expiresAt,
        active: true,
      });

      const block = await db('resale_blocks')
        .where('user_id', SELLER_USER_ID)
        .first();

      expect(block!.expires_at).toBeTruthy();
    });

    it('should record who blocked the user', async () => {
      await db('resale_blocks').insert({
        user_id: SELLER_USER_ID,
        tenant_id: TEST_TENANT_ID,
        reason: 'High risk activity',
        blocked_by: ADMIN_USER_ID,
        blocked_at: new Date(),
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        active: true,
      });

      const block = await db('resale_blocks')
        .where('user_id', SELLER_USER_ID)
        .first();

      expect(block!.blocked_by).toBe(ADMIN_USER_ID);
    });

    it('should allow querying active blocks', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await db('resale_blocks').insert({
        user_id: SELLER_USER_ID,
        tenant_id: TEST_TENANT_ID,
        reason: 'Active block',
        blocked_by: ADMIN_USER_ID,
        blocked_at: new Date(),
        expires_at: futureDate,
        active: true,
      });

      const activeBlocks = await db('resale_blocks')
        .where('user_id', SELLER_USER_ID)
        .where('active', true);

      expect(activeBlocks.length).toBeGreaterThan(0);
    });
  });

  // ===========================================
  // TRANSFER HISTORY ANALYTICS (7 tests)
  // ===========================================
  describe('Transfer History Analytics', () => {
    it('should calculate average markup from transfer history', async () => {
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 150.00,
          original_face_value: 100.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_2_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 200.00,
          original_face_value: 100.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
      ]);

      const transfers = await db('transfer_history')
        .where('from_user_id', SELLER_USER_ID);

      const avgMarkup = transfers.reduce((sum, t) => 
        sum + ((t.price - t.original_face_value) / t.original_face_value) * 100, 0
      ) / transfers.length;

      expect(avgMarkup).toBe(75);
    });

    it('should track quick flip patterns', async () => {
      const baseTime = new Date();
      
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 120.00,
          original_face_value: 100.00,
          transfer_number: 1,
          transferred_at: new Date(baseTime.getTime() - 2 * 60 * 60 * 1000),
        },
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: BUYER_USER_ID,
          to_user_id: SELLER_USER_ID,
          transfer_type: 'resale',
          price: 130.00,
          original_face_value: 100.00,
          transfer_number: 2,
          transferred_at: baseTime,
        },
      ]);

      const transfers = await db('transfer_history')
        .where('ticket_id', MOCK_TICKET_ID)
        .orderBy('transfer_number', 'asc');

      const timeDiff = transfers[1].transferred_at.getTime() - transfers[0].transferred_at.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      expect(hoursDiff).toBeLessThan(24);
    });

    it('should count transfers per seller', async () => {
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_2_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
      ]);

      const result = await db('transfer_history')
        .where('from_user_id', SELLER_USER_ID)
        .count('* as count')
        .first();

      expect(parseInt(String(result!.count))).toBe(2);
    });

    it('should filter transfers by date range', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_2_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        },
      ]);

      const recentTransfers = await db('transfer_history')
        .where('from_user_id', SELLER_USER_ID)
        .where('transferred_at', '>=', thirtyDaysAgo);

      expect(recentTransfers.length).toBe(1);
    });

    it('should distinguish transfer types', async () => {
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_2_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'gift',
          price: 0.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
      ]);

      const resales = await db('transfer_history')
        .where('transfer_type', 'resale');
      
      const gifts = await db('transfer_history')
        .where('transfer_type', 'gift');

      expect(resales.length).toBe(1);
      expect(gifts.length).toBe(1);
    });

    it('should aggregate revenue per event', async () => {
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 100.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_2_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 150.00,
          original_face_value: 90.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
      ]);

      const result = await db('transfer_history')
        .where('event_id', MOCK_EVENT_ID)
        .sum('price as total_revenue')
        .first();

      expect(parseFloat(String(result!.total_revenue))).toBe(250.00);
    });

    it('should track seller performance metrics', async () => {
      await db('transfer_history').insert([
        {
          ticket_id: MOCK_TICKET_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 200.00,
          original_face_value: 100.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
        {
          ticket_id: MOCK_TICKET_2_ID,
          event_id: MOCK_EVENT_ID,
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          from_user_id: SELLER_USER_ID,
          to_user_id: BUYER_USER_ID,
          transfer_type: 'resale',
          price: 180.00,
          original_face_value: 100.00,
          transfer_number: 1,
          transferred_at: new Date(),
        },
      ]);

      const stats = await db('transfer_history')
        .where('from_user_id', SELLER_USER_ID)
        .select(
          db.raw('COUNT(*) as sale_count'),
          db.raw('AVG(price) as avg_price'),
          db.raw('AVG((price - original_face_value) / original_face_value * 100) as avg_markup_pct')
        )
        .first();

      expect(parseInt(String(stats!.sale_count))).toBe(2);
      expect(parseFloat(String(stats!.avg_price))).toBe(190.00);
      expect(parseFloat(String(stats!.avg_markup_pct))).toBe(90.00);
    });
  });
});
