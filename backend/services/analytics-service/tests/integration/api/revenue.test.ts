import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';

describe('Revenue API Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;
  const testVenueId = 'test-venue-123';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    
    // Mock authentication - in real tests, get actual token
    authToken = 'Bearer test-token-12345';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/analytics/revenue/summary', () => {
    it('should return revenue summary with valid date range', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('channels');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.channels)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('should return 401 without authentication', async () => {
      await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .expect(401);
    });

    it('should return 400 with invalid date range', async () => {
      await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2024-12-31',
          endDate: '2024-01-01'
        })
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should return 400 with missing required parameters', async () => {
      await request(app.server)
        .get('/api/analytics/revenue/summary')
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should handle date range over 730 days', async () => {
      await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2022-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(400);
    });
  });

  describe('GET /api/analytics/revenue/by-channel', () => {
    it('should return channel breakdown', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/by-channel')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('channels');
      expect(response.body).toHaveProperty('total');
    });

    it('should respect tenant isolation', async () => {
      // Test that different tenants see different data
      const tenant1Token = 'Bearer tenant1-token';
      const tenant2Token = 'Bearer tenant2-token';

      const response1 = await request(app.server)
        .get('/api/analytics/revenue/by-channel')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', tenant1Token);

      const response2 = await request(app.server)
        .get('/api/analytics/revenue/by-channel')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', tenant2Token);

      // Verify data is different (tenant isolation working)
      expect(response1.body.total).not.toEqual(response2.body.total);
    });
  });

  describe('GET /api/analytics/revenue/projections', () => {
    it('should project revenue for valid days', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/projections')
        .query({ days: 30 })
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toHaveProperty('projectedRevenue');
      expect(response.body).toHaveProperty('avgDailyRevenue');
      expect(response.body).toHaveProperty('daysProjected');
      expect(response.body.daysProjected).toBe(30);
    });

    it('should reject projection days over 365', async () => {
      await request(app.server)
        .get('/api/analytics/revenue/projections')
        .query({ days: 400 })
        .set('Authorization', authToken)
        .expect(400);
    });

    it('should reject non-integer days', async () => {
      await request(app.server)
        .get('/api/analytics/revenue/projections')
        .query({ days: 30.5 })
        .set('Authorization', authToken)
        .expect(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make 101 requests (over the 100 limit)
      const requests = Array.from({ length: 101 }, () =>
        request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
          .set('Authorization', authToken)
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      
      expect(rateLimited).toBe(true);
    });
  });

  describe('Response Format', () => {
    it('should return consistent JSON structure', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', authToken)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
      expect(typeof response.body).toBe('object');
    });

    it('should include proper error messages', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate: 'invalid-date', endDate: '2024-12-31' })
        .set('Authorization', authToken)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBeTruthy();
    });
  });
});
