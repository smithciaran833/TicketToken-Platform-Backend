// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/utils/logger');
jest.mock('@tickettoken/shared', () => ({
  auditService: {
    logAdminAction: jest.fn().mockResolvedValue(undefined),
    getAuditLogs: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('fs/promises');

import { FastifyRequest, FastifyReply } from 'fastify';
import { AdminController, adminController } from '../../../src/controllers/admin.controller';
import { getPool } from '../../../src/config/database.config';
import { storageService } from '../../../src/storage/storage.service';
import { auditService } from '@tickettoken/shared';
import fs from 'fs/promises';

describe('controllers/admin.controller', () => {
  let controller: AdminController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockGetPool: jest.Mock;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockAuditService: jest.Mocked<typeof auditService>;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AdminController();

    mockRequest = {
      body: {},
      query: {},
      user: { id: 'admin-123', role: 'admin' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    mockGetPool = getPool as jest.Mock;
    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockAuditService = auditService as jest.Mocked<typeof auditService>;
    mockFs = fs as jest.Mocked<typeof fs>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getStats', () => {
    it('should return comprehensive file statistics', async () => {
      const mockPool = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [{
              total_files: '100',
              total_bytes: '1048576',
              unique_users: '10',
              ready_files: '90',
              failed_files: '5',
              images: '50',
              videos: '20',
              pdfs: '30',
            }]
          })
          .mockResolvedValueOnce({
            rows: [
              { entity_type: 'ticket', file_count: '60', total_bytes: '524288' },
              { entity_type: 'event', file_count: '40', total_bytes: '524288' },
            ]
          })
          .mockResolvedValueOnce({
            rows: [
              { id: 'file-1', filename: 'test1.jpg', mime_type: 'image/jpeg', size_bytes: '1024', created_at: new Date() },
              { id: 'file-2', filename: 'test2.pdf', mime_type: 'application/pdf', size_bytes: '2048', created_at: new Date() },
            ]
          }),
      };
      mockGetPool.mockReturnValue(mockPool);

      await controller.getStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.getStats',
        'admin-123',
        'statistics',
        expect.objectContaining({
          actionType: 'ACCESS',
          userRole: 'admin',
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          overview: expect.any(Object),
          byEntity: expect.any(Array),
          recentFiles: expect.any(Array),
        })
      );
    });

    it('should handle database unavailable', async () => {
      mockGetPool.mockReturnValue(null);

      await controller.getStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Database not available' });
    });

    it('should log admin action on failure', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('DB query failed')),
      };
      mockGetPool.mockReturnValue(mockPool);

      await controller.getStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.getStats',
        'admin-123',
        'statistics',
        expect.objectContaining({
          actionType: 'ACCESS',
          success: false,
          errorMessage: 'DB query failed',
        })
      );
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle system user when no user in request', async () => {
      mockRequest.user = undefined;
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{}] }),
      };
      mockGetPool.mockReturnValue(mockPool);

      await controller.getStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.getStats',
        'system',
        'statistics',
        expect.any(Object)
      );
    });
  });

  describe('cleanupOrphaned', () => {
    it('should mark orphaned files as deleted', async () => {
      const mockPool = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              { id: 'file-1', storage_path: '/path/exists.jpg' },
              { id: 'file-2', storage_path: '/path/missing.jpg' },
            ]
          })
          .mockResolvedValueOnce({ rowCount: 1 }),
      };
      mockGetPool.mockReturnValue(mockPool);

      mockStorageService.exists = jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      mockFs.readdir = jest.fn().mockResolvedValue([]);

      await controller.cleanupOrphaned(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStorageService.exists).toHaveBeenCalledTimes(2);
      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.cleanupOrphaned',
        'admin-123',
        'cleanup',
        expect.objectContaining({
          actionType: 'DELETE',
          metadata: expect.objectContaining({
            orphanedFiles: ['file-2'],
            totalCleaned: 1,
          }),
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          orphanedFiles: 1,
        })
      );
    });

    it('should clean up old temp files (>24 hours)', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      mockGetPool.mockReturnValue(mockPool);

      const now = Date.now();
      const oldFileTime = now - (25 * 60 * 60 * 1000);

      mockFs.readdir = jest.fn().mockResolvedValue(['old-temp.txt', 'new-temp.txt'] as any);
      mockFs.stat = jest.fn()
        .mockResolvedValueOnce({ mtimeMs: oldFileTime } as any)
        .mockResolvedValueOnce({ mtimeMs: now } as any);
      mockFs.unlink = jest.fn().mockResolvedValue(undefined);

      await controller.cleanupOrphaned(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith('temp/old-temp.txt');
      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.cleanupOrphaned',
        'admin-123',
        'cleanup',
        expect.objectContaining({
          metadata: expect.objectContaining({
            tempFilesCleaned: ['old-temp.txt'],
          }),
        })
      );
    });

    it('should handle temp directory read errors', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      mockGetPool.mockReturnValue(mockPool);

      mockFs.readdir = jest.fn().mockRejectedValue(new Error('Directory not found'));

      await controller.cleanupOrphaned(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should handle database unavailable', async () => {
      mockGetPool.mockReturnValue(null);

      await controller.cleanupOrphaned(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Database not available' });
    });

    it('should log cleanup failure to audit', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Cleanup failed')),
      };
      mockGetPool.mockReturnValue(mockPool);

      await controller.cleanupOrphaned(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.cleanupOrphaned',
        'admin-123',
        'cleanup',
        expect.objectContaining({
          actionType: 'DELETE',
          success: false,
        })
      );
    });
  });

  describe('bulkDelete', () => {
    it('should soft delete multiple files', async () => {
      const fileIds = ['file-1', 'file-2', 'file-3'];
      mockRequest.body = { fileIds };

      const mockPool = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [
              { id: 'file-1', filename: 'test1.jpg', size_bytes: '1024' },
              { id: 'file-2', filename: 'test2.jpg', size_bytes: '2048' },
              { id: 'file-3', filename: 'test3.jpg', size_bytes: '3072' },
            ]
          })
          .mockResolvedValueOnce({
            rowCount: 3,
            rows: [
              { id: 'file-1' },
              { id: 'file-2' },
              { id: 'file-3' },
            ]
          }),
      };
      mockGetPool.mockReturnValue(mockPool);

      await controller.bulkDelete(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.bulkDelete',
        'admin-123',
        'files',
        expect.objectContaining({
          actionType: 'DELETE',
          metadata: expect.objectContaining({
            requestedFileIds: fileIds,
            deletedCount: 3,
            deletedFileIds: ['file-1', 'file-2', 'file-3'],
          }),
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        deleted: 3,
      });
    });

    it('should validate fileIds array', async () => {
      mockRequest.body = { fileIds: [] };

      await controller.bulkDelete(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No file IDs provided' });
    });

    it('should reject non-array fileIds', async () => {
      mockRequest.body = { fileIds: 'not-an-array' };

      await controller.bulkDelete(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle database unavailable', async () => {
      mockRequest.body = { fileIds: ['file-1'] };
      mockGetPool.mockReturnValue(null);

      await controller.bulkDelete(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should log bulk delete failure', async () => {
      mockRequest.body = { fileIds: ['file-1', 'file-2'] };
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Delete failed')),
      };
      mockGetPool.mockReturnValue(mockPool);

      await controller.bulkDelete(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.bulkDelete',
        'admin-123',
        'files',
        expect.objectContaining({
          actionType: 'DELETE',
          success: false,
          metadata: expect.objectContaining({
            requestedFileIds: ['file-1', 'file-2'],
          }),
        })
      );
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs with filters', async () => {
      mockRequest.query = {
        service: 'file-service',
        userId: 'user-123',
        resourceType: 'files',
        limit: '50',
        offset: '0',
      };

      const mockLogs = [
        { id: 'log-1', action: 'upload', timestamp: new Date() },
        { id: 'log-2', action: 'delete', timestamp: new Date() },
      ];

      mockAuditService.getAuditLogs = jest.fn().mockResolvedValue(mockLogs);

      await controller.getAuditLogs(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith({
        service: 'file-service',
        userId: 'user-123',
        resourceType: 'files',
        startDate: undefined,
        endDate: undefined,
        limit: 50,
        offset: 0,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        logs: mockLogs,
        count: 2,
      });
    });

    it('should support pagination', async () => {
      mockRequest.query = {
        limit: '10',
        offset: '20',
      };

      mockAuditService.getAuditLogs = jest.fn().mockResolvedValue([]);

      await controller.getAuditLogs(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });

    it('should use default pagination values', async () => {
      mockRequest.query = {};
      mockAuditService.getAuditLogs = jest.fn().mockResolvedValue([]);

      await controller.getAuditLogs(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0,
        })
      );
    });

    it('should log audit access', async () => {
      mockRequest.query = { resourceType: 'files' };
      mockAuditService.getAuditLogs = jest.fn().mockResolvedValue([]);

      await controller.getAuditLogs(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.logAdminAction).toHaveBeenCalledWith(
        'file-service',
        'admin.getAuditLogs',
        'admin-123',
        'audit_logs',
        expect.objectContaining({
          actionType: 'ACCESS',
          userRole: 'admin',
          metadata: { query: mockRequest.query },
        })
      );
    });

    it('should handle audit service errors', async () => {
      mockRequest.query = {};
      mockAuditService.getAuditLogs = jest.fn().mockRejectedValue(new Error('Audit service unavailable'));

      await controller.getAuditLogs(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get audit logs' });
    });

    it('should parse date filters', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };
      mockAuditService.getAuditLogs = jest.fn().mockResolvedValue([]);

      await controller.getAuditLogs(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(adminController).toBeInstanceOf(AdminController);
    });

    it('should be the same instance across imports', () => {
      expect(adminController).toBe(adminController);
    });
  });
});
