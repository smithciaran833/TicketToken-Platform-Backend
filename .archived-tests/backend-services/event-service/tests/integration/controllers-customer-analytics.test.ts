/**
 * Customer Analytics Controller Integration Tests
 * 
 * Tests:
 * - Success path with data
 * - Empty data handling
 * - Schedule enrichment
 * - Error handling
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import * as customerAnalyticsController from '../../src/controllers/customer-analytics.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Customer Analytics Controller', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  function createMockRequest(overrides: any = {}): any {
    return {
      params: overrides.params || {},
      body: overrides.body || {},
      headers: overrides.headers || { authorization: `Bearer ${generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' })}` },
      tenantId: TEST_TENANT_ID,
      container: (context.app as any).container,
      log: { error: jest.fn() },
    };
  }

  function createMockReply(): any {
    const reply: any = {
      statusCode: 200,
      sentData: null,
      status: jest.fn((code: number) => { reply.statusCode = code; return reply; }),
      send: jest.fn((data: any) => { reply.sentData = data; return reply; }),
    };
    return reply;
  }

  async function createEventDirect(overrides: any = {}) {
    const eventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, TEST_TENANT_ID, TEST_VENUE_ID, overrides.name || 'Test Event', `test-${eventId.slice(0, 8)}`, 'PUBLISHED', 'single', TEST_USER_ID]
    );
    return { id: eventId, name: overrides.name || 'Test Event' };
  }

  async function createPricingDirect(eventId: string, overrides: any = {}) {
    const pricingId = uuidv4();
    await pool.query(
      `INSERT INTO event_pricing (id, tenant_id, event_id, name, base_price, current_price, is_active, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pricingId, TEST_TENANT_ID, eventId, overrides.name || 'GA', overrides.base_price ?? 50.00, 50.00, true, true]
    );
    return { id: pricingId };
  }

  async function createScheduleDirect(eventId: string, overrides: any = {}) {
    const scheduleId = uuidv4();
    const startsAt = overrides.starts_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO event_schedules (id, tenant_id, event_id, starts_at, ends_at, timezone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [scheduleId, TEST_TENANT_ID, eventId, startsAt, endsAt, 'UTC', 'SCHEDULED']
    );
    return { id: scheduleId, starts_at: startsAt };
  }

  // ==========================================================================
  // getCustomerProfile - Basic functionality
  // ==========================================================================
  describe('getCustomerProfile', () => {
    it('should return customer profile with customerId', async () => {
      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.customerId).toBe(customerId);
      expect(reply.sentData.profile).toBeDefined();
    });

    it('should include note about ticket-service', async () => {
      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      expect(reply.sentData.profile.note).toContain('ticket-service');
    });

    it('should return empty purchases when no pricing data', async () => {
      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      expect(reply.sentData.profile.total_purchases).toBe(0);
      expect(reply.sentData.profile.recent_purchases).toEqual([]);
    });
  });

  // ==========================================================================
  // getCustomerProfile - With real data
  // ==========================================================================
  describe('getCustomerProfile - with data', () => {
    it('should return purchases with event info', async () => {
      const event = await createEventDirect({ name: 'Amazing Concert' });
      await createPricingDirect(event.id, { name: 'VIP', base_price: 150.00 });

      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      expect(reply.sentData.profile.total_purchases).toBeGreaterThanOrEqual(1);
      
      const purchase = reply.sentData.profile.recent_purchases[0];
      expect(purchase.event_name).toBe('Amazing Concert');
      expect(purchase.tier_name).toBe('VIP');
      expect(parseFloat(purchase.price)).toBe(150);
    });

    it('should enrich purchases with schedule starts_at', async () => {
      const event = await createEventDirect({ name: 'Scheduled Event' });
      await createPricingDirect(event.id);
      const schedule = await createScheduleDirect(event.id);

      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      const purchase = reply.sentData.profile.recent_purchases.find(
        (p: any) => p.event_name === 'Scheduled Event'
      );
      
      if (purchase) {
        expect(purchase.starts_at).toBeDefined();
        expect(new Date(purchase.starts_at).getTime()).toBe(schedule.starts_at.getTime());
      }
    });

    it('should handle events with no schedules (starts_at undefined)', async () => {
      const event = await createEventDirect({ name: 'Unscheduled Event' });
      await createPricingDirect(event.id);
      // No schedule created

      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      const purchase = reply.sentData.profile.recent_purchases.find(
        (p: any) => p.event_name === 'Unscheduled Event'
      );
      
      if (purchase) {
        expect(purchase.starts_at).toBeUndefined();
      }
    });

    it('should limit to 10 purchases', async () => {
      // Create 15 events with pricing
      for (let i = 0; i < 15; i++) {
        const event = await createEventDirect({ name: `Event ${i}` });
        await createPricingDirect(event.id);
      }

      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      expect(reply.sentData.profile.recent_purchases.length).toBeLessThanOrEqual(10);
    });

    it('should only return active pricing', async () => {
      const event = await createEventDirect({ name: 'Mixed Pricing Event' });
      
      // Active pricing
      await createPricingDirect(event.id, { name: 'Active Tier', base_price: 100.00 });
      
      // Inactive pricing (manual insert)
      const inactivePricingId = uuidv4();
      await pool.query(
        `INSERT INTO event_pricing (id, tenant_id, event_id, name, base_price, current_price, is_active, is_visible)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [inactivePricingId, TEST_TENANT_ID, event.id, 'Inactive Tier', 50.00, 50.00, false, true]
      );

      const customerId = uuidv4();
      const request = createMockRequest({ params: { customerId } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      // Should only have active tier
      const eventPurchases = reply.sentData.profile.recent_purchases.filter(
        (p: any) => p.event_name === 'Mixed Pricing Event'
      );
      
      expect(eventPurchases.length).toBe(1);
      expect(eventPurchases[0].tier_name).toBe('Active Tier');
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================
  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      const request = createMockRequest({ params: { customerId: uuidv4() } });
      request.container = { cradle: { db: null } }; // Broken DB
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      expect(reply.statusCode).toBe(500);
      expect(reply.sentData.success).toBe(false);
    });

    it('should handle invalid customerId format', async () => {
      const request = createMockRequest({ params: { customerId: 'not-a-uuid' } });
      const reply = createMockReply();

      await customerAnalyticsController.getCustomerProfile(request, reply);

      // Should still work - customerId is just passed through
      expect(reply.sentData.customerId).toBe('not-a-uuid');
    });
  });
});
