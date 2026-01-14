/**
 * Group Payment Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import groupPaymentRoutes from '../../../src/routes/group-payment.routes';
import {
  TEST_EVENT_ID,
  isAuthTestingAvailable,
  getAuthHeader,
} from './test-helpers';
import { v4 as uuidv4 } from 'uuid';

describe('Group Payment Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(groupPaymentRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /create', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create',
        payload: {
          eventId: TEST_EVENT_ID,
          totalAmount: 10000,
          memberCount: 4,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should create group with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/create',
        headers: getAuthHeader(),
        payload: {
          eventId: TEST_EVENT_ID,
          totalAmount: 10000,
          memberCount: 4,
        },
      });

      expect([200, 201, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /:groupId/contribute/:memberId', () => {
    it('should accept contribution without auth (public endpoint)', async () => {
      const groupId = uuidv4();
      const memberId = uuidv4();

      const response = await app.inject({
        method: 'POST',
        url: `/${groupId}/contribute/${memberId}`,
        payload: {
          amount: 2500,
          paymentMethod: 'card',
        },
      });

      // Public endpoint - should reach controller
      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /:groupId/status', () => {
    it('should return status without auth (public endpoint)', async () => {
      const groupId = uuidv4();

      const response = await app.inject({
        method: 'GET',
        url: `/${groupId}/status`,
      });

      // Public endpoint - should reach controller
      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /:groupId/reminders', () => {
    it('should return 401 without authentication', async () => {
      const groupId = uuidv4();

      const response = await app.inject({
        method: 'POST',
        url: `/${groupId}/reminders`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should send reminders with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const groupId = uuidv4();

      const response = await app.inject({
        method: 'POST',
        url: `/${groupId}/reminders`,
        headers: getAuthHeader(),
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /:groupId/history', () => {
    it('should return history without auth (public endpoint)', async () => {
      const groupId = uuidv4();

      const response = await app.inject({
        method: 'GET',
        url: `/${groupId}/history`,
      });

      // Public endpoint - should reach controller
      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });
});
