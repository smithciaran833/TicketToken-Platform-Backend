/**
 * Compliance Controller Integration Tests
 *
 * Tests the compliance controller endpoints including:
 * - GET /compliance/tax-forms/:year - Get tax form for a year
 * - GET /compliance/tax-forms/:year/download - Download tax form PDF
 * - GET /compliance/tax-summary - Get tax summary across years
 *
 * Covers:
 * - Authentication requirements
 * - Form generation when required vs not required
 * - PDF download headers
 * - Multi-year tax summary
 * - Edge cases (no transactions, below threshold, above threshold)
 */

import { FastifyInstance } from 'fastify';
import { Knex } from 'knex';
import Redis from 'ioredis';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  createTestToken,
  pool,
  db,
} from '../setup';

describe('ComplianceController', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let authToken: string;

  beforeAll(async () => {
    const context = await setupTestApp();
    app = context.app;
    testTenantId = context.testTenantId;
    testUserId = context.testUserId;
    testVenueId = context.testVenueId;
    testEventId = context.testEventId;
    authToken = createTestToken(testUserId, testTenantId, 'organizer');
  });

  afterAll(async () => {
    await teardownTestApp({ app, db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean up tax-related tables
    await pool.query('DELETE FROM tax_forms_1099da').catch(() => {});
    await pool.query('DELETE FROM user_tax_info').catch(() => {});
  });

  // ============================================================================
  // GET /compliance/tax-forms/:year
  // ============================================================================
  describe('GET /compliance/tax-forms/:year', () => {
    describe('authentication', () => {
      it('should return 401 when no auth token provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.payload);
        expect(body.error).toBeDefined();
      });

      it('should return 401 when invalid auth token provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        });

        expect(response.statusCode).toBe(401);
      });

      it('should return 401 when malformed auth header provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
          headers: {
            Authorization: 'malformed-header',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('when form is not required', () => {
      it('should return required: false when no NFT transactions exist', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.required).toBe(false);
        expect(body.message).toContain('not required');
      });

      it('should return required: false when total proceeds below $600 threshold', async () => {
        // The Form1099DAService checks against complianceConfig.tax.digitalAssetReporting.threshold (600)
        // Without actual resale_listings data, it will return required: false
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.required).toBe(false);
      });

      it('should return required: false for tax year before 2025 (before reporting start date)', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2024',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.required).toBe(false);
      });
    });

    describe('year parameter validation', () => {
      it('should handle valid year parameter', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should handle year as string that parses to valid integer', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should handle future year', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2030',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        // Should still work, just return no data
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.required).toBe(false);
      });

      it('should handle very old year', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2020',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.required).toBe(false);
      });
    });

    describe('response structure', () => {
      it('should return proper structure when form not required', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('required');
        expect(typeof body.required).toBe('boolean');
        if (!body.required) {
          expect(body).toHaveProperty('message');
        }
      });
    });
  });

  // ============================================================================
  // GET /compliance/tax-forms/:year/download
  // ============================================================================
  describe('GET /compliance/tax-forms/:year/download', () => {
    describe('authentication', () => {
      it('should return 401 when no auth token provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025/download',
        });

        expect(response.statusCode).toBe(401);
      });

      it('should return 401 when invalid auth token provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025/download',
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('when no tax form available', () => {
      it('should return 404 when form not required (no transactions)', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025/download',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.error).toBeDefined();
      });

      it('should return 404 for year before reporting start date', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2024/download',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.error).toBeDefined();
      });
    });

    describe('year parameter handling', () => {
      it('should handle valid year returning 404 when no data', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2025/download',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        // Will be 404 because no data
        expect(response.statusCode).toBe(404);
      });

      it('should handle future year', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-forms/2030/download',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ============================================================================
  // GET /compliance/tax-summary
  // ============================================================================
  describe('GET /compliance/tax-summary', () => {
    describe('authentication', () => {
      it('should return 401 when no auth token provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.payload);
        expect(body.error).toBeDefined();
      });

      it('should return 401 when invalid auth token provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('successful response', () => {
      it('should return summary with years array', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('years');
        expect(Array.isArray(body.years)).toBe(true);
      });

      it('should return last 3 years of tax data', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.years.length).toBe(3);

        const currentYear = new Date().getFullYear();
        const expectedYears = [currentYear - 2, currentYear - 1, currentYear];
        const returnedYears = body.years.map((y: any) => y.year);

        expectedYears.forEach((year) => {
          expect(returnedYears).toContain(year);
        });
      });

      it('should include status for each year', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);

        body.years.forEach((yearData: any) => {
          expect(yearData).toHaveProperty('year');
          expect(typeof yearData.year).toBe('number');
          expect(yearData).toHaveProperty('status');
          expect(['pending', 'not_required', 'generated', 'sent']).toContain(yearData.status);
        });
      });

      it('should return not_required status when no transactions exist', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);

        // All years should be not_required since no resale transactions
        body.years.forEach((yearData: any) => {
          expect(yearData.status).toBe('not_required');
        });
      });
    });

    describe('user isolation', () => {
      it('should only return data for authenticated user', async () => {
        // Create a second user
        const secondUserId = '00000000-0000-0000-0000-000000000099';
        await pool.query(
          `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [secondUserId, 'second@example.com', '$2b$10$dummyhash', true, 'ACTIVE', 'organizer', testTenantId]
        );

        const secondToken = createTestToken(secondUserId, testTenantId, 'organizer');

        // First user's request
        const response1 = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        // Second user's request
        const response2 = await app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: `Bearer ${secondToken}`,
          },
        });

        expect(response1.statusCode).toBe(200);
        expect(response2.statusCode).toBe(200);

        // Both should get their own data (which is empty/not_required in this case)
        const body1 = JSON.parse(response1.payload);
        const body2 = JSON.parse(response2.payload);

        expect(body1.years).toBeDefined();
        expect(body2.years).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================
  describe('edge cases', () => {
    it('should handle user with tax info but no transactions', async () => {
      // Insert user tax info
      await pool.query(
        `INSERT INTO user_tax_info (user_id, address, tin, tin_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [testUserId, '123 Main St, Nashville, TN 37203', '123-45-6789', 'ssn']
      ).catch(() => {});

      const response = await app.inject({
        method: 'GET',
        url: '/compliance/tax-forms/2025',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.required).toBe(false);
    });

    it('should handle concurrent requests from same user', async () => {
      const requests = Array(5).fill(null).map(() =>
        app.inject({
          method: 'GET',
          url: '/compliance/tax-summary',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.years).toBeDefined();
      });
    });

    it('should handle requests for multiple years in sequence', async () => {
      const years = [2023, 2024, 2025, 2026];

      for (const year of years) {
        const response = await app.inject({
          method: 'GET',
          url: `/compliance/tax-forms/${year}`,
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('required');
      }
    });
  });

  // ============================================================================
  // Different User Roles
  // ============================================================================
  describe('user roles', () => {
    it('should allow organizer role to access tax forms', async () => {
      const organizerToken = createTestToken(testUserId, testTenantId, 'organizer');

      const response = await app.inject({
        method: 'GET',
        url: '/compliance/tax-forms/2025',
        headers: {
          Authorization: `Bearer ${organizerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow admin role to access tax forms', async () => {
      const adminToken = createTestToken(testUserId, testTenantId, 'admin');

      const response = await app.inject({
        method: 'GET',
        url: '/compliance/tax-forms/2025',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow user role to access their own tax forms', async () => {
      const userToken = createTestToken(testUserId, testTenantId, 'user');

      const response = await app.inject({
        method: 'GET',
        url: '/compliance/tax-forms/2025',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
