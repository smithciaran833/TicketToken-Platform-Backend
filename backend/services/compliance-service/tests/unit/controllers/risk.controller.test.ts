/**
 * Unit Tests for RiskController
 *
 * Tests risk score calculation, venue flagging, and flag resolution endpoints
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockRiskService = {
  calculateRiskScore: jest.fn(),
  flagForReview: jest.fn(),
  resolveFlag: jest.fn(),
  getPendingFlags: jest.fn()
};
jest.mock('../../../src/services/risk.service', () => ({
  riskService: mockRiskService
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
import { RiskController } from '../../../src/controllers/risk.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// TESTS
// =============================================================================

describe('RiskController', () => {
  let controller: RiskController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RiskController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // calculateRiskScore Tests
  // ===========================================================================

  describe('calculateRiskScore', () => {
    const validBody = {
      venueId: TEST_VENUE_ID
    };

    beforeEach(() => {
      mockRequest.body = validBody;
    });

    it('should return risk assessment data on success', async () => {
      const mockAssessment = {
        score: 45,
        factors: ['Missing EIN', 'Bank not verified'],
        recommendation: 'MONITOR'
      };
      mockRiskService.calculateRiskScore.mockResolvedValue(mockAssessment);

      await controller.calculateRiskScore(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          venueId: TEST_VENUE_ID,
          score: 45,
          factors: ['Missing EIN', 'Bank not verified'],
          recommendation: 'MONITOR',
          timestamp: expect.any(String)
        })
      });
    });

    it('should include timestamp in ISO format', async () => {
      mockRiskService.calculateRiskScore.mockResolvedValue({
        score: 0,
        factors: [],
        recommendation: 'APPROVE'
      });

      await controller.calculateRiskScore(mockRequest as any, mockReply as any);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should call riskService with venueId and tenantId', async () => {
      mockRiskService.calculateRiskScore.mockResolvedValue({
        score: 0,
        factors: [],
        recommendation: 'APPROVE'
      });

      await controller.calculateRiskScore(mockRequest as any, mockReply as any);

      expect(mockRiskService.calculateRiskScore).toHaveBeenCalledWith(
        TEST_VENUE_ID,
        TEST_TENANT_ID
      );
    });

    it('should require tenant ID', async () => {
      mockRiskService.calculateRiskScore.mockResolvedValue({
        score: 0,
        factors: [],
        recommendation: 'APPROVE'
      });

      await controller.calculateRiskScore(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should log risk score calculation', async () => {
      mockRiskService.calculateRiskScore.mockResolvedValue({
        score: 75,
        factors: [],
        recommendation: 'BLOCK'
      });

      await controller.calculateRiskScore(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Risk score calculated')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('75')
      );
    });

    it('should return 500 on service error', async () => {
      mockRiskService.calculateRiskScore.mockRejectedValue(new Error('Database error'));

      await controller.calculateRiskScore(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Database error'
      });
    });

    it('should log error on failure', async () => {
      mockRiskService.calculateRiskScore.mockRejectedValue(new Error('Service unavailable'));

      await controller.calculateRiskScore(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error calculating risk score')
      );
    });
  });

  // ===========================================================================
  // flagVenue Tests
  // ===========================================================================

  describe('flagVenue', () => {
    const validBody = {
      venueId: TEST_VENUE_ID,
      reason: 'Suspicious transaction patterns detected'
    };

    beforeEach(() => {
      mockRequest.body = validBody;
    });

    it('should return success on venue flagged', async () => {
      mockRiskService.flagForReview.mockResolvedValue(undefined);

      await controller.flagVenue(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Venue flagged for review',
        data: {
          venueId: TEST_VENUE_ID,
          reason: validBody.reason
        }
      });
    });

    it('should call riskService.flagForReview with correct parameters', async () => {
      mockRiskService.flagForReview.mockResolvedValue(undefined);

      await controller.flagVenue(mockRequest as any, mockReply as any);

      expect(mockRiskService.flagForReview).toHaveBeenCalledWith(
        TEST_VENUE_ID,
        validBody.reason,
        TEST_TENANT_ID
      );
    });

    it('should require tenant ID', async () => {
      mockRiskService.flagForReview.mockResolvedValue(undefined);

      await controller.flagVenue(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should log venue flagging', async () => {
      mockRiskService.flagForReview.mockResolvedValue(undefined);

      await controller.flagVenue(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Venue ${TEST_VENUE_ID} flagged for review`)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(validBody.reason)
      );
    });

    it('should return 500 on service error', async () => {
      mockRiskService.flagForReview.mockRejectedValue(new Error('Flag creation failed'));

      await controller.flagVenue(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Flag creation failed'
      });
    });

    it('should log error on failure', async () => {
      mockRiskService.flagForReview.mockRejectedValue(new Error('Error'));

      await controller.flagVenue(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error flagging venue')
      );
    });
  });

  // ===========================================================================
  // resolveFlag Tests
  // ===========================================================================

  describe('resolveFlag', () => {
    const validParams = { flagId: '123' };
    const validBody = { resolution: 'Investigated and cleared - legitimate activity' };

    beforeEach(() => {
      mockRequest.params = validParams;
      mockRequest.body = validBody;
    });

    it('should return success on flag resolved', async () => {
      mockRiskService.resolveFlag.mockResolvedValue(undefined);

      await controller.resolveFlag(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Flag resolved',
        data: {
          flagId: '123',
          resolution: validBody.resolution
        }
      });
    });

    it('should call riskService.resolveFlag with parsed flagId', async () => {
      mockRiskService.resolveFlag.mockResolvedValue(undefined);

      await controller.resolveFlag(mockRequest as any, mockReply as any);

      expect(mockRiskService.resolveFlag).toHaveBeenCalledWith(
        123, // parsed to integer
        validBody.resolution,
        TEST_TENANT_ID
      );
    });

    it('should require tenant ID', async () => {
      mockRiskService.resolveFlag.mockResolvedValue(undefined);

      await controller.resolveFlag(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should log flag resolution', async () => {
      mockRiskService.resolveFlag.mockResolvedValue(undefined);

      await controller.resolveFlag(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Flag 123 resolved')
      );
    });

    it('should return 500 on service error', async () => {
      mockRiskService.resolveFlag.mockRejectedValue(new Error('Flag not found'));

      await controller.resolveFlag(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Flag not found'
      });
    });

    it('should log error on failure', async () => {
      mockRiskService.resolveFlag.mockRejectedValue(new Error('Error'));

      await controller.resolveFlag(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error resolving flag')
      );
    });

    it('should handle numeric flagId in params', async () => {
      mockRequest.params = { flagId: 456 };
      mockRiskService.resolveFlag.mockResolvedValue(undefined);

      await controller.resolveFlag(mockRequest as any, mockReply as any);

      expect(mockRiskService.resolveFlag).toHaveBeenCalledWith(
        456,
        validBody.resolution,
        TEST_TENANT_ID
      );
    });
  });
});
