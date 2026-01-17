jest.mock('../../../src/config/database.config');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/utils/logger');
jest.mock('fs/promises');

import { Pool } from 'pg';
import { CleanupService, cleanupService } from '../../../src/services/cleanup.service';
import * as databaseConfig from '../../../src/config/database.config';
import { storageService } from '../../../src/storage/storage.service';
import fs from 'fs/promises';

describe('services/cleanup.service', () => {
  let service: CleanupService;
  let mockPool: jest.Mocked<Pool>;
  let mockGetPool: jest.MockedFunction<typeof databaseConfig.getPool>;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    } as unknown as jest.Mocked<Pool>;

    mockGetPool = databaseConfig.getPool as jest.MockedFunction<typeof databaseConfig.getPool>;
    mockGetPool.mockReturnValue(mockPool);

    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockStorageService.delete = jest.fn().mockResolvedValue(undefined);

    mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.readdir = jest.fn().mockResolvedValue([]);
    mockFs.stat = jest.fn();
    mockFs.unlink = jest.fn().mockResolvedValue(undefined);

    service = new CleanupService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cleanupOrphanedFiles', () => {
    it('should clean up deleted files older than 7 days', async () => {
      const mockFiles = [
        { id: 'file-1', storage_path: '/uploads/file1.jpg' },
        { id: 'file-2', storage_path: '/uploads/file2.pdf' }
      ];

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockFiles, rowCount: 2 })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.cleanupOrphanedFiles();

      expect(result.cleaned).toBe(2);
      expect(mockStorageService.delete).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM files WHERE id = $1'), ['file-1']);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM files WHERE id = $1'), ['file-2']);
    });

    it('should return 0 when pool is unavailable', async () => {
      mockGetPool.mockReturnValue(null as unknown as Pool);
      const result = await service.cleanupOrphanedFiles();
      expect(result.cleaned).toBe(0);
    });

    it('should handle storage deletion errors gracefully', async () => {
      const mockFiles = [{ id: 'file-1', storage_path: '/uploads/file1.jpg' }];
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: mockFiles, rowCount: 1 });
      mockStorageService.delete.mockRejectedValue(new Error('Storage error'));
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.cleanupOrphanedFiles();
      expect(result.cleaned).toBe(1);
    });

    it('should continue cleanup on individual file errors', async () => {
      const mockFiles = [
        { id: 'file-1', storage_path: '/uploads/file1.jpg' },
        { id: 'file-2', storage_path: '/uploads/file2.jpg' }
      ];
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: mockFiles, rowCount: 2 });
      (mockPool.query as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.cleanupOrphanedFiles();
      expect(result.cleaned).toBe(1);
    });

    it('should clean expired upload sessions', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
      await service.cleanupOrphanedFiles();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE upload_sessions'));
    });

    it('should clean old access logs', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
      await service.cleanupOrphanedFiles();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM file_access_logs'));
    });

    it('should handle no files to clean', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await service.cleanupOrphanedFiles();
      expect(result.cleaned).toBe(0);
    });
  });

  describe('cleanupTempFiles', () => {
    it('should clean temp files older than 24 hours', async () => {
      const now = Date.now();
      const oldTime = now - (25 * 60 * 60 * 1000);
      mockFs.readdir.mockResolvedValue(['file1.tmp', 'file2.tmp'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: oldTime } as any);

      const result = await service.cleanupTempFiles();
      expect(result.cleaned).toBe(2);
      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should not delete recent temp files', async () => {
      const now = Date.now();
      const recentTime = now - (1 * 60 * 60 * 1000);
      mockFs.readdir.mockResolvedValue(['file1.tmp'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: recentTime } as any);

      const result = await service.cleanupTempFiles();
      expect(result.cleaned).toBe(0);
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should handle empty temp directory', async () => {
      mockFs.readdir.mockResolvedValue([] as any);
      const result = await service.cleanupTempFiles();
      expect(result.cleaned).toBe(0);
    });

    it('should handle file system errors', async () => {
      mockFs.readdir.mockRejectedValue(new Error('FS error'));
      const result = await service.cleanupTempFiles();
      expect(result.cleaned).toBe(0);
    });

    it('should continue on individual file deletion errors', async () => {
      const now = Date.now();
      const oldTime = now - (25 * 60 * 60 * 1000);
      mockFs.readdir.mockResolvedValue(['file1.tmp', 'file2.tmp'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: oldTime } as any);
      mockFs.unlink
        .mockRejectedValueOnce(new Error('Delete error'))
        .mockResolvedValueOnce(undefined);

      await service.cleanupTempFiles();
      
      // Verify it continued processing both files after the first error
      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed old and new files', async () => {
      const now = Date.now();
      const oldTime = now - (25 * 60 * 60 * 1000);
      const newTime = now - (1 * 60 * 60 * 1000);
      mockFs.readdir.mockResolvedValue(['old.tmp', 'new.tmp'] as any);
      mockFs.stat
        .mockResolvedValueOnce({ mtimeMs: oldTime } as any)
        .mockResolvedValueOnce({ mtimeMs: newTime } as any);

      const result = await service.cleanupTempFiles();
      expect(result.cleaned).toBe(1);
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
    });
  });

  describe('calculateStorageUsage', () => {
    it('should calculate storage usage by entity', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
      await service.calculateStorageUsage();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO storage_usage'));
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (entity_type, entity_id) DO UPDATE'));
    });

    it('should not run when pool is unavailable', async () => {
      mockGetPool.mockReturnValue(null as unknown as Pool);
      await service.calculateStorageUsage();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should calculate image bytes separately', async () => {
      await service.calculateStorageUsage();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("mime_type LIKE 'image/%'"));
    });

    it('should calculate document bytes separately', async () => {
      await service.calculateStorageUsage();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("mime_type LIKE '%pdf%'"));
    });

    it('should calculate video bytes separately', async () => {
      await service.calculateStorageUsage();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("mime_type LIKE 'video/%'"));
    });

    it('should group by entity type and id', async () => {
      await service.calculateStorageUsage();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('GROUP BY entity_type, entity_id'));
    });
  });

  describe('enforceStorageLimits', () => {
    it('should check for entities exceeding limits', async () => {
      const mockEntities = [{ entity_type: 'user', entity_id: 'user-1', total_bytes: 1100, max_bytes: 1000 }];
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockEntities, rowCount: 1 });
      await service.enforceStorageLimits();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('su.total_bytes > su.max_bytes'));
    });

    it('should not run when pool is unavailable', async () => {
      mockGetPool.mockReturnValue(null as unknown as Pool);
      await service.enforceStorageLimits();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle entities with no exceeded limits', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
      await expect(service.enforceStorageLimits()).resolves.not.toThrow();
    });

    it('should process multiple entities exceeding limits', async () => {
      const mockEntities = [
        { entity_type: 'user', entity_id: 'user-1', total_bytes: 1100, max_bytes: 1000 },
        { entity_type: 'venue', entity_id: 'venue-1', total_bytes: 2100, max_bytes: 2000 }
      ];
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockEntities, rowCount: 2 });
      await service.enforceStorageLimits();
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(cleanupService).toBeInstanceOf(CleanupService);
    });

    it('should be the same instance across imports', () => {
      expect(cleanupService).toBe(cleanupService);
    });
  });
});
