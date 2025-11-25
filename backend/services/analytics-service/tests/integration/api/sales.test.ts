import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';

describe('Sales API Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    authToken = 'Bearer test-token-12345';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/analytics/sales/metrics', () => {
    it('should return aggregated sales metrics', async () => {
      const response = await request(app.server)
        .get('/api/analytics/sales/metrics')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          interval: 'daily'
        })
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('metrics');
      expect(Array.isArray(response.body.metrics)).toBe(true);
    });

    it('should support different time intervals', async () => {
      const intervals = ['hourly', 'daily', 'weekly', 'monthly'];
      
      for (const interval of intervals) {
        const response = await request(app.server)
          .get('/api/analytics/sales/metrics')
          .query({
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            interval
          })
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.metrics).toBeDefined();
      }
    });

    it('should reject invalid intervals', async () => {
      await request(app.server)
        .get('/api/analytics/sales/metrics')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          interval: 'invalid'
        })
        .set('Authorization', authToken)
        .expect(400);
    });
  });

  describe('GET /api/analytics/events/performance', () => {
    it('should return event performance metrics', async () => {
      const response = await request(app.server)
        .get('/api/analytics/events/performance')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('eventId');
        expect(response.body[0]).toHaveProperty('revenue');
        expect(response.body[0]).toHaveProperty('ticketsSold');
        expect(response.body[0]).toHaveProperty('capacityUtilization');
      }
    });

    it('should calculate capacity utilization correctly', async () => {
      const response = await request(app.server)
        .get('/api/analytics/events/performance')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(200);

      response.body.forEach((event: any) => {
        expect(event.capacityUtilization).toBeGreaterThanOrEqual(0);
        expect(event.capacityUtilization).toBeLessThanOrEqual(100);
      });
    });
  });
});
