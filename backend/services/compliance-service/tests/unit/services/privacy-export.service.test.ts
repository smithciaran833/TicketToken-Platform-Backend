/**
 * Unit Tests for PrivacyExportService
 *
 * Tests GDPR/CCPA data export, deletion requests, and status tracking
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TENANT_FIXTURES, USER_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

// Mock fs
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockCreateWriteStream = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  createWriteStream: mockCreateWriteStream
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-1234-5678')
}));

// Mock Knex - create chainable mock
const mockKnexWhere = jest.fn().mockReturnThis();
const mockKnexAndWhere = jest.fn().mockReturnThis();
const mockKnexSelect = jest.fn().mockReturnThis();
const mockKnexFirst = jest.fn();
const mockKnexInsert = jest.fn().mockResolvedValue([1]);
const mockKnexUpdate = jest.fn().mockResolvedValue(1);
const mockKnexOrWhere = jest.fn().mockReturnThis();
const mockKnexLimit = jest.fn().mockReturnThis();
const mockKnexRaw = jest.fn((sql) => sql);

const mockKnexInstance = jest.fn((tableName: string) => ({
  where: mockKnexWhere,
  andWhere: mockKnexAndWhere,
  select: mockKnexSelect,
  first: mockKnexFirst,
  insert: mockKnexInsert,
  update: mockKnexUpdate,
  orWhere: mockKnexOrWhere,
  limit: mockKnexLimit
}));
(mockKnexInstance as any).raw = mockKnexRaw;

jest.mock('knex', () => {
  return jest.fn(() => mockKnexInstance);
});

// Mock database config
jest.mock('../../../src/config/database', () => ({
  dbConfig: {
    host: 'localhost',
    port: 5432,
    database: 'test'
  }
}));

// Import module under test AFTER mocks
import { PrivacyExportService, privacyExportService } from '../../../src/services/privacy-export.service';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_USER_ID = USER_FIXTURES.regularUser.id;
const TEST_REQUEST_ID = 'mock-uuid-1234-5678';

// =============================================================================
// TESTS
// =============================================================================

describe('PrivacyExportService', () => {
  let service: PrivacyExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrivacyExportService();
    
    // Reset chainable mocks
    mockKnexWhere.mockReturnThis();
    mockKnexAndWhere.mockReturnThis();
    mockKnexSelect.mockReturnThis();
    mockKnexOrWhere.mockReturnThis();
    mockKnexLimit.mockReturnThis();
    mockKnexFirst.mockResolvedValue(null);
    mockKnexInsert.mockResolvedValue([1]);
    mockKnexUpdate.mockResolvedValue(1);
  });

  // ===========================================================================
  // requestDataExport Tests
  // ===========================================================================

  describe('requestDataExport', () => {
    it('should create export request with unique ID', async () => {
      const result = await service.requestDataExport(
        TEST_TENANT_ID,
        TEST_USER_ID,
        'GDPR request'
      );

      expect(result.requestId).toBe(TEST_REQUEST_ID);
    });

    it('should return pending status initially', async () => {
      const result = await service.requestDataExport(
        TEST_TENANT_ID,
        TEST_USER_ID,
        'GDPR request'
      );

      expect(result.status).toBe('pending');
    });

    it('should include userId in response', async () => {
      const result = await service.requestDataExport(
        TEST_TENANT_ID,
        TEST_USER_ID,
        'GDPR request'
      );

      expect(result.userId).toBe(TEST_USER_ID);
    });

    it('should include requestedAt timestamp', async () => {
      const beforeTime = new Date();
      const result = await service.requestDataExport(
        TEST_TENANT_ID,
        TEST_USER_ID,
        'GDPR request'
      );
      const afterTime = new Date();

      expect(result.requestedAt).toBeInstanceOf(Date);
      expect(result.requestedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.requestedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should insert request into privacy_export_requests table', async () => {
      await service.requestDataExport(
        TEST_TENANT_ID,
        TEST_USER_ID,
        'GDPR request'
      );

      expect(mockKnexInstance).toHaveBeenCalledWith('privacy_export_requests');
      expect(mockKnexInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: TEST_REQUEST_ID,
          user_id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          reason: 'GDPR request',
          status: 'pending'
        })
      );
    });

    it('should throw error on database failure', async () => {
      mockKnexInsert.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(
        service.requestDataExport(TEST_TENANT_ID, TEST_USER_ID, 'GDPR request')
      ).rejects.toThrow('DB connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to create export request'
      );
    });
  });

  // ===========================================================================
  // requestAccountDeletion Tests
  // ===========================================================================

  describe('requestAccountDeletion', () => {
    it('should create deletion request', async () => {
      const result = await service.requestAccountDeletion(
        TEST_USER_ID,
        'Account no longer needed'
      );

      expect(result.requestId).toBe(TEST_REQUEST_ID);
      expect(result.message).toBe('Account deletion scheduled');
    });

    it('should schedule deletion for 30 days from now', async () => {
      const beforeTime = Date.now();
      const result = await service.requestAccountDeletion(
        TEST_USER_ID,
        'Account no longer needed'
      );
      const afterTime = Date.now();

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(result.scheduledFor.getTime()).toBeGreaterThanOrEqual(beforeTime + thirtyDaysMs - 1000);
      expect(result.scheduledFor.getTime()).toBeLessThanOrEqual(afterTime + thirtyDaysMs + 1000);
    });

    it('should allow cancellation until 29 days', async () => {
      const beforeTime = Date.now();
      const result = await service.requestAccountDeletion(
        TEST_USER_ID,
        'Account no longer needed'
      );

      const twentyNineDaysMs = 29 * 24 * 60 * 60 * 1000;
      expect(result.canCancelUntil.getTime()).toBeGreaterThanOrEqual(beforeTime + twentyNineDaysMs - 1000);
    });

    it('should insert into gdpr_deletion_requests table', async () => {
      await service.requestAccountDeletion(
        TEST_USER_ID,
        'Account no longer needed'
      );

      expect(mockKnexInstance).toHaveBeenCalledWith('gdpr_deletion_requests');
      expect(mockKnexInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: TEST_USER_ID,
          reason: 'Account no longer needed',
          status: 'pending'
        })
      );
    });

    it('should log deletion confirmation', async () => {
      await service.requestAccountDeletion(
        TEST_USER_ID,
        'Account no longer needed'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Deletion requested for user ${TEST_USER_ID}`)
      );
    });

    it('should throw error on database failure', async () => {
      mockKnexInsert.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.requestAccountDeletion(TEST_USER_ID, 'reason')
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to create deletion request'
      );
    });
  });

  // ===========================================================================
  // getExportStatus Tests
  // ===========================================================================

  describe('getExportStatus', () => {
    it('should return null if request not found', async () => {
      mockKnexFirst.mockResolvedValue(null);

      const result = await service.getExportStatus(TEST_TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should query with tenant_id and request_id', async () => {
      mockKnexFirst.mockResolvedValue(null);

      await service.getExportStatus(TEST_TENANT_ID, TEST_REQUEST_ID);

      expect(mockKnexInstance).toHaveBeenCalledWith('privacy_export_requests');
      expect(mockKnexWhere).toHaveBeenCalledWith({
        id: TEST_REQUEST_ID,
        tenant_id: TEST_TENANT_ID
      });
    });

    it('should return export status when found', async () => {
      const mockRequest = {
        id: TEST_REQUEST_ID,
        user_id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        status: 'completed',
        requested_at: new Date('2025-01-01'),
        completed_at: new Date('2025-01-02'),
        download_url: '/exports/file.zip',
        expires_at: new Date('2025-01-09')
      };
      mockKnexFirst.mockResolvedValue(mockRequest);

      const result = await service.getExportStatus(TEST_TENANT_ID, TEST_REQUEST_ID);

      expect(result).toEqual({
        requestId: TEST_REQUEST_ID,
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        status: 'completed',
        createdAt: mockRequest.requested_at,
        completedAt: mockRequest.completed_at,
        downloadUrl: '/exports/file.zip',
        expiresAt: mockRequest.expires_at
      });
    });

    it('should handle pending status without completedAt', async () => {
      const mockRequest = {
        id: TEST_REQUEST_ID,
        user_id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        status: 'pending',
        requested_at: new Date('2025-01-01'),
        completed_at: null,
        download_url: null,
        expires_at: null
      };
      mockKnexFirst.mockResolvedValue(mockRequest);

      const result = await service.getExportStatus(TEST_TENANT_ID, TEST_REQUEST_ID);

      expect(result?.status).toBe('pending');
      expect(result?.completedAt).toBeNull();
      expect(result?.downloadUrl).toBeNull();
    });

    it('should throw and log error on database failure', async () => {
      mockKnexFirst.mockRejectedValue(new Error('DB error'));

      await expect(
        service.getExportStatus(TEST_TENANT_ID, TEST_REQUEST_ID)
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          requestId: TEST_REQUEST_ID,
          tenantId: TEST_TENANT_ID
        }),
        'Failed to get export status'
      );
    });
  });

  // ===========================================================================
  // getDeletionStatus Tests
  // ===========================================================================

  describe('getDeletionStatus', () => {
    it('should return null if request not found', async () => {
      mockKnexFirst.mockResolvedValue(null);

      const result = await service.getDeletionStatus(TEST_TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should query gdpr_deletion_requests table', async () => {
      mockKnexFirst.mockResolvedValue(null);

      await service.getDeletionStatus(TEST_TENANT_ID, TEST_REQUEST_ID);

      expect(mockKnexInstance).toHaveBeenCalledWith('gdpr_deletion_requests');
    });

    it('should return deletion status when found', async () => {
      const requestedAt = new Date('2025-01-01');
      const mockRequest = {
        id: TEST_REQUEST_ID,
        customer_id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        status: 'pending',
        requested_at: requestedAt,
        scheduled_deletion_date: new Date('2025-01-31'),
        completed_at: null
      };
      mockKnexFirst.mockResolvedValue(mockRequest);

      const result = await service.getDeletionStatus(TEST_TENANT_ID, TEST_REQUEST_ID);

      expect(result).toEqual({
        requestId: TEST_REQUEST_ID,
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        status: 'pending',
        createdAt: requestedAt,
        scheduledDeletionDate: new Date('2025-01-31'),
        completedAt: null
      });
    });

    it('should calculate scheduled deletion date if not stored', async () => {
      const requestedAt = new Date('2025-01-01');
      const mockRequest = {
        id: TEST_REQUEST_ID,
        customer_id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        status: 'pending',
        requested_at: requestedAt,
        scheduled_deletion_date: null,
        completed_at: null
      };
      mockKnexFirst.mockResolvedValue(mockRequest);

      const result = await service.getDeletionStatus(TEST_TENANT_ID, TEST_REQUEST_ID);

      // Should be 30 days after requested_at
      const expectedDate = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      expect(result?.scheduledDeletionDate?.getTime()).toBe(expectedDate.getTime());
    });

    it('should return completed status', async () => {
      const mockRequest = {
        id: TEST_REQUEST_ID,
        customer_id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        status: 'completed',
        requested_at: new Date('2025-01-01'),
        scheduled_deletion_date: new Date('2025-01-31'),
        completed_at: new Date('2025-01-31')
      };
      mockKnexFirst.mockResolvedValue(mockRequest);

      const result = await service.getDeletionStatus(TEST_TENANT_ID, TEST_REQUEST_ID);

      expect(result?.status).toBe('completed');
      expect(result?.completedAt).toEqual(new Date('2025-01-31'));
    });

    it('should throw and log error on database failure', async () => {
      mockKnexFirst.mockRejectedValue(new Error('DB error'));

      await expect(
        service.getDeletionStatus(TEST_TENANT_ID, TEST_REQUEST_ID)
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          requestId: TEST_REQUEST_ID,
          tenantId: TEST_TENANT_ID
        }),
        'Failed to get deletion status'
      );
    });
  });

  // ===========================================================================
  // runWithTenantContext Static Method Tests
  // ===========================================================================

  describe('runWithTenantContext', () => {
    it('should be a static method', () => {
      expect(typeof PrivacyExportService.runWithTenantContext).toBe('function');
    });

    it('should execute function with context', () => {
      const result = PrivacyExportService.runWithTenantContext(
        TEST_TENANT_ID,
        'req-123',
        () => 'executed'
      );

      expect(result).toBe('executed');
    });

    it('should return value from callback', () => {
      const result = PrivacyExportService.runWithTenantContext(
        TEST_TENANT_ID,
        'req-123',
        () => ({ data: 'test' })
      );

      expect(result).toEqual({ data: 'test' });
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('privacyExportService singleton', () => {
    it('should export a singleton instance', () => {
      expect(privacyExportService).toBeInstanceOf(PrivacyExportService);
    });
  });
});
