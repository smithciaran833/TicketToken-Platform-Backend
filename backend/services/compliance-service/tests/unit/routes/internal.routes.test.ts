// @ts-nocheck
/**
 * Internal Routes Unit Tests - compliance-service
 *
 * Tests for the internal routes endpoints:
 *
 * Spec-required endpoints (STANDARDIZATION_DECISIONS.md):
 * - POST /internal/ofac/screen
 * - POST /internal/gdpr/export
 * - POST /internal/gdpr/delete
 *
 * User-centric endpoints:
 * - GET /internal/users/:userId/data-export
 * - POST /internal/users/:userId/delete
 * - GET /internal/users/:userId/consent
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.USE_NEW_HMAC = 'false'; // Disable HMAC for route logic tests
process.env.NODE_ENV = 'test';

// Mock the database
const mockDb = jest.fn();
mockDb.mockReturnValue({
  where: jest.fn().mockReturnThis(),
  whereRaw: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  raw: jest.fn().mockReturnThis(),
});

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { internalRoutes } from '../../../src/routes/internal.routes';

describe('Internal Routes - compliance-service', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(internalRoutes, { prefix: '/internal' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock chain
    mockDb.mockClear();
    mockDb.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockResolvedValue(5),
      insert: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
    });
  });

  // =========================================================================
  // SPEC-REQUIRED ENDPOINTS (STANDARDIZATION_DECISIONS.md)
  // =========================================================================

  // =========================================================================
  // POST /internal/ofac/screen
  // =========================================================================

  describe('POST /internal/ofac/screen', () => {
    test('should perform OFAC screening and return CLEAR result', async () => {
      mockDb.mockImplementation((table: string) => ({
        insert: jest.fn().mockResolvedValue([{ id: 'screening-123' }]),
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/ofac/screen',
        payload: {
          userId: 'user-123',
          transactionData: {
            amount: 10000,
            currency: 'USD',
            counterpartyName: 'John Doe',
            counterpartyCountry: 'US',
          },
        },
        headers: {
          'x-internal-service': 'payment-service',
          'x-trace-id': 'trace-ofac-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.passed).toBe(true);
      expect(body.result).toBe('CLEAR');
      expect(body.screeningId).toBeDefined();
      expect(body.screenedAt).toBeDefined();
    });

    test('should return 400 for missing userId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/ofac/screen',
        payload: {
          transactionData: { amount: 1000 },
        },
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toContain('userId is required');
    });

    test('should handle database errors gracefully', async () => {
      mockDb.mockImplementation(() => ({
        insert: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/ofac/screen',
        payload: {
          userId: 'user-error',
        },
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.passed).toBe(false);
      expect(body.result).toBe('ERROR');
    });
  });

  // =========================================================================
  // POST /internal/gdpr/export
  // =========================================================================

  describe('POST /internal/gdpr/export', () => {
    test('should export user compliance data', async () => {
      const mockOfacScreenings = [
        { id: '1', screening_type: 'transaction', status: 'completed', result: 'CLEAR', screened_at: new Date(), created_at: new Date() },
      ];
      const mockRiskAssessments = [
        { id: '2', risk_level: 'low', risk_score: 10, factors: {}, assessed_at: new Date(), created_at: new Date() },
      ];
      const mockConsents = [
        { id: '3', consent_type: 'marketing', granted: true, granted_at: new Date(), revoked_at: null, ip_address: '127.0.0.1', created_at: new Date() },
      ];
      const mockKycVerifications = [
        { id: '4', verification_type: 'identity', status: 'verified', provider: 'onfido', verified_at: new Date(), created_at: new Date() },
      ];
      const mockAuditTrail = [
        { id: '5', action: 'login', resource_type: 'session', resource_id: 'sess-1', details: {}, ip_address: '127.0.0.1', created_at: new Date() },
      ];

      mockDb.mockImplementation((table: string) => {
        const chain = {
          where: jest.fn().mockReturnThis(),
          whereRaw: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            if (table === 'compliance_audit_log') return Promise.resolve(mockAuditTrail);
            return Promise.resolve([]);
          }),
        };
        chain.orderBy = jest.fn().mockImplementation(() => {
          if (table === 'ofac_screenings') return Promise.resolve(mockOfacScreenings);
          if (table === 'risk_assessments') return Promise.resolve(mockRiskAssessments);
          if (table === 'user_consents') return Promise.resolve(mockConsents);
          if (table === 'kyc_verifications') return Promise.resolve(mockKycVerifications);
          if (table === 'compliance_audit_log') return chain;
          return Promise.resolve([]);
        });
        return chain;
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/gdpr/export',
        payload: {
          userId: 'user-gdpr-export',
        },
        headers: {
          'x-internal-service': 'auth-service',
          'x-trace-id': 'trace-gdpr-export',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-gdpr-export');
      expect(body.exportedAt).toBeDefined();
      expect(body.data).toBeDefined();
      expect(body.summary).toBeDefined();
    });

    test('should return 400 for missing userId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/gdpr/export',
        payload: {},
        headers: {
          'x-internal-service': 'auth-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('userId is required');
    });

    test('should handle database errors gracefully', async () => {
      mockDb.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockRejectedValue(new Error('Database error')),
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/gdpr/export',
        payload: {
          userId: 'user-error',
        },
        headers: {
          'x-internal-service': 'auth-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });

  // =========================================================================
  // POST /internal/gdpr/delete
  // =========================================================================

  describe('POST /internal/gdpr/delete', () => {
    test('should soft delete user data with legal retention', async () => {
      mockDb.mockImplementation((table: string) => ({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(3),
        delete: jest.fn().mockResolvedValue(2),
        insert: jest.fn().mockResolvedValue([{ id: 'audit-1' }]),
        raw: jest.fn().mockReturnValue("details || '{\"anonymized\": true}'::jsonb"),
      }));
      // Also mock db.raw for the audit trail anonymization
      mockDb.raw = jest.fn().mockReturnValue("details || '{\"anonymized\": true}'::jsonb");

      const response = await app.inject({
        method: 'POST',
        url: '/internal/gdpr/delete',
        payload: {
          userId: 'user-gdpr-delete',
          reason: 'GDPR right to erasure',
          retainForLegal: true,
        },
        headers: {
          'x-internal-service': 'auth-service',
          'x-trace-id': 'trace-gdpr-delete',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-gdpr-delete');
      expect(body.retainedForLegal).toBe(true);
      expect(body.deletedAt).toBeDefined();
      expect(body.deletionResults).toBeDefined();
    });

    test('should hard delete user data when retainForLegal is false', async () => {
      mockDb.mockImplementation((table: string) => ({
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockResolvedValue(5),
        insert: jest.fn().mockResolvedValue([{ id: 'audit-2' }]),
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/gdpr/delete',
        payload: {
          userId: 'user-gdpr-hard-delete',
          reason: 'Complete account termination',
          retainForLegal: false,
        },
        headers: {
          'x-internal-service': 'auth-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.retainedForLegal).toBe(false);
      expect(body.message).toContain('permanently deleted');
    });

    test('should return 400 for missing userId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/gdpr/delete',
        payload: {
          reason: 'Test deletion',
        },
        headers: {
          'x-internal-service': 'auth-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('userId is required');
    });

    test('should handle database errors gracefully', async () => {
      mockDb.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        update: jest.fn().mockRejectedValue(new Error('Database error')),
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/gdpr/delete',
        payload: {
          userId: 'user-error',
        },
        headers: {
          'x-internal-service': 'auth-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });

  // =========================================================================
  // USER-CENTRIC ENDPOINTS
  // =========================================================================

  // =========================================================================
  // GET /internal/users/:userId/data-export
  // =========================================================================

  describe('GET /internal/users/:userId/data-export', () => {
    test('should return user compliance data for GDPR export', async () => {
      // Mock the database responses
      const mockOfacScreenings = [
        { id: '1', screening_type: 'ofac', status: 'clear', result: 'no_match', created_at: new Date() },
      ];
      const mockRiskAssessments = [
        { id: '2', risk_level: 'low', risk_score: 10, created_at: new Date() },
      ];
      const mockConsents = [
        { id: '3', consent_type: 'marketing', granted: true, created_at: new Date() },
      ];
      const mockKycVerifications = [
        { id: '4', verification_type: 'identity', status: 'verified', created_at: new Date() },
      ];
      const mockAuditTrail = [
        { id: '5', action: 'login', resource_type: 'session', created_at: new Date() },
      ];

      // Set up chained mock calls
      let callCount = 0;
      mockDb.mockImplementation((table: string) => {
        const chain = {
          where: jest.fn().mockReturnThis(),
          whereRaw: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            callCount++;
            if (table === 'ofac_screenings') return Promise.resolve(mockOfacScreenings);
            if (table === 'risk_assessments') return Promise.resolve(mockRiskAssessments);
            if (table === 'user_consents') return Promise.resolve(mockConsents);
            if (table === 'kyc_verifications') return Promise.resolve(mockKycVerifications);
            if (table === 'compliance_audit_log') return Promise.resolve(mockAuditTrail);
            return Promise.resolve([]);
          }),
        };
        // For queries that don't use limit (like direct select chains)
        chain.orderBy = jest.fn().mockImplementation(() => {
          if (table === 'ofac_screenings') return Promise.resolve(mockOfacScreenings);
          if (table === 'risk_assessments') return Promise.resolve(mockRiskAssessments);
          if (table === 'user_consents') return Promise.resolve(mockConsents);
          if (table === 'kyc_verifications') return Promise.resolve(mockKycVerifications);
          if (table === 'compliance_audit_log') return chain;
          return Promise.resolve([]);
        });
        return chain;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-123/data-export',
        headers: {
          'x-internal-service': 'api-gateway',
          'x-trace-id': 'trace-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('user-123');
      expect(body.exportedAt).toBeDefined();
      expect(body.data).toBeDefined();
      expect(body.summary).toBeDefined();
    });

    test('should return 400 for invalid URL with missing userId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/internal/users//data-export',
        headers: {
          'x-internal-service': 'api-gateway',
        },
      });

      // Fastify returns 400 for invalid URL pattern (double slash)
      // The route param userId is required
      expect([400, 404]).toContain(response.statusCode);
    });
  });

  // =========================================================================
  // POST /internal/users/:userId/delete
  // =========================================================================

  describe('POST /internal/users/:userId/delete', () => {
    test('should soft delete user data with legal retention', async () => {
      // Mock successful updates
      mockDb.mockImplementation((table: string) => ({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(3),
        delete: jest.fn().mockResolvedValue(2),
        insert: jest.fn().mockResolvedValue([{ id: 'audit-1' }]),
        raw: jest.fn().mockReturnValue("details || '{\"anonymized\": true}'::jsonb"),
      }));
      // Also mock db.raw for the audit trail anonymization
      mockDb.raw = jest.fn().mockReturnValue("details || '{\"anonymized\": true}'::jsonb");

      const response = await app.inject({
        method: 'POST',
        url: '/internal/users/user-456/delete',
        payload: {
          reason: 'GDPR right to erasure',
          retainForLegal: true,
        },
        headers: {
          'x-internal-service': 'auth-service',
          'x-trace-id': 'trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-456');
      expect(body.retainedForLegal).toBe(true);
      expect(body.deletedAt).toBeDefined();
    });

    test('should hard delete user data when retainForLegal is false', async () => {
      mockDb.mockImplementation((table: string) => ({
        where: jest.fn().mockReturnThis(),
        delete: jest.fn().mockResolvedValue(5),
        insert: jest.fn().mockResolvedValue([{ id: 'audit-2' }]),
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/users/user-789/delete',
        payload: {
          reason: 'User account termination',
          retainForLegal: false,
        },
        headers: {
          'x-internal-service': 'auth-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.retainedForLegal).toBe(false);
    });
  });

  // =========================================================================
  // GET /internal/users/:userId/consent
  // =========================================================================

  describe('GET /internal/users/:userId/consent', () => {
    test('should return user consent records', async () => {
      const mockConsents = [
        {
          id: '1',
          user_id: 'user-abc',
          consent_type: 'marketing',
          granted: true,
          granted_at: new Date(),
          revoked_at: null,
          version: '1.0',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '2',
          user_id: 'user-abc',
          consent_type: 'analytics',
          granted: false,
          granted_at: new Date(),
          revoked_at: new Date(),
          version: '1.0',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDb.mockImplementation((table: string) => ({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockConsents),
      }));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-abc/consent',
        headers: {
          'x-internal-service': 'notification-service',
          'x-trace-id': 'trace-abc',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('user-abc');
      expect(body.consents).toHaveLength(2);
      expect(body.summary).toBeDefined();
      expect(body.summary.marketing).toBe(true);
      expect(body.summary.analytics).toBe(false);
    });

    test('should return empty consents for user with no records', async () => {
      mockDb.mockImplementation((table: string) => ({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      }));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/new-user/consent',
        headers: {
          'x-internal-service': 'api-gateway',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('new-user');
      expect(body.consents).toHaveLength(0);
      expect(body.summary).toEqual({});
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should handle database errors gracefully on data export', async () => {
      mockDb.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      }));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-error/data-export',
        headers: {
          'x-internal-service': 'api-gateway',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on consent lookup', async () => {
      mockDb.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockRejectedValue(new Error('Query timeout')),
      }));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-timeout/consent',
        headers: {
          'x-internal-service': 'notification-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });
});
