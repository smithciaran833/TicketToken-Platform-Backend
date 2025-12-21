/**
 * Tickets Controller Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import * as ticketsController from '../../src/controllers/tickets.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Tickets Controller', () => {
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

  async function createPricingDirect(overrides: any = {}) {
    const pricingId = uuidv4();
    await pool.query(
      `INSERT INTO event_pricing (id, tenant_id, event_id, name, base_price, current_price, is_active, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pricingId, TEST_TENANT_ID, overrides.event_id || testEventId, overrides.name || 'GA', overrides.base_price ?? 50.00, 50.00, true, true]
    );
    return { id: pricingId };
  }

  describe('getTicketTypes', () => {
    it('should return ticket types (pricing) for event', async () => {
      await createPricingDirect({ name: 'VIP', base_price: 150 });
      await createPricingDirect({ name: 'GA', base_price: 50 });

      const request = createMockRequest({ params: { id: testEventId } });
      const reply = createMockReply();

      await ticketsController.getTicketTypes(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.data.length).toBe(2);
    });

    it('should return 404 for non-existent event', async () => {
      const request = createMockRequest({ params: { id: uuidv4() } });
      const reply = createMockReply();

      await ticketsController.getTicketTypes(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('createTicketType', () => {
    it('should create ticket type', async () => {
      const request = createMockRequest({
        params: { id: testEventId },
        body: { name: 'Premium', base_price: 100 },
      });
      const reply = createMockReply();

      await ticketsController.createTicketType(request, reply);

      expect(reply.statusCode).toBe(201);
      expect(reply.sentData.data.name).toBe('Premium');
    });

    it('should return 422 for invalid data', async () => {
      const request = createMockRequest({
        params: { id: testEventId },
        body: { name: 'AB', base_price: -10 }, // name too short, negative price
      });
      const reply = createMockReply();

      await ticketsController.createTicketType(request, reply);

      expect(reply.statusCode).toBe(422);
    });
  });

  describe('getTicketType', () => {
    it('should return ticket type by id', async () => {
      const pricing = await createPricingDirect({ name: 'Test Tier' });

      const request = createMockRequest({ params: { id: testEventId, typeId: pricing.id } });
      const reply = createMockReply();

      await ticketsController.getTicketType(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.data.name).toBe('Test Tier');
    });

    it('should return 404 for non-existent ticket type', async () => {
      const request = createMockRequest({ params: { id: testEventId, typeId: uuidv4() } });
      const reply = createMockReply();

      await ticketsController.getTicketType(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('updateTicketType', () => {
    it('should update ticket type', async () => {
      const pricing = await createPricingDirect({ base_price: 50 });

      const request = createMockRequest({
        params: { id: testEventId, typeId: pricing.id },
        body: { base_price: 75 },
      });
      const reply = createMockReply();

      await ticketsController.updateTicketType(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(parseFloat(reply.sentData.data.base_price)).toBe(75);
    });

    it('should return 422 for empty update', async () => {
      const pricing = await createPricingDirect();

      const request = createMockRequest({
        params: { id: testEventId, typeId: pricing.id },
        body: {},
      });
      const reply = createMockReply();

      await ticketsController.updateTicketType(request, reply);

      expect(reply.statusCode).toBe(422);
    });
  });
});
