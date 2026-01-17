/**
 * Unit Tests for AdminController
 *
 * Tests admin review operations: pending reviews, approve/reject verification
 * Validates tenant isolation, audit logging, notifications, and error handling
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

const mockNotificationService = {
  notifyVerificationStatus: jest.fn()
};
jest.mock('../../../src/services/notification.service', () => ({
  notificationService: mockNotificationService
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

const mockRequireTenantId = jest.fn();
jest.mock('../../../src/middleware/tenant.middleware', () => ({
  requireTenantId: mockRequireTenantId
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

// Import module under test AFTER mocks
import { AdminController } from '../../../src/controllers/admin.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_SECONDARY_TENANT_ID = TENANT_FIXTURES.secondary.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// MOCK DATA
// =============================================================================

const mockPendingVerifications = [
  {
    id: 1,
    venue_id: TEST_VENUE_ID,
    status: 'pending',
    risk_score: 45,
    factors: ['missing_ein'],
    recommendation: 'REVIEW',
    created_at: new Date('2025-01-01')
  },
  {
    id: 2,
    venue_id: 'venue-2',
    status: 'verified',
    manual_review_required: true,
    risk_score: 80,
    factors: ['high_volume'],
    recommendation: 'MANUAL_REVIEW',
    created_at: new Date('2025-01-02')
  }
];

const mockPendingFlags = [
  {
    id: 1,
    venue_id: TEST_VENUE_ID,
    flag_type: 'suspicious_activity',
    resolved: false,
    created_at: new Date('2025-01-01')
  }
];

// =============================================================================
// TESTS
// =============================================================================

describe('AdminController', () => {
  let controller: AdminController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // getPendingReviews Tests
  // ===========================================================================

  describe('getPendingReviews', () => {
    beforeEach(() => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: mockPendingVerifications })
        .mockResolvedValueOnce({ rows: mockPendingFlags });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful retrieval', () => {
      it('should return success with verifications and flags', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: {
            verifications: mockPendingVerifications,
            flags: mockPendingFlags,
            totalPending: 3
          }
        });
      });

      it('should not set error status code on success', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should calculate totalPending correctly', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.totalPending).toBe(
          mockPendingVerifications.length + mockPendingFlags.length
        );
      });

      it('should return empty arrays when no pending items', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: {
            verifications: [],
            flags: [],
            totalPending: 0
          }
        });
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should filter verifications query by tenant_id', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE v.tenant_id = $1'),
          [TEST_TENANT_ID]
        );
      });

      it('should filter flags query by tenant_id', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE tenant_id = $1 AND resolved = false'),
          [TEST_TENANT_ID]
        );
      });

      it('should join risk_assessments with tenant filter', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('r.tenant_id = $1'),
          expect.any(Array)
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [TEST_SECONDARY_TENANT_ID]
        );
      });
    });

    // -------------------------------------------------------------------------
    // Database Queries
    // -------------------------------------------------------------------------

    describe('database queries', () => {
      it('should query venue_verifications with risk_assessments join', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM venue_verifications v'),
          expect.any(Array)
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('LEFT JOIN risk_assessments r'),
          expect.any(Array)
        );
      });

      it('should filter for pending or manual_review_required', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'pending' OR v.manual_review_required = true"),
          expect.any(Array)
        );
      });

      it('should query risk_flags for unresolved flags', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM risk_flags'),
          expect.any(Array)
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('resolved = false'),
          expect.any(Array)
        );
      });

      it('should order both queries by created_at DESC', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        const calls = mockDbQuery.mock.calls;
        expect(calls[0][0]).toContain('ORDER BY v.created_at DESC');
        expect(calls[1][0]).toContain('ORDER BY created_at DESC');
      });

      it('should make exactly 2 database queries', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(2);
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log retrieval with count and tenant ID', async () => {
        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('2 pending reviews')
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on verifications query error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Query failed'));

        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Query failed'
        });
      });

      it('should return 500 on flags query error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [] })
          .mockRejectedValueOnce(new Error('Flags query failed'));

        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Test error'));

        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant required');
        });

        await controller.getPendingReviews(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });

  // ===========================================================================
  // approveVerification Tests
  // ===========================================================================

  describe('approveVerification', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: TEST_VENUE_ID };
      mockRequest.body = { notes: 'Approved after manual review' };
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      mockNotificationService.notifyVerificationStatus.mockResolvedValue(undefined);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful approval', () => {
      it('should return success with venueId', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Venue verification approved',
          data: { venueId: TEST_VENUE_ID }
        });
      });

      it('should not set error status code on success', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
      });

      it('should update with tenant_id filter', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE venue_id = $1 AND tenant_id = $3'),
          [TEST_VENUE_ID, 'Approved after manual review', TEST_TENANT_ID]
        );
      });

      it('should log audit with tenant_id', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_audit_log'),
          expect.arrayContaining([TEST_TENANT_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Database Operations
    // -------------------------------------------------------------------------

    describe('database operations', () => {
      it('should update venue_verifications status to verified', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("SET status = 'verified'"),
          expect.any(Array)
        );
      });

      it('should set manual_review_required to false', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('manual_review_required = false'),
          expect.any(Array)
        );
      });

      it('should store manual_review_notes', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('manual_review_notes = $2'),
          expect.arrayContaining(['Approved after manual review'])
        );
      });

      it('should insert audit log with verification_approved action', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("'verification_approved'"),
          expect.any(Array)
        );
      });

      it('should store notes in audit metadata as JSON', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([JSON.stringify({ notes: 'Approved after manual review' })])
        );
      });

      it('should make exactly 2 database queries', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(2);
      });
    });

    // -------------------------------------------------------------------------
    // Notification
    // -------------------------------------------------------------------------

    describe('notification', () => {
      it('should notify venue of approval', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockNotificationService.notifyVerificationStatus).toHaveBeenCalledWith(
          TEST_VENUE_ID,
          'approved'
        );
      });

      it('should call notification service exactly once', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockNotificationService.notifyVerificationStatus).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log approval with venue and tenant IDs', async () => {
        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_VENUE_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on update error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Update failed'));

        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Update failed'
        });
      });

      it('should return 500 on audit log error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [] })
          .mockRejectedValueOnce(new Error('Audit log failed'));

        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });

      it('should return 500 on notification error', async () => {
        mockNotificationService.notifyVerificationStatus.mockRejectedValue(
          new Error('Notification failed')
        );

        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Test error'));

        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle empty notes', async () => {
        mockRequest.body = { notes: '' };

        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([''])
        );
      });

      it('should handle undefined notes', async () => {
        mockRequest.body = {};

        await controller.approveVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([undefined])
        );
      });
    });
  });

  // ===========================================================================
  // rejectVerification Tests
  // ===========================================================================

  describe('rejectVerification', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: TEST_VENUE_ID };
      mockRequest.body = {
        reason: 'Invalid documentation',
        notes: 'EIN does not match business name'
      };
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      mockNotificationService.notifyVerificationStatus.mockResolvedValue(undefined);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful rejection', () => {
      it('should return success with venueId and reason', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Venue verification rejected',
          data: {
            venueId: TEST_VENUE_ID,
            reason: 'Invalid documentation'
          }
        });
      });

      it('should not set error status code on success', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
      });

      it('should update with tenant_id filter', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE venue_id = $1 AND tenant_id = $3'),
          expect.arrayContaining([TEST_TENANT_ID])
        );
      });

      it('should log audit with tenant_id', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_audit_log'),
          expect.arrayContaining([TEST_TENANT_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Database Operations
    // -------------------------------------------------------------------------

    describe('database operations', () => {
      it('should update venue_verifications status to rejected', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("SET status = 'rejected'"),
          expect.any(Array)
        );
      });

      it('should set manual_review_required to false', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('manual_review_required = false'),
          expect.any(Array)
        );
      });

      it('should insert audit log with verification_rejected action', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("'verification_rejected'"),
          expect.any(Array)
        );
      });

      it('should store reason and notes in audit metadata', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            JSON.stringify({
              reason: 'Invalid documentation',
              notes: 'EIN does not match business name'
            })
          ])
        );
      });

      it('should make exactly 2 database queries', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(2);
      });
    });

    // -------------------------------------------------------------------------
    // Notification
    // -------------------------------------------------------------------------

    describe('notification', () => {
      it('should notify venue of rejection', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockNotificationService.notifyVerificationStatus).toHaveBeenCalledWith(
          TEST_VENUE_ID,
          'rejected'
        );
      });

      it('should call notification service exactly once', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockNotificationService.notifyVerificationStatus).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log rejection with venue, tenant, and reason', async () => {
        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_VENUE_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Invalid documentation')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on update error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Update failed'));

        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Update failed'
        });
      });

      it('should return 500 on notification error', async () => {
        mockNotificationService.notifyVerificationStatus.mockRejectedValue(
          new Error('Notification failed')
        );

        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Test error'));

        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle missing reason', async () => {
        mockRequest.body = { notes: 'Some notes' };

        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Venue verification rejected',
          data: {
            venueId: TEST_VENUE_ID,
            reason: undefined
          }
        });
      });

      it('should handle empty body', async () => {
        mockRequest.body = {};

        await controller.rejectVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalled();
      });
    });
  });
});
