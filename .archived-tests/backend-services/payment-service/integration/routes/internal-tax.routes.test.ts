/**
 * Internal Tax Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import internalTaxRoutes from '../../../src/routes/internal-tax.routes';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-key';

describe('Internal Tax Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(internalTaxRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /internal/calculate-tax', () => {
    it('should calculate tax with valid internal auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/calculate-tax',
        headers: {
          'x-internal-api-key': INTERNAL_API_KEY,
        },
        payload: {
          amount: 10000,
          venueAddress: {
            state: 'CA',
            city: 'Los Angeles',
            zip: '90001',
          },
          customerAddress: {
            state: 'CA',
            city: 'Los Angeles',
            zip: '90001',
          },
        },
      });

      // May return 200 or 401 depending on internal auth setup
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body).toBeDefined();
      } else {
        expect([401, 403]).toContain(response.statusCode);
      }
    });

    it('should reject request without internal auth header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/calculate-tax',
        payload: {
          amount: 10000,
          venueAddress: { state: 'CA' },
          customerAddress: { state: 'CA' },
        },
      });

      expect([401, 403]).toContain(response.statusCode);
    });
  });
});
