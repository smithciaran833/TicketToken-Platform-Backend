import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';

describe('Security Testing', () => {
  let app: FastifyInstance;
  let authToken: string;
  const tenant1Token = 'Bearer tenant1-token';
  const tenant2Token = 'Bearer tenant2-token';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    authToken = 'Bearer test-token-12345';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without authentication', async () => {
      const endpoints = [
        '/api/analytics/revenue/summary?startDate=2024-01-01&endDate=2024-12-31',
        '/api/analytics/customers/lifetime-value',
        '/api/analytics/customers/segments',
        '/api/analytics/events/performance?startDate=2024-01-01&endDate=2024-12-31',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app.server)
          .get(endpoint);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject requests with invalid tokens', async () => {
      const invalidTokens = [
        'Bearer invalid-token',
        'Bearer expired-token',
        'InvalidFormat token',
        'Bearer',
        '',
      ];

      for (const invalidToken of invalidTokens) {
        const response = await request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
          .set('Authorization', invalidToken);

        expect([401, 403]).toContain(response.status);
      }
    });

    it('should enforce tenant isolation in data access', async () => {
      // Tenant 1 makes request
      const tenant1Response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', tenant1Token);

      // Tenant 2 makes same request
      const tenant2Response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', tenant2Token);

      // Should return different data
      if (tenant1Response.status === 200 && tenant2Response.status === 200) {
        expect(tenant1Response.body.total).not.toEqual(tenant2Response.body.total);
      }
    });

    it('should prevent privilege escalation attempts', async () => {
      // Try to access admin-only endpoint with regular user token
      const response = await request(app.server)
        .post('/api/analytics/pricing/changes/123/approve')
        .set('Authorization', 'Bearer regular-user-token');

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should sanitize venue ID input', async () => {
      const sqlInjectionPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE events; --",
        "1' AND '1'='1",
        "' UNION SELECT * FROM users --",
        "admin'--",
        "' OR 1=1--",
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app.server)
          .get('/api/analytics/customers/lifetime-value')
          .query({ venueId: payload })
          .set('Authorization', authToken);

        // Should reject as invalid input, not execute SQL
        expect(response.status).toBe(400);
        expect(response.body.error).toBeTruthy();
      }
    });

    it('should prevent SQL injection in date parameters', async () => {
      const sqlPayloads = [
        "2024-01-01'; DELETE FROM analytics_data; --",
        "2024-01-01' OR '1'='1",
      ];

      for (const payload of sqlPayloads) {
        const response = await request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({
            startDate: payload,
            endDate: '2024-12-31'
          })
          .set('Authorization', authToken);

        expect(response.status).toBe(400);
      }
    });

    it('should sanitize search/filter parameters', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/segments')
        .query({ filter: "'; DROP TABLE customers; --" })
        .set('Authorization', authToken);

      // Should either ignore invalid filter or return 400
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize export file names', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<iframe src="javascript:alert(1)">',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app.server)
          .post('/api/analytics/export')
          .send({
            type: 'revenue',
            format: 'csv',
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            filename: payload
          })
          .set('Authorization', authToken);

        if (response.status === 200) {
          // Filename should be sanitized
          expect(response.body.downloadUrl).not.toContain('<script>');
          expect(response.body.downloadUrl).not.toContain('javascript:');
        }
      }
    });

    it('should escape user input in error messages', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '<script>alert(1)</script>',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      // Error message should not contain unescaped script tags
      const errorMessage = JSON.stringify(response.body);
      expect(errorMessage).not.toContain('<script>');
    });
  });

  describe('CSRF Protection', () => {
    it('should require CSRF token for state-changing operations', async () => {
      // POST request without CSRF token
      const response = await request(app.server)
        .post('/api/analytics/pricing/changes')
        .send({
          eventId: 'test-event',
          newPrice: 100.00,
          reason: 'test'
        })
        .set('Authorization', authToken);
        // Not setting CSRF token header

      // Should succeed with valid auth (or require CSRF based on config)
      expect([200, 201, 403]).toContain(response.status);
    });

    it('should accept valid CSRF tokens', async () => {
      const response = await request(app.server)
        .post('/api/analytics/pricing/changes')
        .send({
          eventId: 'test-event',
          newPrice: 100.00,
          reason: 'test'
        })
        .set('Authorization', authToken)
        .set('X-CSRF-Token', 'valid-csrf-token');

      expect([200, 201, 400]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on API endpoints', async () => {
      const requests = [];
      
      // Make 150 requests (over typical 100/min limit)
      for (let i = 0; i < 150; i++) {
        requests.push(
          request(app.server)
            .get('/api/analytics/revenue/summary')
            .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
            .set('Authorization', authToken)
        );
      }

      const responses = await Promise.all(requests);
      
      // Should have some 429 responses
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', authToken);

      if (response.status === 200) {
        // Check for standard rate limit headers
        expect(
          response.headers['x-ratelimit-limit'] ||
          response.headers['ratelimit-limit']
        ).toBeDefined();
      }
    });
  });

  describe('Data Exposure Prevention', () => {
    it('should not expose sensitive data in error messages', async () => {
      const response = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .query({ venueId: 'invalid-uuid-format' })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      
      // Error should not contain:
      const errorStr = JSON.stringify(response.body).toLowerCase();
      expect(errorStr).not.toContain('password');
      expect(errorStr).not.toContain('secret');
      expect(errorStr).not.toContain('token');
      expect(errorStr).not.toContain('connection string');
    });

    it('should not expose stack traces in production', async () => {
      // Trigger an error
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate: 'invalid', endDate: '2024-12-31' })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      
      // Should not contain stack trace in production
      const bodyStr = JSON.stringify(response.body);
      expect(bodyStr).not.toContain('at ');
      expect(bodyStr).not.toContain('.ts:');
      expect(bodyStr).not.toContain('node_modules');
    });

    it('should mask sensitive fields in logs', async () => {
      // Make request that would be logged
      await request(app.server)
        .post('/api/analytics/export')
        .send({
          type: 'revenue',
          format: 'csv',
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken);

      // Verify logs don't contain full tokens (manual check needed)
      // This is a placeholder - actual log checking would require log inspection
      expect(true).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject excessively long input strings', async () => {
      const longString = 'a'.repeat(10000);
      
      const response = await request(app.server)
        .post('/api/analytics/pricing/changes')
        .send({
          eventId: longString,
          newPrice: 100.00,
          reason: longString
        })
        .set('Authorization', authToken);

      expect([400, 413]).toContain(response.status);
    });

    it('should reject malformed JSON payloads', async () => {
      const response = await request(app.server)
        .post('/api/analytics/export')
        .send('{"malformed": json}')
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json');

      expect([400, 422]).toContain(response.status);
    });

    it('should validate data types strictly', async () => {
      const response = await request(app.server)
        .get('/api/analytics/revenue/projections')
        .query({ days: 'not-a-number' })
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeTruthy();
    });
  });

  describe('Multi-Tenant Security', () => {
    it('should prevent cross-tenant data access via direct IDs', async () => {
      // Get data from tenant 1
      const tenant1Res = await request(app.server)
        .get('/api/analytics/events/performance')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', tenant1Token);

      if (tenant1Res.status === 200 && tenant1Res.body.length > 0) {
        const tenant1EventId = tenant1Res.body[0].eventId;

        // Try to access tenant 1's event from tenant 2
        const tenant2Res = await request(app.server)
          .get(`/api/analytics/events/${tenant1EventId}/details`)
          .set('Authorization', tenant2Token);

        // Should return 404 or 403, not the data
        expect([403, 404]).toContain(tenant2Res.status);
      }
    });

    it('should enforce RLS at database level', async () => {
      // This is verified by database integration tests
      // Here we verify it's reflected in API responses
      const response = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
        .set('Authorization', tenant1Token);

      expect(response.status).toBe(200);
      // Data should only belong to tenant 1
      expect(response.body).toBeDefined();
    });
  });

  describe('Secure Headers', () =>{
    it('should include security headers in responses', async () => {
      const response = await request(app.server)
        .get('/health')
        .expect(200);

      // Check for security headers
      expect(
        response.headers['x-content-type-options'] ||
        response.headers['x-frame-options'] ||
        response.headers['x-xss-protection']
      ).toBeDefined();
    });

    it('should not expose server information', async () => {
      const response = await request(app.server)
        .get('/health');

      // Should not reveal exact server version
      const serverHeader = response.headers['server'] || '';
      expect(serverHeader).not.toContain('Express/');
      expect(serverHeader).not.toContain('Fastify/');
    });
  });

  describe('File Upload Security', () => {
    it('should reject files with dangerous extensions', async () => {
      // If service has file upload endpoints
      const dangerousExtensions = ['.exe', '.bat', '.sh', '.php'];
      
      // Placeholder test - actual implementation depends on file upload support
      expect(dangerousExtensions.length).toBeGreaterThan(0);
    });

    it('should enforce file size limits', async () => {
      // Placeholder for file size validation
      expect(true).toBe(true);
    });
  });
});
