/**
 * Unit Tests for GDPRController
 *
 * Tests GDPR deletion request and status endpoints
 * Validates tenant isolation, database operations, and error handling
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, USER_FIXTURES, GDPR_REQUEST_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockDataRetentionService = {
  handleGDPRDeletion: jest.fn()
};
jest.mock('../../../src/services/data-retention.service', () => ({
  dataRetentionService: mockDataRetentionService
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
import { GDPRController } from '../../../src/controllers/gdpr.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_SECONDARY_TENANT_ID = TENANT_FIXTURES.secondary.id;
const TEST_CUSTOMER_ID = USER_FIXTURES.regularUser.id;

// =============================================================================
// TESTS
// =============================================================================

describe('GDPRController', () => {
  let controller: GDPRController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new GDPRController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // requestDeletion Tests
  // ===========================================================================

  describe('requestDeletion', () => {
    const validBody = {
      customerId: TEST_CUSTOMER_ID
    };

    beforeEach(() => {
      mockRequest.body = validBody;
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      mockDataRetentionService.handleGDPRDeletion.mockResolvedValue(undefined);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful deletion', () => {
      it('should return success response with customerId', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'GDPR deletion request processed',
          customerId: TEST_CUSTOMER_ID
        });
      });

      it('should not set error status code on success', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should insert deletion request with tenant_id', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO gdpr_deletion_requests'),
          [TEST_CUSTOMER_ID, TEST_TENANT_ID]
        );
      });

      it('should update status with tenant_id filter', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        const updateCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('UPDATE')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall![1]).toEqual([TEST_CUSTOMER_ID, TEST_TENANT_ID]);
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        // Verify INSERT uses secondary tenant
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          [TEST_CUSTOMER_ID, TEST_SECONDARY_TENANT_ID]
        );

        // Verify UPDATE uses secondary tenant
        const updateCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('UPDATE')
        );
        expect(updateCall![1]).toEqual([TEST_CUSTOMER_ID, TEST_SECONDARY_TENANT_ID]);
      });
    });

    // -------------------------------------------------------------------------
    // Database Operations
    // -------------------------------------------------------------------------

    describe('database operations', () => {
      it('should execute operations in correct order: INSERT -> DELETE -> UPDATE', async () => {
        const callOrder: string[] = [];

        mockDbQuery.mockImplementation((query: string) => {
          if (query.includes('INSERT')) callOrder.push('INSERT');
          if (query.includes('UPDATE')) callOrder.push('UPDATE');
          return Promise.resolve({ rows: [], rowCount: 1 });
        });

        mockDataRetentionService.handleGDPRDeletion.mockImplementation(() => {
          callOrder.push('DELETE');
          return Promise.resolve();
        });

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(callOrder).toEqual(['INSERT', 'DELETE', 'UPDATE']);
      });

      it('should insert with processing status initially', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        const insertCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('INSERT')
        );
        expect(insertCall![0]).toContain("'processing'");
      });

      it('should update to completed status after deletion', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        const updateCall = mockDbQuery.mock.calls.find(
          call => typeof call[0] === 'string' && call[0].includes('UPDATE')
        );
        expect(updateCall![0]).toContain("status = 'completed'");
        expect(updateCall![0]).toContain('processed_at = NOW()');
      });

      it('should make exactly 2 database calls', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(2);
      });
    });

    // -------------------------------------------------------------------------
    // Data Retention Service Integration
    // -------------------------------------------------------------------------

    describe('data retention service', () => {
      it('should call handleGDPRDeletion with customerId', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockDataRetentionService.handleGDPRDeletion).toHaveBeenCalledWith(
          TEST_CUSTOMER_ID
        );
        expect(mockDataRetentionService.handleGDPRDeletion).toHaveBeenCalledTimes(1);
      });

      it('should call handleGDPRDeletion after INSERT but before UPDATE', async () => {
        let deletionCalledAfterInsert = false;
        let deletionCalledBeforeUpdate = true;

        mockDbQuery.mockImplementation((query: string) => {
          if (query.includes('UPDATE')) {
            if (!mockDataRetentionService.handleGDPRDeletion.mock.calls.length) {
              deletionCalledBeforeUpdate = false;
            }
          }
          return Promise.resolve({ rows: [], rowCount: 1 });
        });

        mockDataRetentionService.handleGDPRDeletion.mockImplementation(() => {
          if (mockDbQuery.mock.calls.some((call: any) => call[0].includes('INSERT'))) {
            deletionCalledAfterInsert = true;
          }
          return Promise.resolve();
        });

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(deletionCalledAfterInsert).toBe(true);
        expect(deletionCalledBeforeUpdate).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    describe('logging', () => {
      it('should log deletion request with customer and tenant IDs', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_CUSTOMER_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
      });

      it('should log completion after successful deletion', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('completed')
        );
      });

      it('should log exactly twice on success (request + completion)', async () => {
        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledTimes(2);
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on INSERT failure', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('Database connection failed'));

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Database connection failed'
        });
      });

      it('should return 500 on data retention service failure', async () => {
        mockDataRetentionService.handleGDPRDeletion.mockRejectedValue(
          new Error('Deletion service unavailable')
        );

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Deletion service unavailable'
        });
      });

      it('should return 500 on UPDATE failure', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT succeeds
          .mockRejectedValueOnce(new Error('Update failed')); // UPDATE fails

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Update failed'
        });
      });

      it('should log error message on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Test error'));

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });

      it('should not call data retention service if INSERT fails', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('INSERT failed'));

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockDataRetentionService.handleGDPRDeletion).not.toHaveBeenCalled();
      });

      it('should not call UPDATE if data retention service fails', async () => {
        mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
        mockDataRetentionService.handleGDPRDeletion.mockRejectedValue(
          new Error('Deletion failed')
        );

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        // Should only have INSERT call, not UPDATE
        expect(mockDbQuery).toHaveBeenCalledTimes(1);
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          expect.any(Array)
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant ID required');
        });

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Tenant ID required'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle empty customerId', async () => {
        mockRequest.body = { customerId: '' };

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          ['', TEST_TENANT_ID]
        );
      });

      it('should handle undefined customerId', async () => {
        mockRequest.body = {};

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          [undefined, TEST_TENANT_ID]
        );
      });

      it('should handle special characters in customerId', async () => {
        const specialId = "test-id-with'quotes\"and\\slashes";
        mockRequest.body = { customerId: specialId };

        await controller.requestDeletion(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          [specialId, TEST_TENANT_ID]
        );
      });
    });
  });

  // ===========================================================================
  // getDeletionStatus Tests
  // ===========================================================================

  describe('getDeletionStatus', () => {
    beforeEach(() => {
      mockRequest.params = { customerId: TEST_CUSTOMER_ID };
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful retrieval', () => {
      it('should return deletion status when record exists', async () => {
        const mockRecord = {
          id: GDPR_REQUEST_FIXTURES.pendingDeletion.id,
          customer_id: TEST_CUSTOMER_ID,
          tenant_id: TEST_TENANT_ID,
          status: 'completed',
          requested_at: new Date('2025-01-01'),
          processed_at: new Date('2025-01-01')
        };
        mockDbQuery.mockResolvedValue({ rows: [mockRecord] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockRecord
        });
      });

      it('should return null when no record exists', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: null
        });
      });

      it('should return only the most recent record', async () => {
        const recentRecord = {
          id: '1',
          status: 'completed',
          requested_at: new Date('2025-01-15')
        };
        const oldRecord = {
          id: '2',
          status: 'processing',
          requested_at: new Date('2025-01-01')
        };
        // Query returns only most recent due to ORDER BY and LIMIT
        mockDbQuery.mockResolvedValue({ rows: [recentRecord] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: recentRecord
        });
      });

      it('should not set error status code on success', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should query with tenant_id filter', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('tenant_id = $2'),
          [TEST_CUSTOMER_ID, TEST_TENANT_ID]
        );
      });

      it('should not return data from other tenants', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [TEST_CUSTOMER_ID, TEST_SECONDARY_TENANT_ID]
        );
      });
    });

    // -------------------------------------------------------------------------
    // Database Query
    // -------------------------------------------------------------------------

    describe('database query', () => {
      it('should query gdpr_deletion_requests table', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM gdpr_deletion_requests'),
          expect.any(Array)
        );
      });

      it('should filter by customer_id', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('customer_id = $1'),
          expect.arrayContaining([TEST_CUSTOMER_ID])
        );
      });

      it('should order by requested_at DESC', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY requested_at DESC'),
          expect.any(Array)
        );
      });

      it('should limit to 1 result', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT 1'),
          expect.any(Array)
        );
      });

      it('should make exactly 1 database call', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on database error', async () => {
        mockDbQuery.mockRejectedValue(new Error('Connection timeout'));

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Connection timeout'
        });
      });

      it('should log error message on failure', async () => {
        mockDbQuery.mockRejectedValue(new Error('Query failed'));

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Query failed')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Invalid tenant');
        });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Invalid tenant'
        });
      });

      it('should handle null database result gracefully', async () => {
        mockDbQuery.mockResolvedValue({ rows: null });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        // Should not throw, but behavior depends on implementation
        expect(mockReply.code).toHaveBeenCalledWith(500);
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle UUID customerId', async () => {
        const uuidCustomerId = '550e8400-e29b-41d4-a716-446655440000';
        mockRequest.params = { customerId: uuidCustomerId };
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [uuidCustomerId, TEST_TENANT_ID]
        );
      });

      it('should handle missing customerId in params', async () => {
        mockRequest.params = {};
        mockDbQuery.mockResolvedValue({ rows: [] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.any(String),
          [undefined, TEST_TENANT_ID]
        );
      });

      it('should return all fields from database record', async () => {
        const fullRecord = {
          id: 'record-123',
          customer_id: TEST_CUSTOMER_ID,
          tenant_id: TEST_TENANT_ID,
          status: 'completed',
          requested_at: new Date('2025-01-01T10:00:00Z'),
          processed_at: new Date('2025-01-01T10:05:00Z'),
          additional_field: 'extra data'
        };
        mockDbQuery.mockResolvedValue({ rows: [fullRecord] });

        await controller.getDeletionStatus(mockRequest as any, mockReply as any);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.data).toEqual(fullRecord);
      });
    });

    // -------------------------------------------------------------------------
    // Status Values
    // -------------------------------------------------------------------------

    describe('status values', () => {
      const statuses = ['pending', 'processing', 'completed', 'failed', 'rejected'];

      statuses.forEach(status => {
        it(`should return record with status: ${status}`, async () => {
          const record = {
            id: 'record-123',
            customer_id: TEST_CUSTOMER_ID,
            status
          };
          mockDbQuery.mockResolvedValue({ rows: [record] });

          await controller.getDeletionStatus(mockRequest as any, mockReply as any);

          expect(mockReply.send).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({ status })
          });
        });
      });
    });
  });
});
