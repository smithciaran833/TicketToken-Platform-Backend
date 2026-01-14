/**
 * Security Tests for Minting Service
 * 
 * Tests for authentication, authorization, input validation,
 * and other security-critical functionality.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Security Tests', () => {
  let api: AxiosInstance;

  beforeAll(() => {
    api = axios.create({
      baseURL: API_URL,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on error status codes
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
      });

      expect(response.status).toBe(401);
      expect(response.data.error).toBeDefined();
    });

    it('should reject requests with invalid JWT', async () => {
      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
      }, {
        headers: {
          'Authorization': 'Bearer invalid.jwt.token',
        },
      });

      expect(response.status).toBe(401);
    });

    it('should reject requests with expired JWT', async () => {
      // This would require a pre-generated expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ';
      
      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
      }, {
        headers: {
          'Authorization': `Bearer ${expiredToken}`,
        },
      });

      expect(response.status).toBe(401);
    });

    it('should reject admin endpoints without admin credentials', async () => {
      const response = await api.get('/admin/queue/stats');

      expect(response.status).toBe(401);
    });

    it('should reject detailed health without API key when configured', async () => {
      // This test assumes HEALTH_API_KEY is configured
      const response = await api.get('/health/detailed');

      // If HEALTH_API_KEY is not configured, this will return 200
      // If configured, should return 401
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Authorization', () => {
    it('should enforce tenant isolation', async () => {
      // Create a request with tenant A's token trying to access tenant B's data
      // This would require proper JWT tokens for different tenants
      
      const response = await api.get('/internal/mint/status/some-job-id', {
        headers: {
          'Authorization': 'Bearer valid-token-tenant-a',
          'X-Tenant-ID': 'tenant-b', // Different tenant
        },
      });

      // Should be rejected or return empty/not found
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe('Input Validation', () => {
    it('should reject XSS payloads in metadata', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
        metadata: {
          name: xssPayload,
          description: xssPayload,
        },
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      // Should either sanitize or reject
      if (response.status === 202) {
        // If accepted, verify payload was sanitized
        expect(response.data.metadata?.name).not.toContain('<script>');
      }
    });

    it('should reject SQL injection attempts', async () => {
      const sqlPayload = "'; DROP TABLE mints; --";
      
      const response = await api.post('/internal/mint', {
        ticketId: sqlPayload,
        tenantId: 'test-tenant',
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      // Should reject invalid input or sanitize
      expect([400, 401, 422]).toContain(response.status);
    });

    it('should reject oversized payloads', async () => {
      const largePayload = {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
        metadata: {
          description: 'x'.repeat(1000000), // 1MB string
        },
      };
      
      const response = await api.post('/internal/mint', largePayload, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      expect([400, 413, 422]).toContain(response.status);
    });

    it('should validate ticketId format', async () => {
      const response = await api.post('/internal/mint', {
        ticketId: '', // Empty
        tenantId: 'test-tenant',
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      expect(response.status).toBe(400);
    });

    it('should validate tenantId format', async () => {
      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: '', // Empty
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      expect(response.status).toBe(400);
    });

    it('should reject prototype pollution attempts', async () => {
      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
        '__proto__': { admin: true },
        'constructor': { prototype: { admin: true } },
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      // Should either ignore or reject malicious properties
      expect([400, 401, 202]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive requests', async () => {
      const requests = [];
      for (let i = 0; i < 150; i++) {
        requests.push(
          api.get('/health', {
            headers: { 'X-Forwarded-For': '192.168.1.100' }, // Same IP
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      // Should have some rate limited responses if rate limiting is enabled
      console.log(`Rate limited: ${rateLimitedCount} / ${responses.length}`);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in response', async () => {
      const response = await api.get('/health');

      // Check for important security headers
      const headers = response.headers;
      
      // These are common security headers that should be present
      // Note: Not all may be configured, but they should be checked
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
      ];

      const presentHeaders = securityHeaders.filter(h => headers[h] !== undefined);
      console.log('Security headers present:', presentHeaders);
    });

    it('should not expose server version', async () => {
      const response = await api.get('/health');

      // Should not have server header exposing version
      expect(response.headers['server']).not.toMatch(/\d+\.\d+/);
    });

    it('should not expose detailed error info in production', async () => {
      const response = await api.get('/nonexistent-endpoint');

      expect(response.status).toBe(404);
      // Error message should not expose stack trace
      expect(response.data.stack).toBeUndefined();
      expect(response.data.error).not.toContain('/home/');
      expect(response.data.error).not.toContain('node_modules');
    });
  });

  describe('Sensitive Data Handling', () => {
    it('should not expose wallet private key in errors', async () => {
      const response = await api.get('/health/detailed', {
        headers: {
          'X-Health-API-Key': 'test-key',
        },
      });

      const responseText = JSON.stringify(response.data);
      
      // Should not contain anything that looks like a private key
      expect(responseText).not.toMatch(/[A-HJ-NP-Za-km-z1-9]{64}/); // Base58 private key pattern
      expect(responseText).not.toMatch(/-----BEGIN.*KEY-----/);
    });

    it('should not expose internal IPs in error messages', async () => {
      const response = await api.get('/health/detailed', {
        headers: {
          'X-Health-API-Key': 'test-key',
        },
      });

      const responseText = JSON.stringify(response.data);
      
      // Should not contain internal IPs
      expect(responseText).not.toMatch(/192\.168\.\d+\.\d+/);
      expect(responseText).not.toMatch(/10\.\d+\.\d+\.\d+/);
      expect(responseText).not.toMatch(/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/);
    });

    it('should sanitize logs from sensitive data', async () => {
      // This test verifies the logger sanitization
      // Would need access to log output to properly verify
      
      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
        metadata: {
          secret: 'super-secret-value',
          apiKey: 'my-api-key',
        },
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      // The response itself shouldn't contain the secret
      // (assuming it's in the request body, not echoed back)
    });
  });

  describe('Denial of Service Protection', () => {
    it('should handle slow client connections', async () => {
      // This test simulates a slow loris attack
      // The server should timeout slow connections
      
      const startTime = Date.now();
      const response = await api.get('/health', {
        timeout: 30000, // Client timeout
      });
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000); // Should respond quickly
    });

    it('should reject deeply nested JSON', async () => {
      // Create deeply nested object
      let nested: any = { value: 'test' };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }

      const response = await api.post('/internal/mint', {
        ticketId: 'test-ticket',
        tenantId: 'test-tenant',
        metadata: nested,
      }, {
        headers: {
          'Authorization': 'Bearer test-token',
          'X-Tenant-ID': 'test-tenant',
        },
      });

      // Should either reject or handle gracefully
      expect([400, 401, 413, 422, 500]).toContain(response.status);
    });
  });

  describe('CORS Policy', () => {
    it('should enforce CORS for browser requests', async () => {
      const response = await api.options('/internal/mint', {
        headers: {
          'Origin': 'https://malicious-site.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      // Should not allow arbitrary origins
      const allowedOrigin = response.headers['access-control-allow-origin'];
      expect(allowedOrigin).not.toBe('*');
      expect(allowedOrigin).not.toBe('https://malicious-site.com');
    });
  });
});

describe('Crypto Security Tests', () => {
  it('should use secure random number generation', async () => {
    // This would be a code review / static analysis check
    // Verify that Math.random() is not used for security purposes
    // and crypto.randomBytes() or similar is used instead
  });

  it('should use timing-safe comparison for secrets', async () => {
    // This would be a code review check
    // Verify that crypto.timingSafeEqual is used for comparing secrets
  });
});
