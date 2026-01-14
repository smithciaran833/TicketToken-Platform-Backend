/**
 * PricingService Integration Tests
 * Tests: getEventPricing, getPricingById, createPricing, updatePricing,
 *        calculatePrice, updateDynamicPrice, getActivePricing,
 *        applyEarlyBirdPricing, applyLastMinutePricing
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, db, pool, redis } from './setup';
import { PricingService } from '../../src/services/pricing.service';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('PricingService', () => {
  let context: TestContext;
  let service: PricingService;

  beforeAll(async () => {
    context = await setupTestApp();
    service = new PricingService(db);
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  async function createEvent() {
    const eventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Test Event', `test-${eventId.slice(0, 8)}`, 'PUBLISHED', 'single', TEST_USER_ID]
    );
    return eventId;
  }

  async function createPricing(eventId: string, overrides: any = {}) {
    const pricingId = uuidv4();
    await pool.query(
      `INSERT INTO event_pricing (id, tenant_id, event_id, name, base_price, current_price, service_fee, facility_fee, tax_rate, is_active, is_visible, is_dynamic, min_price, max_price, early_bird_price, early_bird_ends_at, last_minute_price, last_minute_starts_at, sales_start_at, sales_end_at, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [pricingId, TEST_TENANT_ID, eventId, overrides.name || 'GA',
       overrides.base_price ?? 50, overrides.current_price ?? 50,
       overrides.service_fee ?? 5, overrides.facility_fee ?? 2, overrides.tax_rate ?? 0.1,
       overrides.is_active ?? true, overrides.is_visible ?? true,
       overrides.is_dynamic ?? false, overrides.min_price ?? null, overrides.max_price ?? null,
       overrides.early_bird_price ?? null, overrides.early_bird_ends_at ?? null,
       overrides.last_minute_price ?? null, overrides.last_minute_starts_at ?? null,
       overrides.sales_start_at ?? null, overrides.sales_end_at ?? null,
       overrides.display_order ?? 0]
    );
    return pricingId;
  }

  describe('getEventPricing', () => {
    it('should return all pricing tiers for event', async () => {
      const eventId = await createEvent();
      await createPricing(eventId, { name: 'VIP', base_price: 150 });
      await createPricing(eventId, { name: 'GA', base_price: 50 });

      const result = await service.getEventPricing(eventId, TEST_TENANT_ID);
      expect(result.length).toBe(2);
    });

    it('should parse decimal fields to numbers', async () => {
      const eventId = await createEvent();
      await createPricing(eventId, { base_price: 99.99, service_fee: 9.99 });

      const result = await service.getEventPricing(eventId, TEST_TENANT_ID);
      expect(typeof result[0].base_price).toBe('number');
      expect(typeof result[0].service_fee).toBe('number');
    });
  });

  describe('getPricingById', () => {
    it('should return pricing by id', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, { name: 'Floor', base_price: 200 });

      const result = await service.getPricingById(pricingId, TEST_TENANT_ID);
      expect(result.name).toBe('Floor');
      expect(result.base_price).toBe(200);
    });

    it('should throw NotFoundError', async () => {
      await expect(service.getPricingById(uuidv4(), TEST_TENANT_ID)).rejects.toThrow('Pricing');
    });
  });

  describe('createPricing', () => {
    it('should create pricing with defaults', async () => {
      const eventId = await createEvent();
      const result = await service.createPricing({
        event_id: eventId,
        name: 'New Tier',
        base_price: 75
      }, TEST_TENANT_ID);

      expect(result.name).toBe('New Tier');
      expect(result.base_price).toBe(75);
      expect(result.current_price).toBe(75);
      expect(result.is_active).toBe(true);
    });

    it('should throw for negative base_price', async () => {
      const eventId = await createEvent();
      await expect(service.createPricing({
        event_id: eventId,
        name: 'Bad',
        base_price: -10
      }, TEST_TENANT_ID)).rejects.toThrow('positive');
    });

    it('should throw when min_price > max_price for dynamic', async () => {
      const eventId = await createEvent();
      await expect(service.createPricing({
        event_id: eventId,
        name: 'Dynamic',
        base_price: 50,
        is_dynamic: true,
        min_price: 100,
        max_price: 50
      }, TEST_TENANT_ID)).rejects.toThrow('Minimum price');
    });
  });

  describe('updatePricing', () => {
    it('should update pricing fields', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, { name: 'Old' });

      const result = await service.updatePricing(pricingId, { name: 'Updated' }, TEST_TENANT_ID);
      expect(result.name).toBe('Updated');
    });

    it('should throw for negative base_price update', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId);

      await expect(service.updatePricing(pricingId, { base_price: -5 }, TEST_TENANT_ID))
        .rejects.toThrow('positive');
    });
  });

  describe('calculatePrice', () => {
    it('should calculate total with fees and tax', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, {
        base_price: 100, current_price: 100,
        service_fee: 10, facility_fee: 5, tax_rate: 0.1
      });

      const result = await service.calculatePrice(pricingId, 2, TEST_TENANT_ID);
      // base: 200, service: 20, facility: 10, subtotal: 230, tax: 23, total: 253
      expect(result.base_price).toBe(200);
      expect(result.service_fee).toBe(20);
      expect(result.facility_fee).toBe(10);
      expect(result.subtotal).toBe(230);
      expect(result.tax).toBe(23);
      expect(result.total).toBe(253);
      expect(result.per_ticket).toBe(126.5);
    });

    it('should use current_price when set', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, {
        base_price: 100, current_price: 80, service_fee: 0, facility_fee: 0, tax_rate: 0
      });

      const result = await service.calculatePrice(pricingId, 1, TEST_TENANT_ID);
      expect(result.base_price).toBe(80);
    });
  });

  describe('updateDynamicPrice', () => {
    it('should update current_price for dynamic pricing', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, {
        is_dynamic: true, min_price: 30, max_price: 150, base_price: 50
      });

      const result = await service.updateDynamicPrice(pricingId, 100, TEST_TENANT_ID);
      expect(result.current_price).toBe(100);
    });

    it('should throw for non-dynamic pricing', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, { is_dynamic: false });

      await expect(service.updateDynamicPrice(pricingId, 100, TEST_TENANT_ID))
        .rejects.toThrow('does not support dynamic');
    });

    it('should throw when below min_price', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, {
        is_dynamic: true, min_price: 50, max_price: 150
      });

      await expect(service.updateDynamicPrice(pricingId, 30, TEST_TENANT_ID))
        .rejects.toThrow('less than minimum');
    });

    it('should throw when above max_price', async () => {
      const eventId = await createEvent();
      const pricingId = await createPricing(eventId, {
        is_dynamic: true, min_price: 30, max_price: 100
      });

      await expect(service.updateDynamicPrice(pricingId, 150, TEST_TENANT_ID))
        .rejects.toThrow('exceed maximum');
    });
  });

  describe('getActivePricing', () => {
    it('should return only active and visible pricing', async () => {
      const eventId = await createEvent();
      await createPricing(eventId, { name: 'Active', is_active: true, is_visible: true });
      await createPricing(eventId, { name: 'Inactive', is_active: false, is_visible: true });
      await createPricing(eventId, { name: 'Hidden', is_active: true, is_visible: false });

      const result = await service.getActivePricing(eventId, TEST_TENANT_ID);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Active');
    });

    it('should filter by sales window', async () => {
      const eventId = await createEvent();
      const past = new Date(Date.now() - 86400000);
      const future = new Date(Date.now() + 86400000);

      await createPricing(eventId, { name: 'Current', sales_start_at: past, sales_end_at: future });
      await createPricing(eventId, { name: 'NotStarted', sales_start_at: future, sales_end_at: null });
      await createPricing(eventId, { name: 'Ended', sales_start_at: null, sales_end_at: past });

      const result = await service.getActivePricing(eventId, TEST_TENANT_ID);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Current');
    });
  });

  describe('applyEarlyBirdPricing', () => {
    it('should apply early bird price when valid', async () => {
      const eventId = await createEvent();
      const future = new Date(Date.now() + 86400000);
      const pricingId = await createPricing(eventId, {
        base_price: 100, current_price: 100,
        early_bird_price: 75, early_bird_ends_at: future
      });

      await service.applyEarlyBirdPricing(eventId, TEST_TENANT_ID);

      const updated = await service.getPricingById(pricingId, TEST_TENANT_ID);
      expect(updated.current_price).toBe(75);
    });

    it('should not apply expired early bird', async () => {
      const eventId = await createEvent();
      const past = new Date(Date.now() - 86400000);
      const pricingId = await createPricing(eventId, {
        base_price: 100, current_price: 100,
        early_bird_price: 75, early_bird_ends_at: past
      });

      await service.applyEarlyBirdPricing(eventId, TEST_TENANT_ID);

      const updated = await service.getPricingById(pricingId, TEST_TENANT_ID);
      expect(updated.current_price).toBe(100);
    });
  });

  describe('applyLastMinutePricing', () => {
    it('should apply last minute price when valid', async () => {
      const eventId = await createEvent();
      const past = new Date(Date.now() - 3600000);
      const pricingId = await createPricing(eventId, {
        base_price: 100, current_price: 100,
        last_minute_price: 60, last_minute_starts_at: past
      });

      await service.applyLastMinutePricing(eventId, TEST_TENANT_ID);

      const updated = await service.getPricingById(pricingId, TEST_TENANT_ID);
      expect(updated.current_price).toBe(60);
    });

    it('should not apply future last minute', async () => {
      const eventId = await createEvent();
      const future = new Date(Date.now() + 3600000);
      const pricingId = await createPricing(eventId, {
        base_price: 100, current_price: 100,
        last_minute_price: 60, last_minute_starts_at: future
      });

      await service.applyLastMinutePricing(eventId, TEST_TENANT_ID);

      const updated = await service.getPricingById(pricingId, TEST_TENANT_ID);
      expect(updated.current_price).toBe(100);
    });
  });
});
