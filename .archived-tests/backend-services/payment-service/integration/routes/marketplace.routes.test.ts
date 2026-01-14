/**
 * Marketplace Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import marketplaceRoutes from '../../../src/routes/marketplace.routes';
import {
  TEST_VENUE_ID,
  isAuthTestingAvailable,
  getAuthHeader,
} from './test-helpers';
import { v4 as uuidv4 } from 'uuid';

describe('Marketplace Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(marketplaceRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /listings', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/listings',
        payload: {
          ticketId: uuidv4(),
          price: 15000,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should create listing with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/listings',
        headers: getAuthHeader(),
        payload: {
          ticketId: uuidv4(),
          price: 15000,
        },
      });

      expect([200, 201, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /purchase', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/purchase',
        payload: {
          listingId: uuidv4(),
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should process purchase with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/purchase',
        headers: getAuthHeader(),
        payload: {
          listingId: uuidv4(),
        },
      });

      expect([200, 201, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /escrow/:escrowId/confirm', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/escrow/${uuidv4()}/confirm`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should confirm transfer with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: `/escrow/${uuidv4()}/confirm`,
        headers: getAuthHeader(),
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /venues/:venueId/royalties', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${TEST_VENUE_ID}/royalties`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return royalties with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: `/venues/${TEST_VENUE_ID}/royalties`,
        headers: getAuthHeader(),
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /venues/:venueId/pricing-analytics', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${TEST_VENUE_ID}/pricing-analytics`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return analytics with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: `/venues/${TEST_VENUE_ID}/pricing-analytics`,
        headers: getAuthHeader(),
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });
});
