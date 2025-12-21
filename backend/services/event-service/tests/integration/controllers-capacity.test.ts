/**
 * Capacity Controller Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, db, pool, redis } from './setup';
import * as capacityController from '../../src/controllers/capacity.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Capacity Controller', () => {
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

  async function createCapacityDirect(overrides: any = {}) {
    const capacityId = uuidv4();
    await pool.query(
      `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [capacityId, TEST_TENANT_ID, overrides.event_id || testEventId, overrides.section_name || 'GA', overrides.total_capacity ?? 100, overrides.available_capacity ?? 100, 0, 0, true]
    );
    return { id: capacityId };
  }

  describe('getEventCapacity', () => {
    it('should return capacity sections', async () => {
      await createCapacityDirect({ section_name: 'VIP', total_capacity: 50 });
      await createCapacityDirect({ section_name: 'GA', total_capacity: 200 });

      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await capacityController.getEventCapacity(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.sentData.capacity.length).toBe(2);
    });

    it('should return empty array when no capacity', async () => {
      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await capacityController.getEventCapacity(request, reply);

      expect(reply.sentData.capacity).toEqual([]);
    });
  });

  describe('getTotalCapacity', () => {
    it('should sum all capacity sections', async () => {
      await createCapacityDirect({ total_capacity: 50, available_capacity: 50 });
      await createCapacityDirect({ total_capacity: 200, available_capacity: 180 });

      const request = createMockRequest({ params: { eventId: testEventId } });
      const reply = createMockReply();

      await capacityController.getTotalCapacity(request, reply);

      expect(reply.sentData.total_capacity).toBe(250);
      expect(reply.sentData.available_capacity).toBe(230);
    });
  });

  describe('getCapacityById', () => {
    it('should return capacity when found', async () => {
      const capacity = await createCapacityDirect({ section_name: 'Test Section' });

      const request = createMockRequest({ params: { id: capacity.id } });
      const reply = createMockReply();

      await capacityController.getCapacityById(request, reply);

      expect(reply.sentData.capacity.section_name).toBe('Test Section');
    });

    it('should return 404 when not found', async () => {
      const request = createMockRequest({ params: { id: uuidv4() } });
      const reply = createMockReply();

      await capacityController.getCapacityById(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('checkAvailability', () => {
    it('should return true when capacity available', async () => {
      const capacity = await createCapacityDirect({ available_capacity: 50 });

      const request = createMockRequest({ params: { id: capacity.id }, body: { quantity: 10 } });
      const reply = createMockReply();

      await capacityController.checkAvailability(request, reply);

      expect(reply.sentData.available).toBe(true);
    });

    it('should return false when insufficient capacity', async () => {
      const capacity = await createCapacityDirect({ available_capacity: 5 });

      const request = createMockRequest({ params: { id: capacity.id }, body: { quantity: 10 } });
      const reply = createMockReply();

      await capacityController.checkAvailability(request, reply);

      expect(reply.sentData.available).toBe(false);
    });
  });

  describe('updateCapacity', () => {
    it('should update capacity', async () => {
      const capacity = await createCapacityDirect({ total_capacity: 100 });

      const request = createMockRequest({ params: { id: capacity.id }, body: { total_capacity: 150 } });
      const reply = createMockReply();

      await capacityController.updateCapacity(request, reply);

      expect(reply.sentData.capacity.total_capacity).toBe(150);
    });

    it('should return 404 for non-existent', async () => {
      const request = createMockRequest({ params: { id: uuidv4() }, body: { total_capacity: 150 } });
      const reply = createMockReply();

      await capacityController.updateCapacity(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });
});
