/**
 * Unit Tests for DashboardController
 *
 * Tests compliance dashboard overview aggregation
 * Validates tenant isolation, data aggregation, and error handling
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES } from '../../fixtures';

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
import { DashboardController } from '../../../src/controllers/dashboard.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_SECONDARY_TENANT_ID = TENANT_FIXTURES.secondary.id;
const CURRENT_YEAR = new Date().getFullYear();

// =============================================================================
// MOCK DATA
// =============================================================================

const mockVerificationStats = {
  total: '100',
  verified: '75',
  pending: '20',
  rejected: '5'
};

const mockTaxStats = {
  venues_with_sales: '50',
  total_sales: '1500000',
  venues_over_threshold: '30'
};

const mockOfacStats = {
  total_checks: '500',
  matches_found: '3'
};

const mockRecentActivity = [
  {
    id: 1,
    action: 'verification_approved',
    created_at: new Date('2025-01-15')
  },
  {
    id: 2,
    action: 'ofac_check',
    created_at: new Date('2025-01-14')
  }
];

// =============================================================================
// TESTS
// =============================================================================

describe('DashboardController', () => {
  let controller: DashboardController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DashboardController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);

    // Setup default mock responses for all 4 queries
    mockDbQuery
      .mockResolvedValueOnce({ rows: [mockVerificationStats] })  // verifications
      .mockResolvedValueOnce({ rows: [mockTaxStats] })           // tax stats
      .mockResolvedValueOnce({ rows: [mockOfacStats] })          // ofac stats
      .mockResolvedValueOnce({ rows: mockRecentActivity });      // recent activity
  });

  // ===========================================================================
  // getComplianceOverview Tests
  // ===========================================================================

  describe('getComplianceOverview', () => {

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful retrieval', () => {
      it('should return success with all dashboard data', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            overview: expect.any(Object),
            verifications: expect.any(Object),
            taxReporting: expect.any(Object),
            ofacScreening: expect.any(Object),
            recentActivity: expect.any(Array)
          })
        });
      });

      it('should not set error status code on success', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should include timestamp in overview', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.overview.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
        );
      });

      it('should include current year in overview', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.overview.year).toBe(CURRENT_YEAR);
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should filter verifications query by tenant_id', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM venue_verifications'),
          [TEST_TENANT_ID]
        );
      });

      it('should filter tax query by tenant_id', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM tax_records'),
          [CURRENT_YEAR, TEST_TENANT_ID]
        );
      });

      it('should filter OFAC query by tenant_id', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM ofac_checks'),
          [TEST_TENANT_ID]
        );
      });

      it('should filter activity query by tenant_id', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM compliance_audit_log'),
          [TEST_TENANT_ID]
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        // Reset mocks for new tenant
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockResolvedValueOnce({ rows: [mockTaxStats] })
          .mockResolvedValueOnce({ rows: [mockOfacStats] })
          .mockResolvedValueOnce({ rows: mockRecentActivity });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        // Verify all queries use secondary tenant
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('venue_verifications'),
          [TEST_SECONDARY_TENANT_ID]
        );
      });
    });

    // -------------------------------------------------------------------------
    // Verifications Data
    // -------------------------------------------------------------------------

    describe('verifications data', () => {
      it('should return verification stats', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.verifications).toEqual(mockVerificationStats);
      });

      it('should query with correct status counts', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'verified'"),
          expect.any(Array)
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'pending'"),
          expect.any(Array)
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'rejected'"),
          expect.any(Array)
        );
      });

      it('should handle empty verification stats', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ total: '0', verified: '0', pending: '0', rejected: '0' }] })
          .mockResolvedValueOnce({ rows: [mockTaxStats] })
          .mockResolvedValueOnce({ rows: [mockOfacStats] })
          .mockResolvedValueOnce({ rows: [] });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.verifications.total).toBe('0');
      });
    });

    // -------------------------------------------------------------------------
    // Tax Reporting Data
    // -------------------------------------------------------------------------

    describe('tax reporting data', () => {
      it('should return tax stats with threshold info', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.taxReporting).toEqual({
          ...mockTaxStats,
          threshold: 600,
          forms_required: '30'
        });
      });

      it('should query tax records for current year', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE year = $1'),
          [CURRENT_YEAR, TEST_TENANT_ID]
        );
      });

      it('should include $600 threshold constant', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.taxReporting.threshold).toBe(600);
      });

      it('should set forms_required from venues_over_threshold', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.taxReporting.forms_required).toBe('30');
      });

      it('should handle null venues_over_threshold', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockResolvedValueOnce({ rows: [{ venues_with_sales: '0', total_sales: '0', venues_over_threshold: null }] })
          .mockResolvedValueOnce({ rows: [mockOfacStats] })
          .mockResolvedValueOnce({ rows: mockRecentActivity });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.taxReporting.forms_required).toBe(0);
      });

      it('should handle empty tax stats', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockResolvedValueOnce({ rows: [{}] })
          .mockResolvedValueOnce({ rows: [mockOfacStats] })
          .mockResolvedValueOnce({ rows: mockRecentActivity });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.taxReporting.forms_required).toBe(0);
      });
    });

    // -------------------------------------------------------------------------
    // OFAC Screening Data
    // -------------------------------------------------------------------------

    describe('OFAC screening data', () => {
      it('should return OFAC stats', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.ofacScreening).toEqual(mockOfacStats);
      });

      it('should query ofac_checks table', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM ofac_checks'),
          expect.any(Array)
        );
      });

      it('should count total checks', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('COUNT(*) as total_checks'),
          expect.any(Array)
        );
      });

      it('should count matches found', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_match'),
          expect.any(Array)
        );
      });

      it('should handle zero OFAC checks', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockResolvedValueOnce({ rows: [mockTaxStats] })
          .mockResolvedValueOnce({ rows: [{ total_checks: '0', matches_found: '0' }] })
          .mockResolvedValueOnce({ rows: mockRecentActivity });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.ofacScreening.total_checks).toBe('0');
        expect(response.data.ofacScreening.matches_found).toBe('0');
      });
    });

    // -------------------------------------------------------------------------
    // Recent Activity Data
    // -------------------------------------------------------------------------

    describe('recent activity data', () => {
      it('should return recent activity array', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.recentActivity).toEqual(mockRecentActivity);
      });

      it('should query compliance_audit_log table', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM compliance_audit_log'),
          expect.any(Array)
        );
      });

      it('should order by created_at DESC', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC'),
          expect.any(Array)
        );
      });

      it('should limit to 5 results', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT 5'),
          expect.any(Array)
        );
      });

      it('should handle empty activity', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockResolvedValueOnce({ rows: [mockTaxStats] })
          .mockResolvedValueOnce({ rows: [mockOfacStats] })
          .mockResolvedValueOnce({ rows: [] });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.recentActivity).toEqual([]);
      });
    });

    // -------------------------------------------------------------------------
    // Database Query Count
    // -------------------------------------------------------------------------

    describe('database operations', () => {
      it('should make exactly 4 database queries', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(4);
      });

      it('should execute queries in correct order', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const calls = mockDbQuery.mock.calls;
        expect(calls[0][0]).toContain('venue_verifications');
        expect(calls[1][0]).toContain('tax_records');
        expect(calls[2][0]).toContain('ofac_checks');
        expect(calls[3][0]).toContain('compliance_audit_log');
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log overview retrieval with tenant ID', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });

      it('should log compliance overview message', async () => {
        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Compliance overview')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on verifications query error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Verifications query failed'));

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Verifications query failed'
        });
      });

      it('should return 500 on tax query error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockRejectedValueOnce(new Error('Tax query failed'));

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Tax query failed'
        });
      });

      it('should return 500 on OFAC query error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockResolvedValueOnce({ rows: [mockTaxStats] })
          .mockRejectedValueOnce(new Error('OFAC query failed'));

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });

      it('should return 500 on activity query error', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [mockVerificationStats] })
          .mockResolvedValueOnce({ rows: [mockTaxStats] })
          .mockResolvedValueOnce({ rows: [mockOfacStats] })
          .mockRejectedValueOnce(new Error('Activity query failed'));

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValueOnce(new Error('Database error'));

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Database error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant required');
        });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Tenant required'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle all empty results', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ total: '0', verified: '0', pending: '0', rejected: '0' }] })
          .mockResolvedValueOnce({ rows: [{ venues_with_sales: '0', total_sales: '0', venues_over_threshold: '0' }] })
          .mockResolvedValueOnce({ rows: [{ total_checks: '0', matches_found: '0' }] })
          .mockResolvedValueOnce({ rows: [] });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            verifications: expect.any(Object),
            taxReporting: expect.any(Object),
            ofacScreening: expect.any(Object),
            recentActivity: []
          })
        });
      });

      it('should handle large numbers in stats', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ total: '1000000', verified: '999999', pending: '1', rejected: '0' }] })
          .mockResolvedValueOnce({ rows: [{ venues_with_sales: '50000', total_sales: '999999999999', venues_over_threshold: '45000' }] })
          .mockResolvedValueOnce({ rows: [{ total_checks: '10000000', matches_found: '100' }] })
          .mockResolvedValueOnce({ rows: mockRecentActivity });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.verifications.total).toBe('1000000');
        expect(response.data.taxReporting.total_sales).toBe('999999999999');
        expect(response.data.ofacScreening.total_checks).toBe('10000000');
      });

      it('should handle missing rows in query result', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        await controller.getComplianceOverview(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.verifications).toBeUndefined();
        expect(response.data.recentActivity).toEqual([]);
      });
    });
  });
});
