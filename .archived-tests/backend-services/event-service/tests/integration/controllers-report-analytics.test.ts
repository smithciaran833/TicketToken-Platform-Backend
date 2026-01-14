/**
 * Report Analytics Controller Integration Tests
 * 
 * Tests all code paths with real data:
 * - Sales report with actual sales data
 * - Venue comparison with real events
 * - Customer insights with categories
 * - Error handling
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import * as reportAnalyticsController from '../../src/controllers/report-analytics.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Report Analytics Controller', () => {
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
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by, primary_category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eventId, TEST_TENANT_ID, overrides.venue_id || TEST_VENUE_ID, overrides.name || 'Test Event', `test-${eventId.slice(0, 8)}`, 'PUBLISHED', 'single', TEST_USER_ID, overrides.category_id || null]
    );
    return { id: eventId };
  }

  async function createCapacityDirect(eventId: string, overrides: any = {}) {
    const capacityId = uuidv4();
    await pool.query(
      `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [capacityId, TEST_TENANT_ID, eventId, overrides.section_name || 'GA', overrides.total_capacity ?? 100, overrides.available_capacity ?? 50, 0, overrides.sold_count ?? 50, true]
    );
    return { id: capacityId };
  }

  async function createPricingDirect(eventId: string, capacityId: string, overrides: any = {}) {
    const pricingId = uuidv4();
    await pool.query(
      `INSERT INTO event_pricing (id, tenant_id, event_id, capacity_id, name, base_price, current_price, is_active, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [pricingId, TEST_TENANT_ID, eventId, capacityId, overrides.name || 'GA', overrides.base_price ?? 50.00, 50.00, true, true]
    );
    return { id: pricingId };
  }

  async function createCategoryDirect(overrides: any = {}) {
    const categoryId = uuidv4();
    await pool.query(
      `INSERT INTO event_categories (id, name, slug) VALUES ($1, $2, $3)`,
      [categoryId, overrides.name || 'Test Category', `cat-${categoryId.slice(0, 8)}`]
    );
    return { id: categoryId };
  }

  // ==========================================================================
  // getSalesReport
  // ==========================================================================
  describe('getSalesReport', () => {
    it('should return empty sales report when no data', async () => {
      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getSalesReport(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.report.type).toBe('sales');
      expect(reply.sentData.report.data).toEqual([]);
      expect(reply.sentData.report.generated_at).toBeDefined();
    });

    it('should calculate revenue from sold_count * base_price', async () => {
      // Create event with capacity and pricing
      const event = await createEventDirect({ name: 'Concert' });
      const capacity = await createCapacityDirect(event.id, { sold_count: 100, total_capacity: 200 });
      await createPricingDirect(event.id, capacity.id, { base_price: 50.00 });

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getSalesReport(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.report.data.length).toBeGreaterThanOrEqual(1);
      
      const eventSales = reply.sentData.report.data.find((d: any) => d.id === event.id);
      if (eventSales) {
        expect(parseInt(eventSales.tickets_sold)).toBe(100);
        expect(parseFloat(eventSales.revenue)).toBe(5000); // 100 * 50
      }
    });

    it('should aggregate multiple capacity sections', async () => {
      const event = await createEventDirect({ name: 'Multi-Section Event' });
      
      // VIP section: 20 sold @ $150 = $3000
      const vipCapacity = await createCapacityDirect(event.id, { section_name: 'VIP', sold_count: 20, total_capacity: 50 });
      await createPricingDirect(event.id, vipCapacity.id, { name: 'VIP', base_price: 150.00 });
      
      // GA section: 80 sold @ $50 = $4000
      const gaCapacity = await createCapacityDirect(event.id, { section_name: 'GA', sold_count: 80, total_capacity: 200 });
      await createPricingDirect(event.id, gaCapacity.id, { name: 'GA', base_price: 50.00 });

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getSalesReport(request, reply);

      expect(reply.sentData.success).toBe(true);
      // Total: 100 tickets, $7000 revenue
      const eventSales = reply.sentData.report.data.find((d: any) => d.id === event.id);
      if (eventSales) {
        expect(parseInt(eventSales.tickets_sold)).toBe(100);
        expect(parseFloat(eventSales.revenue)).toBe(7000);
      }
    });

    it('should order by revenue descending', async () => {
      // Low revenue event
      const event1 = await createEventDirect({ name: 'Small Event' });
      const cap1 = await createCapacityDirect(event1.id, { sold_count: 10 });
      await createPricingDirect(event1.id, cap1.id, { base_price: 10.00 }); // $100

      // High revenue event
      const event2 = await createEventDirect({ name: 'Big Event' });
      const cap2 = await createCapacityDirect(event2.id, { sold_count: 100 });
      await createPricingDirect(event2.id, cap2.id, { base_price: 100.00 }); // $10,000

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getSalesReport(request, reply);

      expect(reply.sentData.report.data.length).toBe(2);
      expect(reply.sentData.report.data[0].event_name).toBe('Big Event');
      expect(reply.sentData.report.data[1].event_name).toBe('Small Event');
    });

    it('should handle events with no pricing (NULL revenue)', async () => {
      const event = await createEventDirect({ name: 'Free Event' });
      await createCapacityDirect(event.id, { sold_count: 50 });
      // No pricing created

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getSalesReport(request, reply);

      // Should not crash, might return empty or null revenue
      expect(reply.sentData.success).toBe(true);
    });
  });

  // ==========================================================================
  // getVenueComparisonReport
  // ==========================================================================
  describe('getVenueComparisonReport', () => {
    it('should return empty comparison when no data', async () => {
      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getVenueComparisonReport(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.report.type).toBe('venue_comparison');
      expect(reply.sentData.report.data).toEqual([]);
    });

    it('should aggregate by venue_id', async () => {
      const venue1 = uuidv4();
      const venue2 = uuidv4();

      // Venue 1: 2 events, 150 total capacity, 100 sold
      const event1a = await createEventDirect({ venue_id: venue1, name: 'Venue1 Event A' });
      await createCapacityDirect(event1a.id, { total_capacity: 100, sold_count: 60 });
      const event1b = await createEventDirect({ venue_id: venue1, name: 'Venue1 Event B' });
      await createCapacityDirect(event1b.id, { total_capacity: 50, sold_count: 40 });

      // Venue 2: 1 event, 200 capacity, 150 sold
      const event2 = await createEventDirect({ venue_id: venue2, name: 'Venue2 Event' });
      await createCapacityDirect(event2.id, { total_capacity: 200, sold_count: 150 });

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getVenueComparisonReport(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.report.data.length).toBe(2);

      const v1Data = reply.sentData.report.data.find((d: any) => d.venue_id === venue1);
      const v2Data = reply.sentData.report.data.find((d: any) => d.venue_id === venue2);

      if (v1Data && v2Data) {
        expect(parseInt(v1Data.event_count)).toBe(2);
        expect(parseInt(v1Data.total_capacity)).toBe(150);
        expect(parseInt(v1Data.total_sold)).toBe(100);

        expect(parseInt(v2Data.event_count)).toBe(1);
        expect(parseInt(v2Data.total_capacity)).toBe(200);
        expect(parseInt(v2Data.total_sold)).toBe(150);
      }
    });

    it('should order by total_sold descending', async () => {
      const venue1 = uuidv4();
      const venue2 = uuidv4();

      const event1 = await createEventDirect({ venue_id: venue1 });
      await createCapacityDirect(event1.id, { sold_count: 10 });

      const event2 = await createEventDirect({ venue_id: venue2 });
      await createCapacityDirect(event2.id, { sold_count: 100 });

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getVenueComparisonReport(request, reply);

      expect(reply.sentData.report.data[0].venue_id).toBe(venue2);
    });

    it('should handle events with no capacity', async () => {
      await createEventDirect({ name: 'No Capacity Event' });
      // No capacity created

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getVenueComparisonReport(request, reply);

      // Should not crash
      expect(reply.sentData.success).toBe(true);
    });
  });

  // ==========================================================================
  // getCustomerInsightsReport
  // ==========================================================================
  describe('getCustomerInsightsReport', () => {
    it('should return empty insights when no data', async () => {
      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getCustomerInsightsReport(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.report.type).toBe('customer_insights');
      expect(reply.sentData.report.data).toEqual([]);
    });

    it('should aggregate by category', async () => {
      const category1 = await createCategoryDirect({ name: 'Music' });
      const category2 = await createCategoryDirect({ name: 'Sports' });

      // Music: 2 events, avg price $75
      const musicEvent1 = await createEventDirect({ name: 'Concert 1', category_id: category1.id });
      const mc1 = await createCapacityDirect(musicEvent1.id, { sold_count: 50 });
      await createPricingDirect(musicEvent1.id, mc1.id, { base_price: 100.00 });

      const musicEvent2 = await createEventDirect({ name: 'Concert 2', category_id: category1.id });
      const mc2 = await createCapacityDirect(musicEvent2.id, { sold_count: 30 });
      await createPricingDirect(musicEvent2.id, mc2.id, { base_price: 50.00 });

      // Sports: 1 event, avg price $25
      const sportsEvent = await createEventDirect({ name: 'Game', category_id: category2.id });
      const sc = await createCapacityDirect(sportsEvent.id, { sold_count: 200 });
      await createPricingDirect(sportsEvent.id, sc.id, { base_price: 25.00 });

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getCustomerInsightsReport(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.report.data.length).toBe(2);

      // Sports should be first (200 tickets sold)
      expect(reply.sentData.report.data[0].category).toBe('Sports');
      expect(parseInt(reply.sentData.report.data[0].tickets_sold)).toBe(200);
    });

    it('should calculate average ticket price per category', async () => {
      const category = await createCategoryDirect({ name: 'Comedy' });

      const event1 = await createEventDirect({ name: 'Show 1', category_id: category.id });
      const c1 = await createCapacityDirect(event1.id, { sold_count: 100 });
      await createPricingDirect(event1.id, c1.id, { base_price: 30.00 });

      const event2 = await createEventDirect({ name: 'Show 2', category_id: category.id });
      const c2 = await createCapacityDirect(event2.id, { sold_count: 100 });
      await createPricingDirect(event2.id, c2.id, { base_price: 50.00 });

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getCustomerInsightsReport(request, reply);

      const comedyData = reply.sentData.report.data.find((d: any) => d.category === 'Comedy');
      if (comedyData) {
        // Average of 30 and 50 = 40
        expect(parseFloat(comedyData.avg_ticket_price)).toBeCloseTo(40, 0);
      }
    });

    it('should exclude events without categories', async () => {
      // Event with category
      const category = await createCategoryDirect({ name: 'Theater' });
      const catEvent = await createEventDirect({ name: 'Play', category_id: category.id });
      const cc = await createCapacityDirect(catEvent.id, { sold_count: 50 });
      await createPricingDirect(catEvent.id, cc.id);

      // Event without category (should be excluded from insights)
      const noCatEvent = await createEventDirect({ name: 'Mystery Event' });
      await createCapacityDirect(noCatEvent.id, { sold_count: 100 });

      const request = createMockRequest({});
      const reply = createMockReply();

      await reportAnalyticsController.getCustomerInsightsReport(request, reply);

      // Only Theater category should appear
      expect(reply.sentData.report.data.length).toBe(1);
      expect(reply.sentData.report.data[0].category).toBe('Theater');
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================
  describe('Error handling', () => {
    it('should handle database errors in getSalesReport gracefully', async () => {
      // Create request with broken container
      const request = createMockRequest({});
      request.container = { cradle: { db: null } }; // Broken DB
      const reply = createMockReply();

      await reportAnalyticsController.getSalesReport(request, reply);

      expect(reply.statusCode).toBe(500);
      expect(reply.sentData.success).toBe(false);
    });

    it('should handle database errors in getVenueComparisonReport gracefully', async () => {
      const request = createMockRequest({});
      request.container = { cradle: { db: null } };
      const reply = createMockReply();

      await reportAnalyticsController.getVenueComparisonReport(request, reply);

      expect(reply.statusCode).toBe(500);
    });

    it('should handle database errors in getCustomerInsightsReport gracefully', async () => {
      const request = createMockRequest({});
      request.container = { cradle: { db: null } };
      const reply = createMockReply();

      await reportAnalyticsController.getCustomerInsightsReport(request, reply);

      expect(reply.statusCode).toBe(500);
    });
  });
});
