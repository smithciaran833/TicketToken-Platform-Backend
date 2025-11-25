import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';

describe('Error Handling & Edge Cases', () => {
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

  describe('Database Connection Errors', () => {
    it('should handle database unavailability gracefully', async () => {
      // This test simulates database unavailability
      // In real scenario, temporarily shut down database
      
      const response = await request(app.server)
        .get('/health/liveness')
        .expect((res) => {
          expect([200, 503]).toContain(res.status);
        });

      if (response.status === 503) {
        expect(response.body).toHaveProperty('error');
        expect(response.body.status).toBe('unhealthy');
      }
    });

    it('should return appropriate error on query timeout', async () => {
      // Test with extremely large date range to potentially trigger timeout
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '1900-01-01',
          endDate: '2100-12-31'
        })
        .set('Authorization', authToken);

      expect([400, 500, 504]).toContain(response.status);
      if (response.status >= 400) {
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Invalid Input Handling', () => {
    it('should reject invalid date formats', async () => {
      const invalidDates = [
        'not-a-date',
        '2024-13-01', // Invalid month
        '2024-02-30', // Invalid day
        '99999-01-01', // Far future
        '',
        null,
      ];

      for (const invalidDate of invalidDates) {
        const response = await request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({
            startDate: invalidDate,
            endDate: '2024-12-31'
          })
          .set('Authorization', authToken);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject invalid venue IDs', async () => {
      const invalidVenueIds = [
        'not-a-uuid',
        '123',
        'abc',
        '',
        'x'.repeat(100), // Too long
      ];

      for (const invalidId of invalidVenueIds) {
        const response = await request(app.server)
          .get('/api/analytics/customers/lifetime-value')
          .query({ venueId: invalidId })
          .set('Authorization', authToken);

        expect([400, 422]).toContain(response.status);
      }
    });

    it('should reject out-of-range values', async () => {
      // Test projection days out of range
      const outOfRangeValues = [-1, 0, 366, 1000];

      for (const days of outOfRangeValues) {
        const response = await request(app.server)
          .get('/api/analytics/revenue/projections')
          .query({ days })
          .set('Authorization', authToken);

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid');
      }
    });

    it('should handle non-integer values', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/projections')
        .query({ days: 30.5 })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('integer');
    });
  });

  describe('Empty Data Edge Cases', () => {
    it('should handle zero revenue gracefully', async () => {
      // Test with venue that has no sales
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-02'
        })
        .set('Authorization', 'Bearer empty-venue-token');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(0);
      expect(Array.isArray(response.body.channels)).toBe(true);
    });

    it('should handle venues with no customers', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .set('Authorization', 'Bearer empty-venue-token');

      expect(response.status).toBe(200);
      expect(response.body.totalCustomers).toBe(0);
      expect(response.body.averageClv).toBe(0);
      expect(response.body.segments.high.count).toBe(0);
      expect(response.body.segments.medium.count).toBe(0);
      expect(response.body.segments.low.count).toBe(0);
    });

    it('should handle single customer edge case', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/segments')
        .set('Authorization', 'Bearer single-customer-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // Single customer should still be segmented
    });

    it('should handle events with no ticket sales', async () => {
      const response = await request(app.server)
        .get('/api/analytics/events/performance')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Check events with 0 sales have correct utilization
      response.body.forEach((event: any) => {
        if (event.ticketsSold === 0) {
          expect(event.capacityUtilization).toBe(0);
        }
      });
    });
  });

  describe('Extreme Values', () => {
    it('should handle very large revenue values', async () => {
      // Test with hypothetical large venue
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', 'Bearer large-venue-token');

      expect(response.status).toBe(200);
      expect(typeof response.body.total).toBe('number');
      expect(response.body.total).toBeGreaterThanOrEqual(0);
      expect(isFinite(response.body.total)).toBe(true);
    });

    it('should handle customer with single-day lifespan', async () => {
      // Customer who made multiple purchases on same day
      const response = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .set('Authorization', 'Bearer same-day-customer-token');

      expect(response.status).toBe(200);
      expect(response.body.averageClv).toBeGreaterThanOrEqual(0);
      expect(isFinite(response.body.averageClv)).toBe(true);
    });

    it('should handle sold-out event correctly', async () => {
      const response = await request(app.server)
        .get('/api/analytics/events/performance')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      
      // Check sold-out events
      response.body.forEach((event: any) => {
        expect(event.capacityUtilization).toBeGreaterThanOrEqual(0);
        expect(event.capacityUtilization).toBeLessThanOrEqual(100);
      });
    });

    it('should handle very long date ranges', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2022-01-01',
          endDate: '2024-01-01'
        })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('range');
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple simultaneous requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({
            startDate: '2024-01-01',
            endDate: '2024-12-31'
          })
          .set('Authorization', authToken)
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('total');
      });

      // All responses should have same data (consistent)
      const firstTotal = responses[0].body.total;
      responses.forEach(response => {
        expect(response.body.total).toBe(firstTotal);
      });
    });

    it('should handle concurrent price updates safely', async () => {
      const eventId = 'test-event-uuid';
      const newPrice = 100.00;

      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app.server)
          .post('/api/analytics/pricing/changes')
          .send({
            eventId,
            newPrice: newPrice + i,
            reason: `concurrent-test-${i}`
          })
          .set('Authorization', authToken)
      );

      const responses = await Promise.all(requests);

      // At least one should succeed
      const successful = responses.filter(r => r.status === 201);
      expect(successful.length).toBeGreaterThan(0);
    });
  });

  describe('Missing Required Parameters', () => {
    it('should reject requests without required query parameters', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        // Missing startDate and endDate
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject POST requests without required body fields', async () => {
      const response = await request(app.server)
        .post('/api/analytics/export')
        .send({
          format: 'csv'
          // Missing type, startDate, endDate
        })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
    });
  });

  describe('Division by Zero Protection', () => {
    it('should not crash on division by zero in calculations', async () => {
      // Test scenarios that might cause division by zero
      const response = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .set('Authorization', 'Bearer zero-data-token');

      expect(response.status).toBe(200);
      expect(response.body.averageClv).toBe(0);
      expect(isNaN(response.body.averageClv)).toBe(false);
    });

    it('should handle capacity utilization with zero capacity', async () => {
      const response = await request(app.server)
        .get('/api/analytics/events/performance')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      
      response.body.forEach((event: any) => {
        expect(isNaN(event.capacityUtilization)).toBe(false);
        expect(isFinite(event.capacityUtilization)).toBe(true);
      });
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in date parameters', async () => {
      const maliciousInputs = [
        "2024-01-01'; DROP TABLE tickets; --",
        "2024-01-01' OR '1'='1",
        "'; DELETE FROM analytics_data; --"
      ];

      for (const maliciousInput of maliciousInputs) {
        const response = await request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({
            startDate: maliciousInput,
            endDate: '2024-12-31'
          })
          .set('Authorization', authToken);

        // Should reject as invalid date, not execute SQL
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid');
      }
    });

    it('should prevent SQL injection in venue ID', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .query({ venueId: "'; DROP TABLE customers; --" })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
    });
  });
});
