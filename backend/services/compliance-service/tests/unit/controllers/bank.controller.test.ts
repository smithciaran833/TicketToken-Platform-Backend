/**
 * Unit Tests for BankController
 *
 * Tests bank verification and payout method endpoints
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockBankService = {
  verifyBankAccount: jest.fn(),
  createPayoutMethod: jest.fn(),
  getPayoutMethods: jest.fn(),
  getBankVerificationHistory: jest.fn()
};
jest.mock('../../../src/services/bank.service', () => ({
  bankService: mockBankService
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
import { BankController } from '../../../src/controllers/bank.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// TESTS
// =============================================================================

describe('BankController', () => {
  let controller: BankController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BankController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // verifyBankAccount Tests
  // ===========================================================================

  describe('verifyBankAccount', () => {
    const validBody = {
      venueId: TEST_VENUE_ID,
      accountNumber: '123456789012',
      routingNumber: '021000021'
    };

    beforeEach(() => {
      mockRequest.body = validBody;
    });

    it('should return success when verification passes', async () => {
      mockBankService.verifyBankAccount.mockResolvedValue({
        verified: true,
        accountName: 'Test Business Checking',
        accountType: 'checking'
      });

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Bank account verified',
        data: expect.objectContaining({
          venueId: TEST_VENUE_ID,
          verified: true,
          accountName: 'Test Business Checking'
        })
      });
    });

    it('should return failure message when verification fails', async () => {
      mockBankService.verifyBankAccount.mockResolvedValue({
        verified: false,
        accountName: 'Unknown',
        accountType: 'unknown'
      });

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Verification failed',
        data: expect.objectContaining({
          verified: false
        })
      });
    });

    it('should call bankService with correct parameters', async () => {
      mockBankService.verifyBankAccount.mockResolvedValue({
        verified: true,
        accountName: 'Test',
        accountType: 'checking'
      });

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockBankService.verifyBankAccount).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        validBody.venueId,
        validBody.accountNumber,
        validBody.routingNumber
      );
    });

    it('should require tenant ID', async () => {
      mockBankService.verifyBankAccount.mockResolvedValue({ verified: true });

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should log successful verification', async () => {
      mockBankService.verifyBankAccount.mockResolvedValue({ verified: true });

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('VERIFIED')
      );
    });

    it('should log failed verification', async () => {
      mockBankService.verifyBankAccount.mockResolvedValue({ verified: false });

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('FAILED')
      );
    });

    it('should return 500 on service error', async () => {
      mockBankService.verifyBankAccount.mockRejectedValue(new Error('Service unavailable'));

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Service unavailable'
      });
    });

    it('should log error on failure', async () => {
      mockBankService.verifyBankAccount.mockRejectedValue(new Error('DB error'));

      await controller.verifyBankAccount(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error verifying bank account')
      );
    });
  });

  // ===========================================================================
  // createPayoutMethod Tests
  // ===========================================================================

  describe('createPayoutMethod', () => {
    const validBody = {
      venueId: TEST_VENUE_ID,
      accountToken: 'tok_test_123456'
    };

    beforeEach(() => {
      mockRequest.body = validBody;
    });

    it('should return success with payout ID', async () => {
      mockBankService.createPayoutMethod.mockResolvedValue('payout_123456');

      await controller.createPayoutMethod(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Payout method created',
        data: {
          venueId: TEST_VENUE_ID,
          payoutId: 'payout_123456'
        }
      });
    });

    it('should call bankService with correct parameters', async () => {
      mockBankService.createPayoutMethod.mockResolvedValue('payout_123');

      await controller.createPayoutMethod(mockRequest as any, mockReply as any);

      expect(mockBankService.createPayoutMethod).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        validBody.venueId,
        validBody.accountToken
      );
    });

    it('should require tenant ID', async () => {
      mockBankService.createPayoutMethod.mockResolvedValue('payout_123');

      await controller.createPayoutMethod(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should log payout method creation', async () => {
      mockBankService.createPayoutMethod.mockResolvedValue('payout_123');

      await controller.createPayoutMethod(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Payout method created')
      );
    });

    it('should return 500 on service error', async () => {
      mockBankService.createPayoutMethod.mockRejectedValue(new Error('Payment provider error'));

      await controller.createPayoutMethod(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Payment provider error'
      });
    });

    it('should log error on failure', async () => {
      mockBankService.createPayoutMethod.mockRejectedValue(new Error('Error'));

      await controller.createPayoutMethod(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creating payout method')
      );
    });
  });

  // ===========================================================================
  // getPayoutMethods Tests
  // ===========================================================================

  describe('getPayoutMethods', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: TEST_VENUE_ID };
    });

    it('should return payout methods array', async () => {
      const mockPayoutMethods = [
        { payoutId: 'payout_1', status: 'active', createdAt: new Date() },
        { payoutId: 'payout_2', status: 'inactive', createdAt: new Date() }
      ];
      mockBankService.getPayoutMethods.mockResolvedValue(mockPayoutMethods);

      await controller.getPayoutMethods(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockPayoutMethods
      });
    });

    it('should call bankService with tenant and venue IDs', async () => {
      mockBankService.getPayoutMethods.mockResolvedValue([]);

      await controller.getPayoutMethods(mockRequest as any, mockReply as any);

      expect(mockBankService.getPayoutMethods).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TEST_VENUE_ID
      );
    });

    it('should return empty array when no payout methods', async () => {
      mockBankService.getPayoutMethods.mockResolvedValue([]);

      await controller.getPayoutMethods(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should return 500 on service error', async () => {
      mockBankService.getPayoutMethods.mockRejectedValue(new Error('DB error'));

      await controller.getPayoutMethods(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'DB error'
      });
    });

    it('should log error on failure', async () => {
      mockBankService.getPayoutMethods.mockRejectedValue(new Error('Error'));

      await controller.getPayoutMethods(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error getting payout methods')
      );
    });
  });

  // ===========================================================================
  // getBankVerificationHistory Tests
  // ===========================================================================

  describe('getBankVerificationHistory', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: TEST_VENUE_ID };
    });

    it('should return verification history array', async () => {
      const mockHistory = [
        { accountLastFour: '1234', verified: true, createdAt: new Date() },
        { accountLastFour: '5678', verified: false, createdAt: new Date() }
      ];
      mockBankService.getBankVerificationHistory.mockResolvedValue(mockHistory);

      await controller.getBankVerificationHistory(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockHistory
      });
    });

    it('should call bankService with tenant and venue IDs', async () => {
      mockBankService.getBankVerificationHistory.mockResolvedValue([]);

      await controller.getBankVerificationHistory(mockRequest as any, mockReply as any);

      expect(mockBankService.getBankVerificationHistory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TEST_VENUE_ID
      );
    });

    it('should return empty array when no history', async () => {
      mockBankService.getBankVerificationHistory.mockResolvedValue([]);

      await controller.getBankVerificationHistory(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should return 500 on service error', async () => {
      mockBankService.getBankVerificationHistory.mockRejectedValue(new Error('Query failed'));

      await controller.getBankVerificationHistory(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Query failed'
      });
    });

    it('should log error on failure', async () => {
      mockBankService.getBankVerificationHistory.mockRejectedValue(new Error('Error'));

      await controller.getBankVerificationHistory(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error getting bank verification history')
      );
    });
  });
});
