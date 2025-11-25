import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';

describe('Customer API Integration Tests', () => {
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

  describe('GET /api/analytics/customers/lifetime-value', () => {
    it('should return CLV calculations', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('averageClv');
      expect(response.body).toHaveProperty('totalCustomers');
      expect(response.body).toHaveProperty('segments');
      expect(response.body.segments).toHaveProperty('high');
      expect(response.body.segments).toHaveProperty('medium');
      expect(response.body.segments).toHaveProperty('low');
    });

    it('should handle venues with no customers', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .set('Authorization', 'Bearer empty-venue-token')
        .expect(200);

      expect(response.body.totalCustomers).toBe(0);
      expect(response.body.averageClv).toBe(0);
    });
  });

  describe('GET /api/analytics/customers/segments', () => {
    it('should return RFM segments', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/segments')
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('segment');
        expect(response.body[0]).toHaveProperty('count');
        expect(response.body[0]).toHaveProperty('avgValue');
        expect(response.body[0]).toHaveProperty('characteristics');
      }
    });

    it('should validate segment names', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/segments')
        .set('Authorization', authToken)
        .expect(200);

      const validSegments = [
        'champions',
        'loyalCustomers',
        'potentialLoyalists',
        'newCustomers',
        'atRisk',
        'cantLose',
        'hibernating'
      ];

      response.body.forEach((segment: any) => {
        expect(validSegments).toContain(segment.segment);
      });
    });
  });

  describe('GET /api/analytics/customers/churn-risk', () => {
    it('should identify at-risk customers', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/churn-risk')
        .query({ daysThreshold: 90 })
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('totalAtRisk');
      expect(response.body).toHaveProperty('highRisk');
      expect(response.body).toHaveProperty('mediumRisk');
      expect(response.body).toHaveProperty('lowRisk');
      expect(Array.isArray(response.body.highRisk)).toBe(true);
    });

    it('should reject invalid days threshold', async () => {
      await request(app.server)
        .get('/api/analytics/customers/churn-risk')
        .query({ daysThreshold: 1000 })
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should clamp risk scores correctly', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/churn-risk')
        .query({ daysThreshold: 90 })
        .set('Authorization', authToken)
        .expect(200);

      response.body.highRisk.forEach((customer: any) => {
        expect(customer.riskScore).toBeGreaterThanOrEqual(0);
        expect(customer.riskScore).toBeLessThanOrEqual(100);
      });
    });
  });
});
