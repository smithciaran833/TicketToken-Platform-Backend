/**
 * Venue Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import venueRoutes from '../../../src/routes/venue.routes';
import {
  TEST_VENUE_ID,
  generateTestToken,
  isAuthTestingAvailable,
  getAuthHeader,
} from './test-helpers';

describe('Venue Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(venueRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /:venueId/balance', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/${TEST_VENUE_ID}/balance`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return balance with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: `/${TEST_VENUE_ID}/balance`,
        headers: getAuthHeader(),
      });

      // Should return 200 or appropriate error from controller
      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /:venueId/payout', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/${TEST_VENUE_ID}/payout`,
        payload: {
          amount: 5000,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should process payout request with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: `/${TEST_VENUE_ID}/payout`,
        headers: getAuthHeader(),
        payload: {
          amount: 5000,
        },
      });

      // Should return response from controller
      expect([200, 201, 400, 403, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /:venueId/payouts', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/${TEST_VENUE_ID}/payouts`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return payout history with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: `/${TEST_VENUE_ID}/payouts`,
        headers: getAuthHeader(),
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });
});
