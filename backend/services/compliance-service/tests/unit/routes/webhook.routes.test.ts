/**
 * Unit Tests for Webhook Routes
 *
 * Tests webhook handlers for tax-update, kyc-update, risk-alert, ofac-result
 * Validates business logic, DB operations, and error handling
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

const mockWebhookAuth = jest.fn();
jest.mock('../../../src/middleware/auth.middleware', () => ({
  webhookAuth: () => mockWebhookAuth
}));

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// MOCK FASTIFY INSTANCE
// =============================================================================

function createMockFastify() {
  const routes: Record<string, { handler: Function; onRequest?: Function }> = {};

  return {
    post: jest.fn((path: string, opts: any, handler?: Function) => {
      const actualHandler = handler || opts;
      const onRequest = handler ? opts.onRequest : undefined;
      routes[`POST:${path}`] = { handler: actualHandler, onRequest };
    }),
    get: jest.fn((path: string, opts: any, handler?: Function) => {
      const actualHandler = handler || opts;
      const onRequest = handler ? opts.onRequest : undefined;
      routes[`GET:${path}`] = { handler: actualHandler, onRequest };
    }),
    routes,
    getHandler: (method: string, path: string) => routes[`${method}:${path}`]?.handler,
    getOnRequest: (method: string, path: string) => routes[`${method}:${path}`]?.onRequest
  };
}

// =============================================================================
// IMPORT AND SETUP
// =============================================================================

import { webhookRoutes } from '../../../src/routes/webhook.routes';

// =============================================================================
// TESTS
// =============================================================================

describe('Webhook Routes', () => {
  let mockFastify: ReturnType<typeof createMockFastify>;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFastify = createMockFastify();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequest.tenantId = TEST_TENANT_ID;
    mockRequest.requestId = 'test-request-id';
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    // Register routes
    await webhookRoutes(mockFastify as any);
  });

  // ===========================================================================
  // Route Registration Tests
  // ===========================================================================

  describe('route registration', () => {
    it('should register POST /webhooks/compliance/tax-update', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/webhooks/compliance/tax-update',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register POST /webhooks/compliance/kyc-update', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/webhooks/compliance/kyc-update',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register POST /webhooks/compliance/risk-alert', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/webhooks/compliance/risk-alert',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register POST /webhooks/compliance/ofac-result', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/webhooks/compliance/ofac-result',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should apply webhookAuth to all routes', async () => {
      const taxUpdateRoute = mockFastify.getOnRequest('POST', '/webhooks/compliance/tax-update');
      expect(taxUpdateRoute).toBeDefined();
    });
  });

  // ===========================================================================
  // Tax Update Webhook Tests
  // ===========================================================================

  describe('POST /webhooks/compliance/tax-update', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/webhooks/compliance/tax-update');
    });

    // -------------------------------------------------------------------------
    // Validation Tests
    // -------------------------------------------------------------------------

    describe('validation', () => {
      it('should return 400 when venueId is missing', async () => {
        mockRequest.body = { taxType: 'sales', status: 'valid' };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Missing required fields: venueId, taxType, status',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      });

      it('should return 400 when taxType is missing', async () => {
        mockRequest.body = { venueId: TEST_VENUE_ID, status: 'valid' };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
      });

      it('should return 400 when status is missing', async () => {
        mockRequest.body = { venueId: TEST_VENUE_ID, taxType: 'sales' };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful processing', () => {
      const validPayload = {
        venueId: TEST_VENUE_ID,
        taxId: 'tax-123',
        taxType: 'sales',
        status: 'valid',
        effectiveDate: '2025-01-01',
        expirationDate: '2026-01-01',
        jurisdiction: 'NY',
        taxRate: 8.875
      };

      beforeEach(() => {
        mockRequest.body = validPayload;
      });

      it('should return success response', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        });
      });

      it('should insert/update tax record with upsert', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tax_records'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID, 'tax-123', 'sales', 'valid'])
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT'),
          expect.any(Array)
        );
      });

      it('should set tax_verified to true when status is valid', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE venue_verifications'),
          expect.arrayContaining([TEST_VENUE_ID, TEST_TENANT_ID])
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('tax_verified = true'),
          expect.any(Array)
        );
      });

      it('should log successful processing', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            venueId: TEST_VENUE_ID,
            taxType: 'sales',
            status: 'valid'
          }),
          expect.stringContaining('successfully')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Invalid/Expired Status
    // -------------------------------------------------------------------------

    describe('invalid/expired status', () => {
      it('should set tax_verified to false when status is invalid', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          taxType: 'sales',
          status: 'invalid'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('tax_verified = false'),
          expect.any(Array)
        );
      });

      it('should set tax_verified to false when status is expired', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          taxType: 'sales',
          status: 'expired'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('tax_verified = false'),
          expect.any(Array)
        );
      });

      it('should create audit log for invalid/expired status', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          taxType: 'sales',
          status: 'invalid'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_audit_log'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          taxType: 'sales',
          status: 'valid'
        };
        mockDbQuery.mockRejectedValueOnce(new Error('Database error'));

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Webhook processing failed',
          type: 'urn:error:compliance-service:webhook-error',
          status: 500
        });
      });

      it('should log error on failure', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          taxType: 'sales',
          status: 'valid'
        };
        mockDbQuery.mockRejectedValueOnce(new Error('Test error'));

        await handler(mockRequest, mockReply);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Test error'
          }),
          expect.any(String)
        );
      });
    });
  });

  // ===========================================================================
  // KYC Update Webhook Tests
  // ===========================================================================

  describe('POST /webhooks/compliance/kyc-update', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/webhooks/compliance/kyc-update');
    });

    // -------------------------------------------------------------------------
    // Validation Tests
    // -------------------------------------------------------------------------

    describe('validation', () => {
      it('should return 400 when venueId is missing', async () => {
        mockRequest.body = { verificationType: 'identity', status: 'approved' };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Missing required fields: venueId, verificationType, status',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      });

      it('should return 400 when verificationType is missing', async () => {
        mockRequest.body = { venueId: TEST_VENUE_ID, status: 'approved' };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
      });

      it('should return 400 when status is missing', async () => {
        mockRequest.body = { venueId: TEST_VENUE_ID, verificationType: 'identity' };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful processing', () => {
      const validPayload = {
        venueId: TEST_VENUE_ID,
        userId: 'user-123',
        verificationType: 'identity',
        status: 'approved',
        verificationId: 'ver-123',
        riskLevel: 'low'
      };

      beforeEach(() => {
        mockRequest.body = validPayload;
      });

      it('should return success response', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        });
      });

      it('should insert/update kyc verification record', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO kyc_verifications'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID, 'user-123', 'identity', 'approved'])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Dynamic Field Updates
    // -------------------------------------------------------------------------

    describe('dynamic field updates based on verificationType', () => {
      it('should update identity_verified for identity verification', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'identity',
          status: 'approved'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('identity_verified = true'),
          expect.any(Array)
        );
      });

      it('should update business_verified for business verification', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'business',
          status: 'approved'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('business_verified = true'),
          expect.any(Array)
        );
      });

      it('should update address_verified for address verification', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'address',
          status: 'approved'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('address_verified = true'),
          expect.any(Array)
        );
      });

      it('should update document_verified for document verification', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'document',
          status: 'approved'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('document_verified = true'),
          expect.any(Array)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Rejected/Expired Status
    // -------------------------------------------------------------------------

    describe('rejected/expired status', () => {
      it('should create compliance notification when status is rejected', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'identity',
          status: 'rejected',
          rejectionReason: 'Invalid document'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_notifications'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });

      it('should create compliance notification when status is expired', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'identity',
          status: 'expired'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_notifications'),
          expect.any(Array)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Risk Assessment Update
    // -------------------------------------------------------------------------

    describe('risk assessment update', () => {
      it('should update risk assessment when riskLevel is provided', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'identity',
          status: 'approved',
          riskLevel: 'high'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_assessments'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID, 'high'])
        );
      });

      it('should use escalation logic for risk levels', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'identity',
          status: 'approved',
          riskLevel: 'medium'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("WHEN EXCLUDED.risk_level = 'high' THEN 'high'"),
          expect.any(Array)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Audit Logging
    // -------------------------------------------------------------------------

    describe('audit logging', () => {
      it('should create audit log entry', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'identity',
          status: 'approved'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_audit_log'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          verificationType: 'identity',
          status: 'approved'
        };
        mockDbQuery.mockRejectedValueOnce(new Error('Database error'));

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });

  // ===========================================================================
  // Risk Alert Webhook Tests
  // ===========================================================================

  describe('POST /webhooks/compliance/risk-alert', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/webhooks/compliance/risk-alert');
    });

    // -------------------------------------------------------------------------
    // Validation Tests
    // -------------------------------------------------------------------------

    describe('validation', () => {
      it('should return 400 when alertId is missing', async () => {
        mockRequest.body = {
          alertType: 'fraud',
          severity: 'high',
          entityType: 'venue',
          entityId: TEST_VENUE_ID
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Missing required fields: alertId, alertType, severity, entityType, entityId',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      });

      it('should return 400 when severity is missing', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'fraud',
          entityType: 'venue',
          entityId: TEST_VENUE_ID
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful processing', () => {
      const validPayload = {
        alertId: 'alert-123',
        alertType: 'fraud',
        severity: 'medium',
        entityType: 'venue',
        entityId: TEST_VENUE_ID,
        description: 'Suspicious activity detected',
        riskScore: 75,
        indicators: ['rapid_transactions', 'unusual_pattern']
      };

      beforeEach(() => {
        mockRequest.body = validPayload;
      });

      it('should return success response', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        });
      });

      it('should insert/update risk alert record', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_alerts'),
          expect.arrayContaining([TEST_TENANT_ID, 'alert-123', 'fraud', 'medium'])
        );
      });

      it('should update risk assessment', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_assessments'),
          expect.arrayContaining([TEST_TENANT_ID, 'venue', TEST_VENUE_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Severity-based Escalation
    // -------------------------------------------------------------------------

    describe('severity-based escalation', () => {
      it('should create compliance notification for high severity', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'fraud',
          severity: 'high',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'High risk activity'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_notifications'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });

      it('should create compliance notification for critical severity', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'sanctions',
          severity: 'critical',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Critical risk detected'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_notifications'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });

      it('should create urgent notification for critical severity', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'sanctions',
          severity: 'critical',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Critical risk detected'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO urgent_notifications'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });

      it('should log warning for critical alerts', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'sanctions',
          severity: 'critical',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Critical risk detected'
        };

        await handler(mockRequest, mockReply);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            alertId: 'alert-123',
            severity: 'critical'
          }),
          expect.stringContaining('CRITICAL')
        );
      });

      it('should not create notifications for low severity', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'velocity',
          severity: 'low',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Minor velocity alert'
        };

        await handler(mockRequest, mockReply);

        const notificationCalls = mockDbQuery.mock.calls.filter(
          call => call[0].includes('INSERT INTO compliance_notifications')
        );
        expect(notificationCalls).toHaveLength(0);
      });

      it('should not create notifications for medium severity', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'velocity',
          severity: 'medium',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Medium velocity alert'
        };

        await handler(mockRequest, mockReply);

        const notificationCalls = mockDbQuery.mock.calls.filter(
          call => call[0].includes('INSERT INTO compliance_notifications')
        );
        expect(notificationCalls).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // Risk Level Mapping
    // -------------------------------------------------------------------------

    describe('risk level mapping', () => {
      it('should map critical severity to critical risk level', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'fraud',
          severity: 'critical',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Test'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_assessments'),
          expect.arrayContaining(['critical'])
        );
      });

      it('should map high severity to high risk level', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'fraud',
          severity: 'high',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Test'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_assessments'),
          expect.arrayContaining(['high'])
        );
      });

      it('should map low severity to low risk level', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'fraud',
          severity: 'low',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Test'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_assessments'),
          expect.arrayContaining(['low'])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Audit Logging
    // -------------------------------------------------------------------------

    describe('audit logging', () => {
      it('should create audit log entry', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'fraud',
          severity: 'medium',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Test'
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_audit_log'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockRequest.body = {
          alertId: 'alert-123',
          alertType: 'fraud',
          severity: 'medium',
          entityType: 'venue',
          entityId: TEST_VENUE_ID,
          description: 'Test'
        };
        mockDbQuery.mockRejectedValueOnce(new Error('Database error'));

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });

  // ===========================================================================
  // OFAC Result Webhook Tests
  // ===========================================================================

  describe('POST /webhooks/compliance/ofac-result', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/webhooks/compliance/ofac-result');
    });

    // -------------------------------------------------------------------------
    // Validation Tests
    // -------------------------------------------------------------------------

    describe('validation', () => {
      it('should return 400 when screeningId is missing', async () => {
        mockRequest.body = {
          entityType: 'business',
          entityId: TEST_VENUE_ID,
          entityName: 'Test Business',
          status: 'clear'
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Missing required fields: screeningId, entityType, entityId, entityName, status',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      });

      it('should return 400 when entityName is missing', async () => {
        mockRequest.body = {
          screeningId: 'screen-123',
          entityType: 'business',
          entityId: TEST_VENUE_ID,
          status: 'clear'
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
      });
    });

    // -------------------------------------------------------------------------
    // Clear Status
    // -------------------------------------------------------------------------

    describe('clear status', () => {
      const clearPayload = {
        screeningId: 'screen-123',
        entityType: 'business',
        entityId: TEST_VENUE_ID,
        entityName: 'Test Business LLC',
        status: 'clear',
        reviewRequired: false
      };

      beforeEach(() => {
        mockRequest.body = clearPayload;
      });

      it('should return success response', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        });
      });

      it('should insert OFAC screening record', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO ofac_screenings'),
          expect.arrayContaining([TEST_TENANT_ID, 'screen-123', 'business', TEST_VENUE_ID, 'Test Business LLC', 'clear'])
        );
      });

      it('should set ofac_cleared to true', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ofac_cleared = true'),
          expect.arrayContaining([TEST_VENUE_ID, TEST_TENANT_ID])
        );
      });

      it('should update ofac_last_check timestamp', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ofac_last_check = NOW()'),
          expect.any(Array)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Potential Match Status
    // -------------------------------------------------------------------------

    describe('potential_match status', () => {
      const matchPayload = {
        screeningId: 'screen-123',
        entityType: 'business',
        entityId: TEST_VENUE_ID,
        entityName: 'Test Business LLC',
        status: 'potential_match',
        matchScore: 85,
        matchedList: 'SDN',
        matchedEntry: 'Some Entity',
        reviewRequired: true
      };

      beforeEach(() => {
        mockRequest.body = matchPayload;
      });

      it('should set ofac_cleared to false', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ofac_cleared = false'),
          expect.any(Array)
        );
      });

      it('should set ofac_review_required to true', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ofac_review_required = true'),
          expect.any(Array)
        );
      });

      it('should create high severity compliance notification', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_notifications'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });

      it('should update risk assessment to high', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_assessments'),
          expect.arrayContaining([TEST_TENANT_ID, 'venue', TEST_VENUE_ID, 'high'])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Confirmed Match Status
    // -------------------------------------------------------------------------

    describe('confirmed_match status', () => {
      const confirmedMatchPayload = {
        screeningId: 'screen-123',
        entityType: 'business',
        entityId: TEST_VENUE_ID,
        entityName: 'Sanctioned Entity LLC',
        status: 'confirmed_match',
        matchScore: 98,
        matchedList: 'SDN',
        matchedEntry: 'SANCTIONED ENTITY',
        reviewRequired: false
      };

      beforeEach(() => {
        mockRequest.body = confirmedMatchPayload;
      });

      it('should create critical severity compliance notification', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_notifications'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });

      it('should update risk assessment to critical', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO risk_assessments'),
          expect.arrayContaining(['critical'])
        );
      });

      it('should suspend venue', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE venues"),
          expect.arrayContaining([TEST_VENUE_ID, TEST_TENANT_ID])
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'suspended'"),
          expect.any(Array)
        );
      });

      it('should set suspended_reason to OFAC match', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("suspended_reason = 'OFAC match confirmed'"),
          expect.any(Array)
        );
      });

      it('should log error for confirmed match', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            entityId: TEST_VENUE_ID,
            entityName: 'Sanctioned Entity LLC'
          }),
          expect.stringContaining('OFAC CONFIRMED MATCH')
        );
      });
    });

    // -------------------------------------------------------------------------
    // False Positive Status
    // -------------------------------------------------------------------------

    describe('false_positive status', () => {
      const falsePositivePayload = {
        screeningId: 'screen-123',
        entityType: 'business',
        entityId: TEST_VENUE_ID,
        entityName: 'Test Business LLC',
        status: 'false_positive',
        reviewRequired: false
      };

      beforeEach(() => {
        mockRequest.body = falsePositivePayload;
      });

      it('should set ofac_cleared to true', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ofac_cleared = true'),
          expect.any(Array)
        );
      });

      it('should set ofac_review_required to false', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ofac_review_required = false'),
          expect.any(Array)
        );
      });

      it('should resolve pending OFAC notifications', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE compliance_notifications'),
          expect.arrayContaining([TEST_VENUE_ID, TEST_TENANT_ID])
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'resolved'"),
          expect.any(Array)
        );
      });

      it('should set resolution_notes for false positive', async () => {
        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("resolution_notes = 'False positive confirmed'"),
          expect.any(Array)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Audit Logging
    // -------------------------------------------------------------------------

    describe('audit logging', () => {
      it('should create audit log entry', async () => {
        mockRequest.body = {
          screeningId: 'screen-123',
          entityType: 'business',
          entityId: TEST_VENUE_ID,
          entityName: 'Test Business',
          status: 'clear',
          reviewRequired: false
        };

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_audit_log'),
          expect.arrayContaining([TEST_TENANT_ID, TEST_VENUE_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockRequest.body = {
          screeningId: 'screen-123',
          entityType: 'business',
          entityId: TEST_VENUE_ID,
          entityName: 'Test Business',
          status: 'clear',
          reviewRequired: false
        };
        mockDbQuery.mockRejectedValueOnce(new Error('Database error'));

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });
});
