/**
 * Pricing Controller Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, db, pool, redis } from './setup';
import * as pricingController from '../../src/controllers/pricing.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Pricing Controller', () => {
  let context: TestContext;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Test Event', `test-${testEventId.slice(0, 8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  function createMockRequest(overrides: any = {}): any {
    return {
      params: overrides.params || {},
      body: overrides.body || {},
      headers: overrides.headers || { authorization: 'Bearer test' },
      tenantId: TEST_TENANT_ID,
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

  async function createPricingDirect(overrides: any = {}) {
    const pricingId = uuidv4();
    await pool.query(
      `INSERT INTO event_pricing (id, tenant_id, event_id, name, base_price, current_price, is_active, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pricingId, TEST_TENANT_ID, overrides.event_id || testEventId, overrides.name || 'GA', overrides.base_price ?? 50.00, overrides.current_price ?? 50.00, overrides.is_active ?? true, true]
    );
    return { id: pricingId };
  }

  describe('getEventPricing', () => {
    it('should return pricing tiers for event', async () => {
      await createPricingDirect({ name: 'VIP', base_price: 150 });
      await createPricingDirect({ name: 'GA', base_price: 50 });

      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await pricingController.getEventPricing(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.sentData.pricing.length).toBe(2);
    });

    it('should return empty array when no pricing', async () => {
      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await pricingController.getEventPricing(request, reply);

      expect(reply.sentData.pricing).toEqual([]);
    });
  });

  describe('getActivePricing', () => {
    it('should return only active pricing', async () => {
      await createPricingDirect({ name: 'Active', is_active: true });
      await createPricingDirect({ name: 'Inactive', is_active: false });

      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await pricingController.getActivePricing(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.sentData.pricing.length).toBe(1);
      expect(reply.sentData.pricing[0].name).toBe('Active');
    });
  });

  describe('getPricingById', () => {
    it('should return pricing when found', async () => {
      const pricing = await createPricingDirect({ name: 'Test Tier', base_price: 75 });

      const request = createMockRequest({ params: { id: pricing.id } });
      const reply = createMockReply();

      await pricingController.getPricingById(request, reply);

      expect(reply.sentData.pricing.name).toBe('Test Tier');
    });

    it('should return 404 when not found', async () => {
      const request = createMockRequest({ params: { id: uuidv4() } });
      const reply = createMockReply();

      await pricingController.getPricingById(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('createPricing', () => {
    it('should create pricing tier', async () => {
      const request = createMockRequest({
        params: { eventId: testEventId },
        body: { name: 'Premium', base_price: 100 },
      });
      const reply = createMockReply();

      await pricingController.createPricing(request, reply);

      expect(reply.statusCode).toBe(201);
      expect(reply.sentData.pricing.name).toBe('Premium');
    });
  });

  describe('updatePricing', () => {
    it('should update pricing', async () => {
      const pricing = await createPricingDirect({ base_price: 50 });

      const request = createMockRequest({ params: { id: pricing.id }, body: { base_price: 75 } });
      const reply = createMockReply();

      await pricingController.updatePricing(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(parseFloat(reply.sentData.pricing.base_price)).toBe(75);
    });

    it('should return 404 for non-existent', async () => {
      const request = createMockRequest({ params: { id: uuidv4() }, body: { base_price: 75 } });
      const reply = createMockReply();

      await pricingController.updatePricing(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('calculatePrice', () => {
    it('should calculate price for quantity', async () => {
      const pricing = await createPricingDirect({ base_price: 50 });

      const request = createMockRequest({ params: { id: pricing.id }, body: { quantity: 3 } });
      const reply = createMockReply();

      await pricingController.calculatePrice(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.sentData).toBeDefined();
    });

    it('should return 400 for invalid quantity', async () => {
      const pricing = await createPricingDirect({ base_price: 50 });

      const request = createMockRequest({ params: { id: pricing.id }, body: { quantity: 0 } });
      const reply = createMockReply();

      await pricingController.calculatePrice(request, reply);

      expect(reply.statusCode).toBe(400);
    });

    it('should return 404 for non-existent pricing', async () => {
      const request = createMockRequest({ params: { id: uuidv4() }, body: { quantity: 3 } });
      const reply = createMockReply();

      await pricingController.calculatePrice(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });
});
