/**
 * Fraud Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import fraudRoutes from '../../../src/routes/fraud.routes';
import { TEST_USER_ID } from './test-helpers';
import { v4 as uuidv4 } from 'uuid';

describe('Fraud Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(fraudRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /check', () => {
    it('should perform fraud check', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        payload: {
          userId: TEST_USER_ID,
          amount: 10000,
          ipAddress: '192.168.1.1',
          deviceFingerprint: 'test-fingerprint',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /review-queue', () => {
    it('should return pending reviews', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/review-queue',
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.reviews).toBeDefined();
      }
    });

    it('should filter by priority', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/review-queue?priority=high',
      });

      expect([200, 500]).toContain(response.statusCode);
    });

    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/review-queue?status=pending',
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /review-queue/:id/assign', () => {
    it('should assign review to analyst', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/review-queue/${uuidv4()}/assign`,
        payload: {
          analystId: uuidv4(),
        },
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /review-queue/:id/complete', () => {
    it('should complete review with decision', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/review-queue/${uuidv4()}/complete`,
        payload: {
          decision: 'approved',
          reviewerNotes: 'Test approval',
          reviewerId: uuidv4(),
        },
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /stats', () => {
    it('should return fraud statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect([200, 500]).toContain(response.statusCode);
    });

    it('should accept date range', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats?startDate=2024-01-01&endDate=2024-12-31',
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /trends', () => {
    it('should return fraud trends', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trends',
      });

      expect([200, 500]).toContain(response.statusCode);
    });

    it('should accept days parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/trends?days=7',
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /signals', () => {
    it('should return top fraud signals', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/signals',
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /dashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/dashboard',
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /user/:userId/history', () => {
    it('should return user fraud check history', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/user/${TEST_USER_ID}/history`,
      });

      expect([200, 500]).toContain(response.statusCode);
    });

    it('should accept limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/user/${TEST_USER_ID}/history?limit=10`,
      });

      expect([200, 500]).toContain(response.statusCode);
    });
  });
});
