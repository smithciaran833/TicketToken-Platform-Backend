/**
 * Fee Calculator Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import feeCalculatorRoutes from '../../../src/routes/fee-calculator.routes';

describe('Fee Calculator Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(feeCalculatorRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /calculate', () => {
    it('should calculate fees for valid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate',
        payload: {
          subtotal: 10000,
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.calculation).toBeDefined();
    });

    it('should calculate fees with venueId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate',
        payload: {
          subtotal: 5000,
          ticketCount: 1,
          venueId: '00000000-0000-0000-0000-000000000077',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.calculation).toBeDefined();
    });

    it('should return 400 when subtotal is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate',
        payload: {
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('subtotal');
    });

    it('should return 400 when ticketCount is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/calculate',
        payload: {
          subtotal: 10000,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticketCount');
    });
  });

  describe('POST /breakdown', () => {
    it('should return fee breakdown for valid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/breakdown',
        payload: {
          subtotal: 10000,
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toBeDefined();
    });

    it('should return fee breakdown with venueId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/breakdown',
        payload: {
          subtotal: 7500,
          ticketCount: 3,
          venueId: '00000000-0000-0000-0000-000000000077',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 when subtotal is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/breakdown',
        payload: {
          ticketCount: 2,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('subtotal');
    });

    it('should return 400 when ticketCount is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/breakdown',
        payload: {
          subtotal: 10000,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticketCount');
    });
  });
});
