/**
 * Unit Tests for BatchController
 *
 * Tests batch operations: 1099 generation, batch jobs, daily checks, OFAC updates
 * Validates tenant isolation, service integration, and error handling
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockBatchService = {
  generateYear1099Forms: jest.fn(),
  dailyComplianceChecks: jest.fn(),
  processOFACUpdates: jest.fn()
};
jest.mock('../../../src/services/batch.service', () => ({
  batchService: mockBatchService
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
import { BatchController } from '../../../src/controllers/batch.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_SECONDARY_TENANT_ID = TENANT_FIXTURES.secondary.id;
const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;

// =============================================================================
// TESTS
// =============================================================================

describe('BatchController', () => {
  let controller: BatchController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BatchController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // generate1099Forms Tests
  // ===========================================================================

  describe('generate1099Forms', () => {
    const mockGenerationResult = {
      generated: 25,
      skipped: 5,
      errors: 0,
      totalVenues: 30
    };

    beforeEach(() => {
      mockRequest.body = { year: 2024 };
      mockBatchService.generateYear1099Forms.mockResolvedValue(mockGenerationResult);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful generation', () => {
      it('should return success with generation result', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Generated 25 Form 1099-Ks for year 2024',
          data: mockGenerationResult
        });
      });

      it('should not set error status code on success', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should include generated count in message', async () => {
        mockBatchService.generateYear1099Forms.mockResolvedValue({
          generated: 100,
          skipped: 0,
          errors: 0
        });

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('100')
          })
        );
      });

      it('should include year in message', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('2024')
          })
        );
      });
    });

    // -------------------------------------------------------------------------
    // Year Handling
    // -------------------------------------------------------------------------

    describe('year handling', () => {
      it('should use provided year from request body', async () => {
        mockRequest.body = { year: 2023 };

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockBatchService.generateYear1099Forms).toHaveBeenCalledWith(
          2023,
          TEST_TENANT_ID
        );
      });

      it('should default to previous year when year not provided', async () => {
        mockRequest.body = {};

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockBatchService.generateYear1099Forms).toHaveBeenCalledWith(
          PREVIOUS_YEAR,
          TEST_TENANT_ID
        );
      });

      it('should default to previous year when body is empty', async () => {
        mockRequest.body = undefined;

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockBatchService.generateYear1099Forms).toHaveBeenCalledWith(
          PREVIOUS_YEAR,
          TEST_TENANT_ID
        );
      });

      it('should handle year as string (parsed correctly by service)', async () => {
        mockRequest.body = { year: '2022' };

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockBatchService.generateYear1099Forms).toHaveBeenCalledWith(
          '2022',
          TEST_TENANT_ID
        );
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should pass tenant ID to batch service', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockBatchService.generateYear1099Forms).toHaveBeenCalledWith(
          expect.any(Number),
          TEST_TENANT_ID
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockBatchService.generateYear1099Forms).toHaveBeenCalledWith(
          expect.any(Number),
          TEST_SECONDARY_TENANT_ID
        );
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log tenant ID', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });

      it('should log year', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('2024')
        );
      });

      it('should log generated count', async () => {
        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('25 forms')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on batch service error', async () => {
        mockBatchService.generateYear1099Forms.mockRejectedValue(
          new Error('Generation failed')
        );

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Generation failed'
        });
      });

      it('should log error on failure', async () => {
        mockBatchService.generateYear1099Forms.mockRejectedValue(
          new Error('Test error')
        );

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant ID required');
        });

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

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
      it('should handle zero forms generated', async () => {
        mockBatchService.generateYear1099Forms.mockResolvedValue({
          generated: 0,
          skipped: 0,
          errors: 0
        });

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Generated 0 Form 1099-Ks for year 2024',
          data: expect.objectContaining({ generated: 0 })
        });
      });

      it('should handle result with errors', async () => {
        mockBatchService.generateYear1099Forms.mockResolvedValue({
          generated: 20,
          skipped: 5,
          errors: 3
        });

        await controller.generate1099Forms(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: expect.stringContaining('20'),
          data: expect.objectContaining({ errors: 3 })
        });
      });
    });
  });

  // ===========================================================================
  // getBatchJobs Tests
  // ===========================================================================

  describe('getBatchJobs', () => {
    const mockJobs = [
      {
        id: 1,
        tenant_id: TEST_TENANT_ID,
        job_type: '1099_generation',
        status: 'completed',
        created_at: new Date('2025-01-01')
      },
      {
        id: 2,
        tenant_id: TEST_TENANT_ID,
        job_type: 'daily_checks',
        status: 'running',
        created_at: new Date('2025-01-02')
      }
    ];

    beforeEach(() => {
      mockDbQuery.mockResolvedValue({ rows: mockJobs });
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful retrieval', () => {
      it('should return success with jobs array', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockJobs
        });
      });

      it('should not set error status code on success', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should return empty array when no jobs exist', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: []
        });
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
      });

      it('should query with tenant_id filter', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE tenant_id = $1'),
          [TEST_TENANT_ID]
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.getBatchJobs(mockRequest as any, mockReply as any);

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
      it('should query compliance_batch_jobs table', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM compliance_batch_jobs'),
          expect.any(Array)
        );
      });

      it('should order by created_at DESC', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY created_at DESC'),
          expect.any(Array)
        );
      });

      it('should limit to 20 results', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT 20'),
          expect.any(Array)
        );
      });

      it('should make exactly 1 database call', async () => {
        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockDbQuery.mockRejectedValue(new Error('Database connection failed'));

        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Database connection failed'
        });
      });

      it('should log error on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Query failed'));

        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Query failed')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Invalid tenant');
        });

        await controller.getBatchJobs(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });

  // ===========================================================================
  // runDailyChecks Tests
  // ===========================================================================

  describe('runDailyChecks', () => {
    beforeEach(() => {
      mockBatchService.dailyComplianceChecks.mockResolvedValue(undefined);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful execution', () => {
      it('should return success message', async () => {
        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Daily compliance checks completed'
        });
      });

      it('should not set error status code on success', async () => {
        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
      });

      it('should pass tenant ID to batch service', async () => {
        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockBatchService.dailyComplianceChecks).toHaveBeenCalledWith(
          TEST_TENANT_ID
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockBatchService.dailyComplianceChecks).toHaveBeenCalledWith(
          TEST_SECONDARY_TENANT_ID
        );
      });
    });

    // -------------------------------------------------------------------------
    // Service Integration
    // -------------------------------------------------------------------------

    describe('batch service integration', () => {
      it('should call dailyComplianceChecks exactly once', async () => {
        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockBatchService.dailyComplianceChecks).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log completion with tenant ID', async () => {
        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });

      it('should log completion message', async () => {
        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('completed')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on batch service error', async () => {
        mockBatchService.dailyComplianceChecks.mockRejectedValue(
          new Error('Check failed')
        );

        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Check failed'
        });
      });

      it('should log error on failure', async () => {
        mockBatchService.dailyComplianceChecks.mockRejectedValue(
          new Error('Service unavailable')
        );

        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Service unavailable')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant required');
        });

        await controller.runDailyChecks(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });

  // ===========================================================================
  // updateOFACList Tests
  // ===========================================================================

  describe('updateOFACList', () => {
    beforeEach(() => {
      mockBatchService.processOFACUpdates.mockResolvedValue(undefined);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful update', () => {
      it('should return success message', async () => {
        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'OFAC list updated successfully'
        });
      });

      it('should not set error status code on success', async () => {
        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
      });

      it('should pass tenant ID to batch service', async () => {
        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockBatchService.processOFACUpdates).toHaveBeenCalledWith(
          TEST_TENANT_ID
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockBatchService.processOFACUpdates).toHaveBeenCalledWith(
          TEST_SECONDARY_TENANT_ID
        );
      });
    });

    // -------------------------------------------------------------------------
    // Service Integration
    // -------------------------------------------------------------------------

    describe('batch service integration', () => {
      it('should call processOFACUpdates exactly once', async () => {
        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockBatchService.processOFACUpdates).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log update with tenant ID', async () => {
        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });

      it('should log OFAC update message', async () => {
        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('OFAC')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on batch service error', async () => {
        mockBatchService.processOFACUpdates.mockRejectedValue(
          new Error('OFAC service unavailable')
        );

        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'OFAC service unavailable'
        });
      });

      it('should log error on failure', async () => {
        mockBatchService.processOFACUpdates.mockRejectedValue(
          new Error('Update failed')
        );

        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Update failed')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('No tenant');
        });

        await controller.updateOFACList(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });
  });
});
