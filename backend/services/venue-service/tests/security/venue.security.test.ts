/**
 * Security Tests for Venue Service (MT4)
 * 
 * Tests for common security vulnerabilities:
 * - Authentication/Authorization bypass
 * - SQL Injection
 * - XSS prevention
 * - IDOR (Insecure Direct Object Reference)
 * - Rate limiting
 * - Input validation
 * - Header security
 * 
 * Run: npm run test:security
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.SECURITY_TEST_URL || 'http://localhost:3004';

describe('Venue Service Security Tests', () => {
  let client: AxiosInstance;
  let validToken: string;
  let validTenantId: string;

  beforeAll(() => {
    client = axios.create({
      baseURL: BASE_URL,
      timeout: 10000,
      validateStatus: () => true,
    });

    validToken = process.env.TEST_AUTH_TOKEN || 'test-jwt-token';
    validTenantId = process.env.TEST_TENANT_ID || '11111111-1111-1111-1111-111111111111';
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================
  describe('Authentication Security', () => {
    it('should reject requests without authentication token', async () => {
      const response = await client.get('/api/v1/venues');
      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid JWT format', async () => {
      const response = await client.get('/api/v1/venues', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(response.status).toBe(401);
    });

    it('should reject requests with expired token', async () => {
      // Expired JWT token (exp in past)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QiLCJleHAiOjE2MDAwMDAwMDB9.invalid';
      const response = await client.get('/api/v1/venues', {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      expect(response.status).toBe(401);
    });

    it('should reject requests with tampered JWT', async () => {
      // Valid structure but modified payload
      const tamperedToken = `${validToken.split('.')[0]}.${Buffer.from('{"sub":"hacker"}').toString('base64')}.${validToken.split('.')[2]}`;
      const response = await client.get('/api/v1/venues', {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      expect(response.status).toBe(401);
    });

    it('should reject requests with SQL in Authorization header', async () => {
      const response = await client.get('/api/v1/venues', {
        headers: { Authorization: "Bearer ' OR '1'='1" },
      });
      expect(response.status).toBe(401);
    });
  });

  // ==========================================================================
  // Authorization Tests (IDOR Prevention)
  // ==========================================================================
  describe('Authorization & IDOR Prevention', () => {
    const tenant1Id = '22222222-2222-2222-2222-222222222222';
    const tenant2Id = '33333333-3333-3333-3333-333333333333';
    let tenant1VenueId: string;

    beforeAll(async () => {
      // Create venue for tenant 1
      const response = await client.post('/api/v1/venues', {
        name: 'Security Test Venue',
        address: '123 Secure St',
        city: 'Test City',
        state: 'TS',
        country: 'US',
        postal_code: '12345',
        capacity: 1000,
        venue_type: 'arena',
      }, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': tenant1Id,
        },
      });
      
      if (response.status === 201) {
        tenant1VenueId = response.data.id;
      }
    });

    it('should prevent tenant 2 from accessing tenant 1 data', async () => {
      if (!tenant1VenueId) return;

      const response = await client.get(`/api/v1/venues/${tenant1VenueId}`, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': tenant2Id,
        },
      });
      expect(response.status).toBe(404);
    });

    it('should prevent tenant 2 from modifying tenant 1 data', async () => {
      if (!tenant1VenueId) return;

      const response = await client.put(`/api/v1/venues/${tenant1VenueId}`, {
        name: 'Hacked Venue',
      }, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': tenant2Id,
        },
      });
      expect(response.status).toBe(404);
    });

    it('should prevent tenant 2 from deleting tenant 1 data', async () => {
      if (!tenant1VenueId) return;

      const response = await client.delete(`/api/v1/venues/${tenant1VenueId}`, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': tenant2Id,
        },
      });
      expect(response.status).toBe(404);
    });

    it('should reject invalid UUID tenant ID format', async () => {
      const response = await client.get('/api/v1/venues', {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': 'not-a-uuid',
        },
      });
      expect(response.status).toBe(400);
    });

    afterAll(async () => {
      if (tenant1VenueId) {
        await client.delete(`/api/v1/venues/${tenant1VenueId}`, {
          headers: {
            Authorization: `Bearer ${validToken}`,
            'X-Tenant-ID': tenant1Id,
          },
        });
      }
    });
  });

  // ==========================================================================
  // SQL Injection Tests
  // ==========================================================================
  describe('SQL Injection Prevention', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE venues; --",
      "1' OR '1'='1",
      "1'; DELETE FROM venues WHERE '1'='1",
      "1 UNION SELECT * FROM users",
      "1; INSERT INTO venues VALUES ('hacked')",
      "1/**/OR/**/1=1",
      "admin'--",
      "' OR 1=1#",
      "' OR 'x'='x",
    ];

    it('should prevent SQL injection in venue name parameter', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await client.post('/api/v1/venues', {
          name: payload,
          address: '123 Test',
          city: 'Test',
          state: 'TS',
          country: 'US',
          postal_code: '12345',
          capacity: 1000,
          venue_type: 'arena',
        }, {
          headers: {
            Authorization: `Bearer ${validToken}`,
            'X-Tenant-ID': validTenantId,
          },
        });
        
        // Should either reject (400) or sanitize/escape the input
        expect([201, 400]).toContain(response.status);
        if (response.status === 201) {
          // Cleanup
          await client.delete(`/api/v1/venues/${response.data.id}`, {
            headers: {
              Authorization: `Bearer ${validToken}`,
              'X-Tenant-ID': validTenantId,
            },
          });
        }
      }
    });

    it('should prevent SQL injection in URL parameters', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await client.get(`/api/v1/venues/${encodeURIComponent(payload)}`, {
          headers: {
            Authorization: `Bearer ${validToken}`,
            'X-Tenant-ID': validTenantId,
          },
        });
        
        // Should return 400 (invalid UUID) or 404, never 500
        expect([400, 404]).toContain(response.status);
      }
    });

    it('should prevent SQL injection in query parameters', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await client.get('/api/v1/venues', {
          headers: {
            Authorization: `Bearer ${validToken}`,
            'X-Tenant-ID': validTenantId,
          },
          params: {
            search: payload,
            page: payload,
            limit: payload,
          },
        });
        
        // Should not cause server error
        expect(response.status).not.toBe(500);
      }
    });
  });

  // ==========================================================================
  // XSS Prevention Tests
  // ==========================================================================
  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)">',
      'javascript:alert(1)',
      '<iframe src="javascript:alert(1)">',
      '"><script>alert(1)</script>',
      "'-alert(1)-'",
      '<body onload="alert(1)">',
      '<input onfocus="alert(1)" autofocus>',
    ];

    it('should sanitize XSS payloads in venue data', async () => {
      for (const payload of xssPayloads) {
        const response = await client.post('/api/v1/venues', {
          name: `Test ${payload}`,
          description: payload,
          address: '123 Test',
          city: 'Test',
          state: 'TS',
          country: 'US',
          postal_code: '12345',
          capacity: 1000,
          venue_type: 'arena',
        }, {
          headers: {
            Authorization: `Bearer ${validToken}`,
            'X-Tenant-ID': validTenantId,
          },
        });

        if (response.status === 201) {
          // Verify the payload was sanitized or escaped
          expect(response.data.description).not.toContain('<script>');
          expect(response.data.description).not.toContain('onerror=');
          expect(response.data.description).not.toContain('onload=');
          
          // Cleanup
          await client.delete(`/api/v1/venues/${response.data.id}`, {
            headers: {
              Authorization: `Bearer ${validToken}`,
              'X-Tenant-ID': validTenantId,
            },
          });
        }
      }
    });
  });

  // ==========================================================================
  // Input Validation Tests
  // ==========================================================================
  describe('Input Validation', () => {
    it('should reject venue with capacity exceeding max', async () => {
      const response = await client.post('/api/v1/venues', {
        name: 'Invalid Capacity Venue',
        address: '123 Test',
        city: 'Test',
        state: 'TS',
        country: 'US',
        postal_code: '12345',
        capacity: 999999999999,
        venue_type: 'arena',
      }, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': validTenantId,
        },
      });
      expect([400, 422]).toContain(response.status);
    });

    it('should reject venue with negative capacity', async () => {
      const response = await client.post('/api/v1/venues', {
        name: 'Negative Capacity Venue',
        address: '123 Test',
        city: 'Test',
        state: 'TS',
        country: 'US',
        postal_code: '12345',
        capacity: -1000,
        venue_type: 'arena',
      }, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': validTenantId,
        },
      });
      expect([400, 422]).toContain(response.status);
    });

    it('should reject oversized request body', async () => {
      const largePayload = {
        name: 'Test',
        description: 'x'.repeat(10 * 1024 * 1024), // 10MB string
      };
      
      const response = await client.post('/api/v1/venues', largePayload, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': validTenantId,
        },
      });
      expect([400, 413]).toContain(response.status);
    });

    it('should reject invalid venue_type enum', async () => {
      const response = await client.post('/api/v1/venues', {
        name: 'Invalid Type Venue',
        address: '123 Test',
        city: 'Test',
        state: 'TS',
        country: 'US',
        postal_code: '12345',
        capacity: 1000,
        venue_type: 'invalid_type',
      }, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': validTenantId,
        },
      });
      expect([400, 422]).toContain(response.status);
    });
  });

  // ==========================================================================
  // Rate Limiting Tests
  // ==========================================================================
  describe('Rate Limiting', () => {
    it('should enforce rate limits on repeated requests', async () => {
      const requests = [];
      
      // Make 150 rapid requests (assuming limit is 100/min)
      for (let i = 0; i < 150; i++) {
        requests.push(
          client.get('/api/v1/venues', {
            headers: {
              Authorization: `Bearer ${validToken}`,
              'X-Tenant-ID': validTenantId,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should include rate limit headers', async () => {
      const response = await client.get('/api/v1/venues', {
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-Tenant-ID': validTenantId,
        },
      });

      // Check for rate limit headers
      expect(
        response.headers['x-ratelimit-limit'] ||
        response.headers['ratelimit-limit']
      ).toBeDefined();
    });
  });

  // ==========================================================================
  // Security Headers Tests
  // ==========================================================================
  describe('Security Headers', () => {
    it('should include security headers in response', async () => {
      const response = await client.get('/health');

      // Check for common security headers
      const headers = response.headers;
      
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBeDefined();
      // X-XSS-Protection may be deprecated but still useful
    });

    it('should not expose server version', async () => {
      const response = await client.get('/health');
      
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).not.toContain('Express');
    });
  });

  // ==========================================================================
  // Path Traversal Tests
  // ==========================================================================
  describe('Path Traversal Prevention', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ];

    it('should prevent path traversal in URL', async () => {
      for (const payload of pathTraversalPayloads) {
        const response = await client.get(`/api/v1/venues/${encodeURIComponent(payload)}`, {
          headers: {
            Authorization: `Bearer ${validToken}`,
            'X-Tenant-ID': validTenantId,
          },
        });
        
        expect([400, 404]).toContain(response.status);
        expect(response.data).not.toContain('root:');
      }
    });
  });
});
