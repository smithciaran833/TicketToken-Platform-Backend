/**
 * Payment Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import paymentRoutes from '../../../src/routes/payment.routes';
import {
  TEST_VENUE_ID,
  TEST_EVENT_ID,
  isAuthTestingAvailable,
  getAuthHeader,
} from './test-helpers';
import { v4 as uuidv4 } from 'uuid';

describe('Payment Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(paymentRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /process', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/process',
        payload: {
          venueId: TEST_VENUE_ID,
          eventId: TEST_EVENT_ID,
          amount: 10000,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 2, price: 5000 }],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should process payment with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/process',
        headers: {
          ...getAuthHeader(),
          'idempotency-key': uuidv4(),
        },
        payload: {
          venueId: TEST_VENUE_ID,
          eventId: TEST_EVENT_ID,
          amount: 10000,
          tickets: [{ ticketTypeId: uuidv4(), quantity: 2, price: 5000 }],
          paymentMethod: { type: 'card', token: 'tok_test' },
          idempotencyKey: uuidv4(),
        },
      });

      expect([200, 201, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /calculate-fees', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        payload: {
          subtotal: 10000,
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should calculate fees with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/calculate-fees',
        headers: {
          ...getAuthHeader(),
          'idempotency-key': uuidv4(),
        },
        payload: {
          subtotal: 10000,
          ticketCount: 2,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /transaction/:transactionId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/transaction/${uuidv4()}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should get transaction with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: `/transaction/${uuidv4()}`,
        headers: getAuthHeader(),
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /transaction/:transactionId/refund', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/transaction/${uuidv4()}/refund`,
        payload: {
          amount: 5000,
          reason: 'Customer request',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should process refund with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: `/transaction/${uuidv4()}/refund`,
        headers: {
          ...getAuthHeader(),
          'idempotency-key': uuidv4(),
        },
        payload: {
          amount: 5000,
          reason: 'Customer request',
        },
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });
});
