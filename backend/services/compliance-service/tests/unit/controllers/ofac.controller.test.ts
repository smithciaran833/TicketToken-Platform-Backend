/**
 * Unit Tests for OFACController
 *
 * Tests OFAC sanctions list checking functionality
 * Validates tenant isolation, match detection, and audit logging
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockOfacService = {
  checkAgainstOFAC: jest.fn()
};
jest.mock('../../../src/services/ofac-real.service', () => ({
  realOFACService: mockOfacService
}));

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
import { OFACController } from '../../../src/controllers/ofac.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_SECONDARY_TENANT_ID = TENANT_FIXTURES.secondary.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// TESTS
// =============================================================================

describe('OFACController', () => {
  let controller: OFACController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OFACController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  // ===========================================================================
  // checkName Tests
  // ===========================================================================

  describe('checkName', () => {
    const validBody = {
      name: 'John Smith',
      venueId: TEST_VENUE_ID
    };

    beforeEach(() => {
      mockRequest.body = validBody;
    });

    // -------------------------------------------------------------------------
    // Success Cases - No Match (Clear)
    // -------------------------------------------------------------------------

    describe('when name is clear (no match)', () => {
      const clearResult = {
        isMatch: false,
        confidence: 0,
        matches: []
      };

      beforeEach(() => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue(clearResult);
      });

      it('should return success with isMatch false', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            isMatch: false
          })
        });
      });

      it('should return action as CLEARED', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            action: 'CLEARED'
          })
        });
      });

      it('should return confidence of 0', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            confidence: 0
          })
        });
      });

      it('should return empty matches array', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            matches: []
          })
        });
      });

      it('should return matchedName as null', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            matchedName: null
          })
        });
      });

      it('should include timestamp in ISO format', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('should log CLEAR result', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('CLEAR')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Success Cases - Match Found
    // -------------------------------------------------------------------------

    describe('when name matches OFAC list', () => {
      const matchResult = {
        isMatch: true,
        confidence: 95,
        matches: [
          { name: 'JOHN SMITH', score: 95, program: 'SDN' },
          { name: 'JOHN A SMITH', score: 85, program: 'SDN' }
        ]
      };

      beforeEach(() => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue(matchResult);
      });

      it('should return success with isMatch true', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            isMatch: true
          })
        });
      });

      it('should return action as REQUIRES_REVIEW', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            action: 'REQUIRES_REVIEW'
          })
        });
      });

      it('should return confidence score', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            confidence: 95
          })
        });
      });

      it('should return all matches', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            matches: matchResult.matches
          })
        });
      });

      it('should return first matched name', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            matchedName: 'JOHN SMITH'
          })
        });
      });

      it('should log MATCH result', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('MATCH')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      beforeEach(() => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });
      });

      it('should require tenant ID from request', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should log OFAC check with tenant_id', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO ofac_checks'),
          expect.arrayContaining([TEST_TENANT_ID])
        );
      });

      it('should include tenant_id in database insert', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('tenant_id'),
          [TEST_VENUE_ID, 'John Smith', false, 0, null, TEST_TENANT_ID]
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([TEST_SECONDARY_TENANT_ID])
        );
      });

      it('should log tenant ID in info message', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });
    });

    // -------------------------------------------------------------------------
    // OFAC Service Integration
    // -------------------------------------------------------------------------

    describe('OFAC service integration', () => {
      beforeEach(() => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });
      });

      it('should call ofacService with name', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockOfacService.checkAgainstOFAC).toHaveBeenCalledWith(
          'John Smith',
          true
        );
      });

      it('should pass true as second argument (detailed check)', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockOfacService.checkAgainstOFAC).toHaveBeenCalledWith(
          expect.any(String),
          true
        );
      });

      it('should be called exactly once per request', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockOfacService.checkAgainstOFAC).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Database Logging
    // -------------------------------------------------------------------------

    describe('database audit logging', () => {
      it('should insert into ofac_checks table', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO ofac_checks'),
          expect.any(Array)
        );
      });

      it('should log venue_id', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([TEST_VENUE_ID])
        );
      });

      it('should log name_checked', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['John Smith'])
        );
      });

      it('should log is_match correctly for match', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: true,
          confidence: 90,
          matches: [{ name: 'TEST NAME', score: 90 }]
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [TEST_VENUE_ID, 'John Smith', true, 90, 'TEST NAME', TEST_TENANT_ID]
        );
      });

      it('should log confidence score', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: true,
          confidence: 87,
          matches: [{ name: 'MATCH', score: 87 }]
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([87])
        );
      });

      it('should log matched_name as first match name', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: true,
          confidence: 92,
          matches: [
            { name: 'FIRST MATCH', score: 92 },
            { name: 'SECOND MATCH', score: 80 }
          ]
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['FIRST MATCH'])
        );
      });

      it('should log matched_name as null when no matches', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [TEST_VENUE_ID, 'John Smith', false, 0, null, TEST_TENANT_ID]
        );
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      beforeEach(() => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });
      });

      it('should log tenant ID', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`tenant ${TEST_TENANT_ID}`)
        );
      });

      it('should log venue ID', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`venue ${TEST_VENUE_ID}`)
        );
      });

      it('should log name checked', async () => {
        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('John Smith')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on OFAC service error', async () => {
        mockOfacService.checkAgainstOFAC.mockRejectedValue(
          new Error('OFAC service unavailable')
        );

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'OFAC service unavailable'
        });
      });

      it('should return 500 on database error', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });
        mockDbQuery.mockRejectedValue(new Error('Database connection failed'));

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Database connection failed'
        });
      });

      it('should log error on failure', async () => {
        mockOfacService.checkAgainstOFAC.mockRejectedValue(
          new Error('Test error')
        );

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.stringContaining('OFAC check failed')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant ID required');
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Tenant ID required'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      beforeEach(() => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 0,
          matches: []
        });
      });

      it('should handle empty name', async () => {
        mockRequest.body = { name: '', venueId: TEST_VENUE_ID };

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockOfacService.checkAgainstOFAC).toHaveBeenCalledWith('', true);
      });

      it('should handle special characters in name', async () => {
        mockRequest.body = { name: "O'Brien-Smith, Jr.", venueId: TEST_VENUE_ID };

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockOfacService.checkAgainstOFAC).toHaveBeenCalledWith(
          "O'Brien-Smith, Jr.",
          true
        );
      });

      it('should handle unicode characters in name', async () => {
        mockRequest.body = { name: 'José García', venueId: TEST_VENUE_ID };

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockOfacService.checkAgainstOFAC).toHaveBeenCalledWith(
          'José García',
          true
        );
      });

      it('should handle very long names', async () => {
        const longName = 'A'.repeat(500);
        mockRequest.body = { name: longName, venueId: TEST_VENUE_ID };

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockOfacService.checkAgainstOFAC).toHaveBeenCalledWith(
          longName,
          true
        );
      });

      it('should handle missing venueId', async () => {
        mockRequest.body = { name: 'John Smith' };

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [undefined, 'John Smith', false, 0, null, TEST_TENANT_ID]
        );
      });

      it('should handle partial match with low confidence', async () => {
        mockOfacService.checkAgainstOFAC.mockResolvedValue({
          isMatch: false,
          confidence: 45,
          matches: [{ name: 'JOHN SMITHSON', score: 45 }]
        });

        await controller.checkName(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: expect.objectContaining({
            isMatch: false,
            confidence: 45,
            action: 'CLEARED'
          })
        });
      });
    });
  });
});
