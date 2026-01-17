/**
 * Unit Tests for GDPR Routes
 *
 * Tests privacy export/deletion endpoints with BOLA protection
 * Validates authorization, validation, and RFC 7807 error responses
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply, createMockUser } from '../../setup';
import { TENANT_FIXTURES, USER_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockPrivacyExportService = {
  requestDataExport: jest.fn(),
  getExportStatus: jest.fn(),
  requestAccountDeletion: jest.fn(),
  getDeletionStatus: jest.fn()
};
jest.mock('../../../src/services/privacy-export.service', () => ({
  privacyExportService: mockPrivacyExportService
}));

const mockGdprController = {
  requestDeletion: jest.fn(),
  getDeletionStatus: jest.fn()
};
jest.mock('../../../src/controllers/gdpr.controller', () => ({
  GDPRController: jest.fn().mockImplementation(() => mockGdprController)
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

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validateBody: () => (req: any, reply: any, done: any) => done(),
  validateParams: () => (req: any, reply: any, done: any) => done()
}));

jest.mock('../../../src/validators/schemas', () => ({
  gdprExportSchema: {},
  gdprDeletionSchema: {},
  uuidSchema: {}
}));

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_USER_ID = USER_FIXTURES.regularUser.id;
const TEST_ADMIN_USER_ID = USER_FIXTURES.adminUser.id;
const OTHER_USER_ID = 'other-user-123';

// =============================================================================
// MOCK FASTIFY INSTANCE
// =============================================================================

function createMockFastify() {
  const routes: Record<string, { handler: Function; preHandler?: Function }> = {};
  
  return {
    post: jest.fn((path: string, opts: any, handler?: Function) => {
      const actualHandler = handler || opts;
      const preHandler = handler ? opts.preHandler : undefined;
      routes[`POST:${path}`] = { handler: actualHandler, preHandler };
    }),
    get: jest.fn((path: string, opts: any, handler?: Function) => {
      const actualHandler = handler || opts;
      const preHandler = handler ? opts.preHandler : undefined;
      routes[`GET:${path}`] = { handler: actualHandler, preHandler };
    }),
    routes,
    getHandler: (method: string, path: string) => routes[`${method}:${path}`]?.handler
  };
}

// =============================================================================
// IMPORT AND SETUP
// =============================================================================

import { gdprRoutes } from '../../../src/routes/gdpr.routes';

// =============================================================================
// TESTS
// =============================================================================

describe('GDPR Routes', () => {
  let mockFastify: ReturnType<typeof createMockFastify>;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFastify = createMockFastify();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequest.requestId = 'test-request-id';
    mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
    
    // Register routes
    await gdprRoutes(mockFastify as any);
  });

  // ===========================================================================
  // Route Registration Tests
  // ===========================================================================

  describe('route registration', () => {
    it('should register POST /privacy/export', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/privacy/export',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register GET /privacy/export/:requestId', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/privacy/export/:requestId',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register POST /privacy/deletion', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/privacy/deletion',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register GET /privacy/deletion/:requestId', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/privacy/deletion/:requestId',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register legacy GDPR routes', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/gdpr/request-data',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/gdpr/delete-data',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/gdpr/status/:requestId',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // POST /privacy/export Tests
  // ===========================================================================

  describe('POST /privacy/export', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/privacy/export');
      mockPrivacyExportService.requestDataExport.mockResolvedValue({
        requestId: 'export-req-123'
      });
    });

    // -------------------------------------------------------------------------
    // BOLA Protection Tests
    // -------------------------------------------------------------------------

    describe('BOLA protection', () => {
      it('should allow user to request export of their own data', async () => {
        mockRequest.body = { userId: TEST_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(202);
        expect(mockPrivacyExportService.requestDataExport).toHaveBeenCalled();
      });

      it('should block user from requesting export of another user data', async () => {
        mockRequest.body = { userId: OTHER_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(403);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You can only request export of your own data',
          instance: 'test-request-id'
        });
      });

      it('should allow admin to request export of any user data', async () => {
        mockRequest.body = { userId: OTHER_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: TEST_ADMIN_USER_ID, roles: ['admin'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(202);
        expect(mockPrivacyExportService.requestDataExport).toHaveBeenCalled();
      });

      it('should allow compliance_officer to request export of any user data', async () => {
        mockRequest.body = { userId: OTHER_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: 'officer-123', roles: ['compliance_officer'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(202);
      });

      it('should log BOLA attempt when blocked', async () => {
        mockRequest.body = { userId: OTHER_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            attempt: 'bola'
          }),
          expect.stringContaining('BOLA attempt blocked')
        );
      });

      it('should return 403 when user is not authenticated', async () => {
        mockRequest.body = { userId: TEST_USER_ID, format: 'json' };
        mockRequest.user = null;

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(403);
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful export request', () => {
      beforeEach(() => {
        mockRequest.body = { userId: TEST_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
      });

      it('should return 202 Accepted', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(202);
      });

      it('should return success with requestId', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            requestId: 'export-req-123',
            status: 'pending'
          })
        );
      });

      it('should include estimated completion time', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.estimatedCompletionTime).toBeDefined();
        expect(new Date(response.estimatedCompletionTime).getTime()).toBeGreaterThan(Date.now());
      });

      it('should include helpful message', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('data export request has been received')
          })
        );
      });

      it('should call privacyExportService with userId and reason', async () => {
        mockRequest.body = { userId: TEST_USER_ID, format: 'json', reason: 'Custom reason' };

        await handler(mockRequest, mockReply);

        expect(mockPrivacyExportService.requestDataExport).toHaveBeenCalledWith(
          TEST_USER_ID,
          'Custom reason'
        );
      });

      it('should use default reason when not provided', async () => {
        mockRequest.body = { userId: TEST_USER_ID, format: 'json' };

        await handler(mockRequest, mockReply);

        expect(mockPrivacyExportService.requestDataExport).toHaveBeenCalledWith(
          TEST_USER_ID,
          expect.stringContaining('GDPR Article 20')
        );
      });

      it('should log export request creation', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: TEST_USER_ID,
            exportRequestId: 'export-req-123'
          }),
          expect.stringContaining('export request created')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on service error', async () => {
        mockRequest.body = { userId: TEST_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.requestDataExport.mockRejectedValue(new Error('Service error'));

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to process export request',
          instance: 'test-request-id'
        });
      });

      it('should log error on failure', async () => {
        mockRequest.body = { userId: TEST_USER_ID, format: 'json' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.requestDataExport.mockRejectedValue(new Error('Test error'));

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
  // GET /privacy/export/:requestId Tests
  // ===========================================================================

  describe('GET /privacy/export/:requestId', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/privacy/export/:requestId');
    });

    // -------------------------------------------------------------------------
    // BOLA Protection Tests
    // -------------------------------------------------------------------------

    describe('BOLA protection', () => {
      beforeEach(() => {
        mockPrivacyExportService.getExportStatus.mockResolvedValue({
          userId: TEST_USER_ID,
          status: 'pending',
          createdAt: new Date()
        });
      });

      it('should allow user to check status of their own export', async () => {
        mockRequest.params = { requestId: 'export-123' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should block user from checking status of another user export', async () => {
        mockRequest.params = { requestId: 'export-123' };
        mockRequest.user = createMockUser({ id: OTHER_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(403);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You can only check status of your own export requests',
          instance: 'test-request-id'
        });
      });

      it('should allow admin to check status of any export', async () => {
        mockRequest.params = { requestId: 'export-123' };
        mockRequest.user = createMockUser({ id: TEST_ADMIN_USER_ID, roles: ['admin'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });
    });

    // -------------------------------------------------------------------------
    // Not Found
    // -------------------------------------------------------------------------

    describe('not found', () => {
      it('should return 404 when export request not found', async () => {
        mockRequest.params = { requestId: 'non-existent' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.getExportStatus.mockResolvedValue(null);

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Export request not found',
          instance: 'test-request-id'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful status check', () => {
      it('should return status information', async () => {
        mockRequest.params = { requestId: 'export-123' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.getExportStatus.mockResolvedValue({
          userId: TEST_USER_ID,
          status: 'completed',
          createdAt: new Date('2025-01-01'),
          completedAt: new Date('2025-01-02'),
          downloadUrl: 'https://example.com/download',
          expiresAt: new Date('2025-01-10')
        });

        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            requestId: 'export-123',
            status: 'completed',
            userId: TEST_USER_ID,
            downloadUrl: 'https://example.com/download'
          })
        );
      });

      it('should not include downloadUrl when status is not completed', async () => {
        mockRequest.params = { requestId: 'export-123' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.getExportStatus.mockResolvedValue({
          userId: TEST_USER_ID,
          status: 'pending',
          createdAt: new Date('2025-01-01'),
          downloadUrl: 'https://example.com/download'
        });

        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.downloadUrl).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // POST /privacy/deletion Tests
  // ===========================================================================

  describe('POST /privacy/deletion', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/privacy/deletion');
      mockPrivacyExportService.requestAccountDeletion.mockResolvedValue({
        requestId: 'deletion-req-123'
      });
    });

    // -------------------------------------------------------------------------
    // BOLA Protection Tests
    // -------------------------------------------------------------------------

    describe('BOLA protection', () => {
      it('should allow user to request deletion of their own data', async () => {
        mockRequest.body = { userId: TEST_USER_ID, confirmation: true };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(202);
      });

      it('should block user from requesting deletion of another user data', async () => {
        mockRequest.body = { userId: OTHER_USER_ID, confirmation: true };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(403);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You can only request deletion of your own data',
          instance: 'test-request-id'
        });
      });

      it('should allow admin to request deletion of any user data', async () => {
        mockRequest.body = { userId: OTHER_USER_ID, confirmation: true };
        mockRequest.user = createMockUser({ id: TEST_ADMIN_USER_ID, roles: ['admin'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(202);
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful deletion request', () => {
      beforeEach(() => {
        mockRequest.body = { userId: TEST_USER_ID, confirmation: true };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
      });

      it('should return 202 Accepted', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(202);
      });

      it('should return success with requestId', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            requestId: 'deletion-req-123',
            status: 'pending'
          })
        );
      });

      it('should include retention period of 30 days', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            retentionPeriod: '30 days'
          })
        );
      });

      it('should include helpful message about GDPR requirements', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('30 days')
          })
        );
      });

      it('should call privacyExportService with userId and reason', async () => {
        mockRequest.body = { userId: TEST_USER_ID, confirmation: true, reason: 'Custom reason' };

        await handler(mockRequest, mockReply);

        expect(mockPrivacyExportService.requestAccountDeletion).toHaveBeenCalledWith(
          TEST_USER_ID,
          'Custom reason'
        );
      });

      it('should use default reason when not provided', async () => {
        await handler(mockRequest, mockReply);

        expect(mockPrivacyExportService.requestAccountDeletion).toHaveBeenCalledWith(
          TEST_USER_ID,
          expect.stringContaining('GDPR Article 17')
        );
      });

      it('should log deletion request creation', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: TEST_USER_ID,
            deletionRequestId: 'deletion-req-123'
          }),
          expect.stringContaining('deletion request created')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on service error', async () => {
        mockRequest.body = { userId: TEST_USER_ID, confirmation: true };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.requestAccountDeletion.mockRejectedValue(new Error('Service error'));

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to process deletion request',
          instance: 'test-request-id'
        });
      });
    });
  });

  // ===========================================================================
  // GET /privacy/deletion/:requestId Tests
  // ===========================================================================

  describe('GET /privacy/deletion/:requestId', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/privacy/deletion/:requestId');
    });

    // -------------------------------------------------------------------------
    // BOLA Protection Tests
    // -------------------------------------------------------------------------

    describe('BOLA protection', () => {
      beforeEach(() => {
        mockPrivacyExportService.getDeletionStatus.mockResolvedValue({
          userId: TEST_USER_ID,
          status: 'pending',
          createdAt: new Date()
        });
      });

      it('should allow user to check status of their own deletion', async () => {
        mockRequest.params = { requestId: 'deletion-123' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should block user from checking status of another user deletion', async () => {
        mockRequest.params = { requestId: 'deletion-123' };
        mockRequest.user = createMockUser({ id: OTHER_USER_ID, roles: ['user'] });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(403);
      });
    });

    // -------------------------------------------------------------------------
    // Not Found
    // -------------------------------------------------------------------------

    describe('not found', () => {
      it('should return 404 when deletion request not found', async () => {
        mockRequest.params = { requestId: 'non-existent' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.getDeletionStatus.mockResolvedValue(null);

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Deletion request not found',
          instance: 'test-request-id'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful status check', () => {
      it('should return deletion status information', async () => {
        mockRequest.params = { requestId: 'deletion-123' };
        mockRequest.user = createMockUser({ id: TEST_USER_ID, roles: ['user'] });
        mockPrivacyExportService.getDeletionStatus.mockResolvedValue({
          userId: TEST_USER_ID,
          status: 'pending',
          createdAt: new Date('2025-01-01'),
          scheduledDeletionDate: new Date('2025-01-31')
        });

        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            requestId: 'deletion-123',
            status: 'pending',
            userId: TEST_USER_ID,
            scheduledDeletionDate: expect.any(Date)
          })
        );
      });
    });
  });
});
