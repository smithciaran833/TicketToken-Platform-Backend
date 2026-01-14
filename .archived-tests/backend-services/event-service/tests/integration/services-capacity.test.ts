/**
 * CapacityService Integration Tests
 * Tests: getEventCapacity, getCapacityById, createCapacity, updateCapacity,
 *        checkAvailability, reserveCapacity, releaseReservation, confirmReservation,
 *        releaseExpiredReservations, getTotalEventCapacity, getLockedPrice
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, db, pool, redis } from './setup';
import { CapacityService } from '../../src/services/capacity.service';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('CapacityService', () => {
  let context: TestContext;
  let service: CapacityService;

  beforeAll(async () => {
    context = await setupTestApp();
    service = new CapacityService(db);
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  async function createEvent(overrides: any = {}) {
    const eventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Test Event', `test-${eventId.slice(0, 8)}`,
       'PUBLISHED', 'single', TEST_USER_ID]
    );
    return eventId;
  }

  async function createCapacity(eventId: string, overrides: any = {}) {
    const capacityId = uuidv4();
    await pool.query(
      `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [capacityId, TEST_TENANT_ID, eventId, overrides.section_name || 'GA',
       overrides.total_capacity ?? 100, overrides.available_capacity ?? 100,
       overrides.reserved_capacity ?? 0, overrides.sold_count ?? 0, true]
    );
    return capacityId;
  }

  async function createPricing(eventId: string, capacityId: string, overrides: any = {}) {
    const pricingId = uuidv4();
    await pool.query(
      `INSERT INTO event_pricing (id, tenant_id, event_id, capacity_id, name, base_price, current_price, service_fee, facility_fee, tax_rate, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [pricingId, TEST_TENANT_ID, eventId, capacityId, 'GA', overrides.base_price ?? 50,
       overrides.current_price ?? 50, overrides.service_fee ?? 5, overrides.facility_fee ?? 2,
       overrides.tax_rate ?? 0.1, true]
    );
    return pricingId;
  }

  describe('getEventCapacity', () => {
    it('should return all capacity sections for event', async () => {
      const eventId = await createEvent();
      await createCapacity(eventId, { section_name: 'VIP' });
      await createCapacity(eventId, { section_name: 'GA' });

      const result = await service.getEventCapacity(eventId, TEST_TENANT_ID);
      expect(result.length).toBe(2);
      expect(result.map(r => r.section_name).sort()).toEqual(['GA', 'VIP']);
    });

    it('should return empty array for event with no capacity', async () => {
      const eventId = await createEvent();
      const result = await service.getEventCapacity(eventId, TEST_TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe('getCapacityById', () => {
    it('should return capacity by id', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { section_name: 'Pit', total_capacity: 50 });

      const result = await service.getCapacityById(capacityId, TEST_TENANT_ID);
      expect(result.section_name).toBe('Pit');
      expect(result.total_capacity).toBe(50);
    });

    it('should throw NotFoundError for non-existent', async () => {
      await expect(service.getCapacityById(uuidv4(), TEST_TENANT_ID))
        .rejects.toThrow('Capacity section');
    });
  });

  describe('createCapacity', () => {
    it('should create capacity with defaults', async () => {
      const eventId = await createEvent();
      const result = await service.createCapacity({
        event_id: eventId,
        section_name: 'New Section',
        total_capacity: 200
      }, TEST_TENANT_ID, 'token');

      expect(result.section_name).toBe('New Section');
      expect(result.total_capacity).toBe(200);
      expect(result.available_capacity).toBe(200);
      expect(result.reserved_capacity).toBe(0);
      expect(result.sold_count).toBe(0);
    });

    it('should throw ValidationError for missing section_name', async () => {
      const eventId = await createEvent();
      await expect(service.createCapacity({
        event_id: eventId,
        total_capacity: 100
      }, TEST_TENANT_ID, 'token')).rejects.toThrow('Section name');
    });

    it('should throw ValidationError for negative capacity', async () => {
      const eventId = await createEvent();
      await expect(service.createCapacity({
        event_id: eventId,
        section_name: 'Test',
        total_capacity: -10
      }, TEST_TENANT_ID, 'token')).rejects.toThrow('negative');
    });
  });

  describe('updateCapacity', () => {
    it('should update capacity fields', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { section_name: 'Old', total_capacity: 100 });

      const result = await service.updateCapacity(capacityId, { section_name: 'Updated' }, TEST_TENANT_ID);
      expect(result.section_name).toBe('Updated');
    });

    it('should throw for negative total_capacity update', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId);

      await expect(service.updateCapacity(capacityId, { total_capacity: -5 }, TEST_TENANT_ID))
        .rejects.toThrow('negative');
    });
  });

  describe('checkAvailability', () => {
    it('should return true when enough available', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 50 });

      expect(await service.checkAvailability(capacityId, 30, TEST_TENANT_ID)).toBe(true);
    });

    it('should return false when not enough available', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 10 });

      expect(await service.checkAvailability(capacityId, 20, TEST_TENANT_ID)).toBe(false);
    });
  });

  describe('reserveCapacity', () => {
    it('should reserve and decrement available', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 100 });

      const result = await service.reserveCapacity(capacityId, 10, TEST_TENANT_ID, 15);
      expect(result.available_capacity).toBe(90);
      expect(result.reserved_capacity).toBe(10);
      expect(result.reserved_expires_at).toBeDefined();
    });

    it('should throw for quantity <= 0', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId);

      await expect(service.reserveCapacity(capacityId, 0, TEST_TENANT_ID))
        .rejects.toThrow('greater than zero');
    });

    it('should throw when not enough available', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 5 });

      await expect(service.reserveCapacity(capacityId, 10, TEST_TENANT_ID))
        .rejects.toThrow('5 tickets available');
    });

    it('should lock price when pricingId provided', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 100 });
      const pricingId = await createPricing(eventId, capacityId, { current_price: 75 });

      const result = await service.reserveCapacity(capacityId, 2, TEST_TENANT_ID, 15, pricingId, 'token');
      expect(result.locked_price_data).toBeDefined();
      expect(result.locked_price_data.locked_price).toBe(75);
    });
  });

  describe('releaseReservation', () => {
    it('should release reserved capacity back to available', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 90, reserved_capacity: 10 });

      const result = await service.releaseReservation(capacityId, 10, TEST_TENANT_ID);
      expect(result.available_capacity).toBe(100);
      expect(result.reserved_capacity).toBe(0);
    });
  });

  describe('confirmReservation', () => {
    it('should move reserved to sold', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 90, reserved_capacity: 10, sold_count: 0 });

      const result = await service.confirmReservation(capacityId, 10, TEST_TENANT_ID);
      expect(result.reserved_capacity).toBe(0);
      expect(result.sold_count).toBe(10);
    });
  });

  describe('releaseExpiredReservations', () => {
    it('should release expired reservations', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId, { available_capacity: 90, reserved_capacity: 10 });

      // Set expiry to past
      await pool.query(
        `UPDATE event_capacity SET reserved_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [capacityId]
      );

      const released = await service.releaseExpiredReservations();
      expect(released).toBe(10);

      const capacity = await service.getCapacityById(capacityId, TEST_TENANT_ID);
      expect(capacity.available_capacity).toBe(100);
      expect(capacity.reserved_capacity).toBe(0);
    });

    it('should return 0 when no expired reservations', async () => {
      const released = await service.releaseExpiredReservations();
      expect(released).toBe(0);
    });
  });

  describe('getTotalEventCapacity', () => {
    it('should sum all sections', async () => {
      const eventId = await createEvent();
      await createCapacity(eventId, { total_capacity: 100, available_capacity: 80, sold_count: 20 });
      await createCapacity(eventId, { total_capacity: 50, available_capacity: 30, sold_count: 20 });

      const result = await service.getTotalEventCapacity(eventId, TEST_TENANT_ID);
      expect(result.total_capacity).toBe(150);
      expect(result.available_capacity).toBe(110);
      expect(result.sold_count).toBe(40);
    });

    it('should return zeros for event with no capacity', async () => {
      const eventId = await createEvent();
      const result = await service.getTotalEventCapacity(eventId, TEST_TENANT_ID);
      expect(result.total_capacity).toBe(0);
      expect(result.available_capacity).toBe(0);
    });
  });

  describe('getLockedPrice', () => {
    it('should return null when no locked price', async () => {
      const eventId = await createEvent();
      const capacityId = await createCapacity(eventId);

      const result = await service.getLockedPrice(capacityId, TEST_TENANT_ID);
      expect(result).toBeNull();
    });
  });
});
