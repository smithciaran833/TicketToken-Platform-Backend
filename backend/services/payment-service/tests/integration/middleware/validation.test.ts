/**
 * Validation Middleware Integration Tests
 * Comprehensive tests for all validation schemas
 */

import Fastify, { FastifyInstance } from 'fastify';
import { validateRequest, validateQueryParams } from '../../../src/middleware/validation';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

describe('Validation Middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();

    // processPayment schema
    app.post('/process-payment', {
      preHandler: [validateRequest('processPayment')],
    }, async (request) => ({ success: true, body: request.body }));

    // calculateFees schema
    app.post('/calculate-fees', {
      preHandler: [validateRequest('calculateFees')],
    }, async (request) => ({ success: true, body: request.body }));

    // refundTransaction schema
    app.post('/refund', {
      preHandler: [validateRequest('refundTransaction')],
    }, async (request) => ({ success: true, body: request.body }));

    // createListing schema
    app.post('/create-listing', {
      preHandler: [validateRequest('createListing')],
    }, async (request) => ({ success: true, body: request.body }));

    // purchaseResale schema
    app.post('/purchase-resale', {
      preHandler: [validateRequest('purchaseResale')],
    }, async (request) => ({ success: true, body: request.body }));

    // createGroup schema
    app.post('/create-group', {
      preHandler: [validateRequest('createGroup')],
    }, async (request) => ({ success: true, body: request.body }));

    // Invalid schema name
    app.post('/invalid-schema', {
      preHandler: [validateRequest('nonexistent' as any)],
    }, async (request) => ({ success: true }));

    // Query params validation
    const querySchema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      sort: Joi.string().valid('asc', 'desc').default('desc'),
      filter: Joi.string().optional(),
    });

    app.get('/with-query', {
      preHandler: [validateQueryParams(querySchema)],
    }, async (request) => ({ query: request.query }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('processPayment schema', () => {
    const validPayload = () => ({
      venueId: uuidv4(),
      eventId: uuidv4(),
      tickets: [{
        ticketTypeId: uuidv4(),
        quantity: 2,
        price: 5000,
      }],
      paymentMethod: {
        type: 'card',
        token: 'tok_test_123',
      },
      deviceFingerprint: 'fp_abc123',
    });

    describe('valid requests', () => {
      it('should accept valid payment request with all required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload: validPayload(),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });

      it('should accept request with multiple tickets', async () => {
        const payload = validPayload();
        payload.tickets = [
          { ticketTypeId: uuidv4(), quantity: 2, price: 5000 },
          { ticketTypeId: uuidv4(), quantity: 3, price: 7500 },
          { ticketTypeId: uuidv4(), quantity: 1, price: 10000 },
        ];

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept request with seat numbers', async () => {
        const payload = validPayload();
        (payload.tickets[0] as any).seatNumbers = ['A1', 'A2'];

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept all valid payment method types', async () => {
        const types = ['card', 'ach', 'paypal', 'crypto'];

        for (const type of types) {
          const payload = validPayload();
          payload.paymentMethod.type = type;

          const response = await app.inject({
            method: 'POST',
            url: '/process-payment',
            payload,
          });

          expect(response.statusCode).toBe(200);
        }
      });

      it('should accept request with optional metadata', async () => {
        const payload = {
          ...validPayload(),
          metadata: {
            source: 'mobile',
            campaign: 'summer2024',
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept request with sessionData', async () => {
        const payload = {
          ...validPayload(),
          sessionData: {
            actions: [
              { type: 'click', timestamp: Date.now(), x: 100, y: 200 },
              { type: 'scroll', timestamp: Date.now() },
            ],
            browserFeatures: { webgl: true, canvas: true },
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept quantity of exactly 10 (max)', async () => {
        const payload = validPayload();
        payload.tickets[0].quantity = 10;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept quantity of exactly 1 (min)', async () => {
        const payload = validPayload();
        payload.tickets[0].quantity = 1;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('invalid venueId', () => {
      it('should reject missing venueId', async () => {
        const payload = validPayload();
        delete (payload as any).venueId;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('VALIDATION_ERROR');
        expect(body.errors.some((e: any) => e.field === 'venueId')).toBe(true);
      });

      it('should reject non-UUID venueId', async () => {
        const payload = validPayload();
        (payload as any).venueId = 'not-a-uuid';

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.errors.some((e: any) => e.field === 'venueId')).toBe(true);
      });

      it('should reject empty venueId', async () => {
        const payload = validPayload();
        (payload as any).venueId = '';

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('invalid eventId', () => {
      it('should reject missing eventId', async () => {
        const payload = validPayload();
        delete (payload as any).eventId;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.errors.some((e: any) => e.field === 'eventId')).toBe(true);
      });

      it('should reject non-UUID eventId', async () => {
        const payload = validPayload();
        (payload as any).eventId = 'invalid';

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('invalid tickets', () => {
      it('should reject missing tickets array', async () => {
        const payload = validPayload();
        delete (payload as any).tickets;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject empty tickets array', async () => {
        const payload = validPayload();
        payload.tickets = [];

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject ticket without ticketTypeId', async () => {
        const payload = validPayload();
        delete (payload.tickets[0] as any).ticketTypeId;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject quantity of 0', async () => {
        const payload = validPayload();
        payload.tickets[0].quantity = 0;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject quantity greater than 10', async () => {
        const payload = validPayload();
        payload.tickets[0].quantity = 11;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject negative quantity', async () => {
        const payload = validPayload();
        payload.tickets[0].quantity = -1;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject non-integer quantity', async () => {
        const payload = validPayload();
        payload.tickets[0].quantity = 2.5;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject negative price', async () => {
        const payload = validPayload();
        payload.tickets[0].price = -100;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject zero price', async () => {
        const payload = validPayload();
        payload.tickets[0].price = 0;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('invalid paymentMethod', () => {
      it('should reject missing paymentMethod', async () => {
        const payload = validPayload();
        delete (payload as any).paymentMethod;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject missing payment type', async () => {
        const payload = validPayload();
        delete (payload.paymentMethod as any).type;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject invalid payment type', async () => {
        const payload = validPayload();
        (payload.paymentMethod as any).type = 'bitcoin';

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('invalid deviceFingerprint', () => {
      it('should reject missing deviceFingerprint', async () => {
        const payload = validPayload();
        delete (payload as any).deviceFingerprint;

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.errors.some((e: any) => e.field === 'deviceFingerprint')).toBe(true);
      });
    });

    describe('strips unknown fields', () => {
      it('should strip unknown top-level fields', async () => {
        const payload = {
          ...validPayload(),
          unknownField: 'should be stripped',
          anotherUnknown: 12345,
        };

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.body.unknownField).toBeUndefined();
        expect(body.body.anotherUnknown).toBeUndefined();
      });
    });

    describe('multiple validation errors', () => {
      it('should return all validation errors at once', async () => {
        const payload = {
          // Missing venueId, eventId, tickets, paymentMethod, deviceFingerprint
        };

        const response = await app.inject({
          method: 'POST',
          url: '/process-payment',
          payload,
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.errors.length).toBeGreaterThan(1);
      });
    });
  });

  describe('calculateFees schema', () => {
    it('should accept valid request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          venueId: uuidv4(),
          amount: 10000,
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject missing venueId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          amount: 10000,
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          venueId: uuidv4(),
          amount: -100,
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject zero amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          venueId: uuidv4(),
          amount: 0,
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject non-integer ticketCount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          venueId: uuidv4(),
          amount: 10000,
          ticketCount: 2.5,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject ticketCount of 0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          venueId: uuidv4(),
          amount: 10000,
          ticketCount: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept decimal amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          venueId: uuidv4(),
          amount: 99.99,
          ticketCount: 1,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('refundTransaction schema', () => {
    it('should accept valid refund with reason only', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refund',
        payload: {
          reason: 'Customer requested refund',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept valid refund with amount and reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refund',
        payload: {
          amount: 5000,
          reason: 'Partial refund for damaged item',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject missing reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refund',
        payload: {
          amount: 5000,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.errors.some((e: any) => e.field === 'reason')).toBe(true);
    });

    it('should reject negative amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refund',
        payload: {
          amount: -100,
          reason: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject reason longer than 500 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refund',
        payload: {
          reason: 'A'.repeat(501),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept reason of exactly 500 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refund',
        payload: {
          reason: 'A'.repeat(500),
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('createListing schema', () => {
    it('should accept valid listing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create-listing',
        payload: {
          ticketId: uuidv4(),
          price: 15000,
          venueId: uuidv4(),
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject missing ticketId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create-listing',
        payload: {
          price: 15000,
          venueId: uuidv4(),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing price', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create-listing',
        payload: {
          ticketId: uuidv4(),
          venueId: uuidv4(),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing venueId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create-listing',
        payload: {
          ticketId: uuidv4(),
          price: 15000,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative price', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create-listing',
        payload: {
          ticketId: uuidv4(),
          price: -100,
          venueId: uuidv4(),
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('purchaseResale schema', () => {
    it('should accept valid purchase', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-resale',
        payload: {
          listingId: 'listing-123',
          paymentMethodId: 'pm_test_456',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject missing listingId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-resale',
        payload: {
          paymentMethodId: 'pm_test_456',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing paymentMethodId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/purchase-resale',
        payload: {
          listingId: 'listing-123',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('createGroup schema', () => {
    const validGroupPayload = () => ({
      eventId: uuidv4(),
      ticketSelections: [
        { ticketTypeId: uuidv4(), quantity: 2, price: 5000 },
      ],
      members: [
        { email: 'member1@example.com', name: 'Member One', ticketCount: 1 },
        { email: 'member2@example.com', name: 'Member Two', ticketCount: 1 },
      ],
    });

    it('should accept valid group creation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload: validGroupPayload(),
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject missing eventId', async () => {
      const payload = validGroupPayload();
      delete (payload as any).eventId;

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject empty ticketSelections', async () => {
      const payload = validGroupPayload();
      payload.ticketSelections = [];

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject empty members', async () => {
      const payload = validGroupPayload();
      payload.members = [];

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject more than 20 members', async () => {
      const payload = validGroupPayload();
      payload.members = Array.from({ length: 21 }, (_, i) => ({
        email: `member${i}@example.com`,
        name: `Member ${i}`,
        ticketCount: 1,
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept exactly 20 members', async () => {
      const payload = validGroupPayload();
      payload.members = Array.from({ length: 20 }, (_, i) => ({
        email: `member${i}@example.com`,
        name: `Member ${i}`,
        ticketCount: 1,
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid member email', async () => {
      const payload = validGroupPayload();
      payload.members[0].email = 'not-an-email';

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing member name', async () => {
      const payload = validGroupPayload();
      delete (payload.members[0] as any).name;

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject zero ticketCount for member', async () => {
      const payload = validGroupPayload();
      payload.members[0].ticketCount = 0;

      const response = await app.inject({
        method: 'POST',
        url: '/create-group',
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('invalid schema name', () => {
    it('should return 500 for unknown schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/invalid-schema',
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('not found');
    });
  });

  describe('validateQueryParams', () => {
    it('should accept valid query params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?page=2&limit=50&sort=asc',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query.page).toBe(2);
      expect(body.query.limit).toBe(50);
      expect(body.query.sort).toBe('asc');
    });

    it('should apply default values', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query.page).toBe(1);
      expect(body.query.limit).toBe(20);
      expect(body.query.sort).toBe('desc');
    });

    it('should apply partial defaults', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?page=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query.page).toBe(5);
      expect(body.query.limit).toBe(20);
      expect(body.query.sort).toBe('desc');
    });

    it('should reject page less than 1', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?page=0',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('QUERY_VALIDATION_ERROR');
    });

    it('should reject negative page', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?page=-1',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject limit exceeding max', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?limit=101',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept limit at max boundary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?limit=100',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid sort value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?sort=random',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept optional filter param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?filter=active',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query.filter).toBe('active');
    });

    it('should strip unknown query params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?unknown=value&another=test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query.unknown).toBeUndefined();
      expect(body.query.another).toBeUndefined();
    });

    it('should return all validation errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/with-query?page=-1&limit=500&sort=invalid',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
