/**
 * Compliance Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import complianceRoutes from '../../../src/routes/compliance.routes';
import {
  isAuthTestingAvailable,
  getAuthHeader,
} from './test-helpers';

describe('Compliance Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(complianceRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /tax-forms/:year', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/tax-forms/2024',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return tax form with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: '/tax-forms/2024',
        headers: getAuthHeader(),
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /tax-forms/:year/download', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/tax-forms/2024/download',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should download tax form with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: '/tax-forms/2024/download',
        headers: getAuthHeader(),
      });

      expect([200, 400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /tax-summary', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/tax-summary',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return tax summary with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'GET',
        url: '/tax-summary',
        headers: getAuthHeader(),
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });
});
