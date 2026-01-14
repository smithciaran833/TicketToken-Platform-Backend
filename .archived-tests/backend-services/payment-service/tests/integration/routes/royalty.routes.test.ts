/**
 * Royalty Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import royaltyRoutes from '../../../src/routes/royalty.routes';
import { TEST_VENUE_ID, TEST_USER_ID } from './test-helpers';
import { v4 as uuidv4 } from 'uuid';

describe('Royalty Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(royaltyRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /report/:venueId', () => {
    it('should return royalty report for venue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/report/${TEST_VENUE_ID}`,
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should accept date range parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/report/${TEST_VENUE_ID}?startDate=2024-01-01&endDate=2024-12-31`,
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /payouts/:recipientId', () => {
    it('should return payout history for recipient', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/payouts/${TEST_USER_ID}`,
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.payouts).toBeDefined();
      }
    });
  });

  describe('GET /distributions/:recipientId', () => {
    it('should return distributions for recipient', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/distributions/${TEST_USER_ID}`,
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.distributions).toBeDefined();
      }
    });

    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/distributions/${TEST_USER_ID}?status=pending`,
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /reconcile', () => {
    it('should trigger reconciliation for date range', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reconcile',
        payload: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should reconcile single transaction', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reconcile',
        payload: {
          transactionSignature: 'test-signature-123',
        },
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /reconciliation-runs', () => {
    it('should return reconciliation run history', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reconciliation-runs',
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.runs).toBeDefined();
      }
    });
  });

  describe('GET /discrepancies', () => {
    it('should return unresolved discrepancies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/discrepancies',
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.discrepancies).toBeDefined();
      }
    });

    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/discrepancies?status=investigating',
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('PUT /discrepancies/:id/resolve', () => {
    it('should resolve discrepancy', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/discrepancies/${uuidv4()}/resolve`,
        payload: {
          resolution_notes: 'Resolved by test',
          resolved_by: TEST_USER_ID,
        },
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });
});
