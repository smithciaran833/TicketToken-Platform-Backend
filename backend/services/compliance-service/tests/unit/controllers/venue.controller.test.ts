/**
 * Unit Tests for VenueController
 *
 * Tests venue verification operations: start, status, list all
 * Validates tenant isolation, audit logging, and error handling
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
import { VenueController } from '../../../src/controllers/venue.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_SECONDARY_TENANT_ID = TENANT_FIXTURES.secondary.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// MOCK DATA
// =============================================================================

const mockVerificationRecord = {
  id: 1,
  venue_id: TEST_VENUE_ID,
  ein: '12-3456789',
  business_name: 'Test Business LLC',
  status: 'pending',
  verification_id: 'ver_123456',
  tenant_id: TEST_TENANT_ID,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01')
};

const mockVerificationsList = [
  mockVerificationRecord,
  {
    id: 2,
    venue_id: 'venue-2',
    ein: '98-7654321',
    business_name: 'Another Business Inc',
    status: 'verified',
    verification_id: 'ver_789012',
    tenant_id: TEST_TENANT_ID,
    created_at: new Date('2025-01-02'),
    updated_at: new Date('2025-01-03')
  }
];

// =============================================================================
// TESTS
// =============================================================================

describe('VenueController', () => {
  let controller: VenueController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new VenueController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // startVerification Tests
  // ===========================================================================

  describe('startVerification', () => {
    const validBody = {
      venueId: TEST_VENUE_ID,
      ein: '12-3456789',
      businessName: 'Test Business LLC'
    };

    beforeEach(() => {
      mockRequest.body = validBody;
      mockDbQuery.mockResolvedValue({ rows: [mockVerificationRecord], rowCount: 1 });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful start', () => {
      it('should return success with verification data', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Verification started and saved to database',
          data: expect.objectContaining({
            id: mockVerificationRecord.id,
            venueId: TEST_VENUE_ID,
            status: 'pending',
            nextStep: 'upload_w9'
          })
        });
      });

      it('should include verificationId in response', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.verificationId).toMatch(/^ver_\d+$/);
      });

      it('should not set error status code on success', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should insert verification with tenant_id', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO venue_verifications'),
          expect.arrayContaining([TEST_TENANT_ID])
        );
      });

      it('should insert audit log with tenant_id', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_audit_log'),
          expect.arrayContaining([TEST_TENANT_ID])
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO venue_verifications'),
          expect.arrayContaining([TEST_SECONDARY_TENANT_ID])
        );
      });
    });

    // -------------------------------------------------------------------------
    // Database Operations
    // -------------------------------------------------------------------------

    describe('database operations', () => {
      it('should insert into venue_verifications with all fields', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO venue_verifications'),
          [
            TEST_VENUE_ID,
            '12-3456789',
            'Test Business LLC',
            'pending',
            expect.stringMatching(/^ver_\d+$/),
            TEST_TENANT_ID
          ]
        );
      });

      it('should return inserted record using RETURNING', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('RETURNING *'),
          expect.any(Array)
        );
      });

      it('should insert audit log with verification_started action', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("'verification_started'"),
          expect.any(Array)
        );
      });

      it('should store ein and businessName in audit metadata', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            JSON.stringify({ ein: '12-3456789', businessName: 'Test Business LLC' })
          ])
        );
      });

      it('should make exactly 2 database queries', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(2);
      });
    });

    // -------------------------------------------------------------------------
    // Verification ID Generation
    // -------------------------------------------------------------------------

    describe('verification ID generation', () => {
      it('should generate verification ID with ver_ prefix', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        const insertCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('INSERT INTO venue_verifications')
        );
        expect(insertCall![1][4]).toMatch(/^ver_\d+$/);
      });

      it('should generate unique verification IDs', async () => {
        const verificationIds: string[] = [];

        // Call twice with slight delay to get different timestamps
        await controller.startVerification(mockRequest as any, mockReply as any);
        const firstCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('INSERT INTO venue_verifications')
        );
        verificationIds.push(firstCall![1][4]);

        mockDbQuery.mockClear();

        // Small delay to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 5));
        await controller.startVerification(mockRequest as any, mockReply as any);
        const secondCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('INSERT INTO venue_verifications')
        );
        verificationIds.push(secondCall![1][4]);

        expect(verificationIds[0]).not.toBe(verificationIds[1]);
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log verification start with tenant and venue IDs', async () => {
        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_VENUE_ID)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on insert error', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('Insert failed'));

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Failed to start verification',
          details: 'Insert failed'
        });
      });

      it('should return 500 on audit log error', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationRecord] })
          .mockRejectedValueOnce(new Error('Audit log failed'));

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('Test error'));

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant required');
        });

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle missing ein', async () => {
        mockRequest.body = { venueId: TEST_VENUE_ID, businessName: 'Test' };

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([undefined])
        );
      });

      it('should handle missing businessName', async () => {
        mockRequest.body = { venueId: TEST_VENUE_ID, ein: '12-3456789' };

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([undefined])
        );
      });

      it('should handle special characters in businessName', async () => {
        mockRequest.body = {
          venueId: TEST_VENUE_ID,
          ein: '12-3456789',
          businessName: "O'Brien's & Sons, LLC \"Test\""
        };

        await controller.startVerification(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(["O'Brien's & Sons, LLC \"Test\""])
        );
      });
    });
  });

  // ===========================================================================
  // getVerificationStatus Tests
  // ===========================================================================

  describe('getVerificationStatus', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: TEST_VENUE_ID };
      mockDbQuery.mockResolvedValue({ rows: [mockVerificationRecord] });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful retrieval', () => {
      it('should return success with verification data', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: {
            venueId: TEST_VENUE_ID,
            verificationId: 'ver_123456',
            status: 'pending',
            businessName: 'Test Business LLC',
            ein: '12-3456789',
            createdAt: mockVerificationRecord.created_at,
            updatedAt: mockVerificationRecord.updated_at
          }
        });
      });

      it('should not set error status code on success', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Not Found
    // -------------------------------------------------------------------------

    describe('verification not found', () => {
      it('should return 404 when no verification exists', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'No verification found for this venue'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
      });

      it('should filter by tenant_id', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE venue_id = $1 AND tenant_id = $2'),
          [TEST_VENUE_ID, TEST_TENANT_ID]
        );
      });

      it('should not return data from other tenants', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [TEST_VENUE_ID, TEST_SECONDARY_TENANT_ID]
        );
      });
    });

    // -------------------------------------------------------------------------
    // Database Query
    // -------------------------------------------------------------------------

    describe('database query', () => {
      it('should query venue_verifications table', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM venue_verifications'),
          expect.any(Array)
        );
      });

      it('should order by created_at DESC', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC'),
          expect.any(Array)
        );
      });

      it('should limit to 1 result', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT 1'),
          expect.any(Array)
        );
      });

      it('should make exactly 1 database query', async () => {
        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockDbQuery.mockRejectedValue(new Error('Query failed'));

        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Failed to get verification status',
          details: 'Query failed'
        });
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Test error'));

        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Invalid tenant');
        });

        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle UUID venueId', async () => {
        const uuidVenueId = '550e8400-e29b-41d4-a716-446655440000';
        mockRequest.params = { venueId: uuidVenueId };

        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [uuidVenueId, TEST_TENANT_ID]
        );
      });

      it('should handle missing venueId in params', async () => {
        mockRequest.params = {};

        await controller.getVerificationStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [undefined, TEST_TENANT_ID]
        );
      });
    });
  });

  // ===========================================================================
  // getAllVerifications Tests
  // ===========================================================================

  describe('getAllVerifications', () => {
    beforeEach(() => {
      mockDbQuery.mockResolvedValue({ rows: mockVerificationsList });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful retrieval', () => {
      it('should return success with verifications array and count', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          count: 2,
          data: mockVerificationsList
        });
      });

      it('should not set error status code on success', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should return empty array when no verifications', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          count: 0,
          data: []
        });
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
      });

      it('should filter by tenant_id', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE tenant_id = $1'),
          [TEST_TENANT_ID]
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [TEST_SECONDARY_TENANT_ID]
        );
      });
    });

    // -------------------------------------------------------------------------
    // Database Query
    // -------------------------------------------------------------------------

    describe('database query', () => {
      it('should query venue_verifications table', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM venue_verifications'),
          expect.any(Array)
        );
      });

      it('should order by created_at DESC', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC'),
          expect.any(Array)
        );
      });

      it('should limit to 10 results', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT 10'),
          expect.any(Array)
        );
      });

      it('should make exactly 1 database query', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockDbQuery.mockRejectedValue(new Error('Query failed'));

        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Failed to get verifications',
          details: 'Query failed'
        });
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Test error'));

        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('No tenant');
        });

        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle large result set', async () => {
        const largeList = Array.from({ length: 10 }, (_, i) => ({
          ...mockVerificationRecord,
          id: i + 1,
          venue_id: `venue-${i + 1}`
        }));
        mockDbQuery.mockResolvedValue({ rows: largeList });

        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          count: 10,
          data: largeList
        });
      });

      it('should return all fields from database', async () => {
        await controller.getAllVerifications(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT *'),
          expect.any(Array)
        );
      });
    });
  });
});
