/**
 * Unit Tests for TaxController
 *
 * Tests tax tracking, summary, calculation, and report generation endpoints
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockTaxService = {
  trackSale: jest.fn(),
  getVenueTaxSummary: jest.fn(),
  calculateTax: jest.fn(),
  generateTaxReport: jest.fn()
};
jest.mock('../../../src/services/tax.service', () => ({
  taxService: mockTaxService
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
import { TaxController } from '../../../src/controllers/tax.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// TESTS
// =============================================================================

describe('TaxController', () => {
  let controller: TaxController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TaxController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // trackSale Tests
  // ===========================================================================

  describe('trackSale', () => {
    const validBody = {
      venueId: TEST_VENUE_ID,
      amount: 5000,
      ticketId: 'ticket-123'
    };

    beforeEach(() => {
      mockRequest.body = validBody;
    });

    it('should return success with tracking data', async () => {
      const mockResult = {
        id: 'tax-record-123',
        totalYearToDate: 15000,
        thresholdReached: false
      };
      mockTaxService.trackSale.mockResolvedValue(mockResult);

      await controller.trackSale(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Sale tracked for tax reporting',
        data: mockResult
      });
    });

    it('should call taxService.trackSale with correct parameters', async () => {
      mockTaxService.trackSale.mockResolvedValue({});

      await controller.trackSale(mockRequest as any, mockReply as any);

      expect(mockTaxService.trackSale).toHaveBeenCalledWith(
        validBody.venueId,
        validBody.amount,
        validBody.ticketId,
        TEST_TENANT_ID
      );
    });

    it('should require tenant ID', async () => {
      mockTaxService.trackSale.mockResolvedValue({});

      await controller.trackSale(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should log sale tracking', async () => {
      mockTaxService.trackSale.mockResolvedValue({});

      await controller.trackSale(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sale tracked')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`$${validBody.amount}`)
      );
    });

    it('should return 500 on service error', async () => {
      mockTaxService.trackSale.mockRejectedValue(new Error('Database error'));

      await controller.trackSale(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Database error'
      });
    });

    it('should log error on failure', async () => {
      mockTaxService.trackSale.mockRejectedValue(new Error('Error'));

      await controller.trackSale(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error tracking sale')
      );
    });
  });

  // ===========================================================================
  // getTaxSummary Tests
  // ===========================================================================

  describe('getTaxSummary', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: TEST_VENUE_ID };
      mockRequest.query = {};
    });

    it('should return tax summary data', async () => {
      const mockSummary = {
        venueId: TEST_VENUE_ID,
        year: 2025,
        totalSales: 50000,
        transactionCount: 100,
        threshold1099: 600,
        thresholdReached: true
      };
      mockTaxService.getVenueTaxSummary.mockResolvedValue(mockSummary);

      await controller.getTaxSummary(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockSummary
      });
    });

    it('should call taxService with venueId and tenantId', async () => {
      mockTaxService.getVenueTaxSummary.mockResolvedValue({});

      await controller.getTaxSummary(mockRequest as any, mockReply as any);

      expect(mockTaxService.getVenueTaxSummary).toHaveBeenCalledWith(
        TEST_VENUE_ID,
        undefined,
        TEST_TENANT_ID
      );
    });

    it('should pass year when provided in query', async () => {
      mockRequest.query = { year: '2024' };
      mockTaxService.getVenueTaxSummary.mockResolvedValue({});

      await controller.getTaxSummary(mockRequest as any, mockReply as any);

      expect(mockTaxService.getVenueTaxSummary).toHaveBeenCalledWith(
        TEST_VENUE_ID,
        2024,
        TEST_TENANT_ID
      );
    });

    it('should parse year as integer', async () => {
      mockRequest.query = { year: '2023' };
      mockTaxService.getVenueTaxSummary.mockResolvedValue({});

      await controller.getTaxSummary(mockRequest as any, mockReply as any);

      expect(mockTaxService.getVenueTaxSummary).toHaveBeenCalledWith(
        expect.any(String),
        2023,
        expect.any(String)
      );
    });

    it('should require tenant ID', async () => {
      mockTaxService.getVenueTaxSummary.mockResolvedValue({});

      await controller.getTaxSummary(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should return 500 on service error', async () => {
      mockTaxService.getVenueTaxSummary.mockRejectedValue(new Error('Query failed'));

      await controller.getTaxSummary(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Query failed'
      });
    });

    it('should log error on failure', async () => {
      mockTaxService.getVenueTaxSummary.mockRejectedValue(new Error('Error'));

      await controller.getTaxSummary(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error getting tax summary')
      );
    });
  });

  // ===========================================================================
  // calculateTax Tests
  // ===========================================================================

  describe('calculateTax', () => {
    const validBody = {
      amount: 10000,
      venueId: TEST_VENUE_ID,
      taxRate: 0.08
    };

    beforeEach(() => {
      mockRequest.body = validBody;
    });

    it('should return calculated tax result', async () => {
      const mockResult = {
        subtotal: 10000,
        taxRate: 0.08,
        taxAmount: 800,
        total: 10800
      };
      mockTaxService.calculateTax.mockResolvedValue(mockResult);

      await controller.calculateTax(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should call taxService.calculateTax with body and tenantId', async () => {
      mockTaxService.calculateTax.mockResolvedValue({});

      await controller.calculateTax(mockRequest as any, mockReply as any);

      expect(mockTaxService.calculateTax).toHaveBeenCalledWith(
        validBody,
        TEST_TENANT_ID
      );
    });

    it('should require tenant ID', async () => {
      mockTaxService.calculateTax.mockResolvedValue({});

      await controller.calculateTax(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should return 500 on service error', async () => {
      mockTaxService.calculateTax.mockRejectedValue(new Error('Calculation error'));

      await controller.calculateTax(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to calculate tax'
      });
    });

    it('should log error on failure', async () => {
      mockTaxService.calculateTax.mockRejectedValue(new Error('Error'));

      await controller.calculateTax(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error calculating tax')
      );
    });
  });

  // ===========================================================================
  // generateTaxReport Tests
  // ===========================================================================

  describe('generateTaxReport', () => {
    beforeEach(() => {
      mockRequest.params = { year: '2025' };
    });

    it('should return generated tax report', async () => {
      const mockResult = {
        year: 2025,
        generatedAt: new Date().toISOString(),
        venues: [],
        totalAmount: 0
      };
      mockTaxService.generateTaxReport.mockResolvedValue(mockResult);

      await controller.generateTaxReport(mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should call taxService.generateTaxReport with parsed year', async () => {
      mockTaxService.generateTaxReport.mockResolvedValue({});

      await controller.generateTaxReport(mockRequest as any, mockReply as any);

      expect(mockTaxService.generateTaxReport).toHaveBeenCalledWith(
        2025,
        TEST_TENANT_ID
      );
    });

    it('should parse year as integer from params', async () => {
      mockRequest.params = { year: '2024' };
      mockTaxService.generateTaxReport.mockResolvedValue({});

      await controller.generateTaxReport(mockRequest as any, mockReply as any);

      expect(mockTaxService.generateTaxReport).toHaveBeenCalledWith(
        2024,
        expect.any(String)
      );
    });

    it('should require tenant ID', async () => {
      mockTaxService.generateTaxReport.mockResolvedValue({});

      await controller.generateTaxReport(mockRequest as any, mockReply as any);

      expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should log report generation', async () => {
      mockTaxService.generateTaxReport.mockResolvedValue({});

      await controller.generateTaxReport(mockRequest as any, mockReply as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Tax report generated')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('2025')
      );
    });

    it('should return 500 on service error', async () => {
      mockTaxService.generateTaxReport.mockRejectedValue(new Error('Report generation failed'));

      await controller.generateTaxReport(mockRequest as any, mockReply as any);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to generate tax report'
      });
    });

    it('should log error on failure', async () => {
      mockTaxService.generateTaxReport.mockRejectedValue(new Error('Error'));

      await controller.generateTaxReport(mockRequest as any, mockReply as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error generating tax report')
      );
    });
  });
});
