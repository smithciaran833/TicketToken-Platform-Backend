// Mock dependencies BEFORE imports
jest.mock('crypto');
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/cache.service');

import crypto from 'crypto';
import { DuplicateDetectorService, duplicateDetectorService } from '../../../src/services/duplicate-detector.service';
import { db } from '../../../src/config/database';
import { cacheService } from '../../../src/services/cache.service';

describe('services/duplicate-detector.service', () => {
  let service: DuplicateDetectorService;
  let mockDb: jest.Mocked<typeof db>;
  let mockCacheService: jest.Mocked<typeof cacheService>;
  let mockCrypto: jest.Mocked<typeof crypto>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = db as jest.Mocked<typeof db>;
    mockCacheService = cacheService as jest.Mocked<typeof cacheService>;
    mockCrypto = crypto as jest.Mocked<typeof crypto>;

    // Setup default mock chains
    const mockQueryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereNotNull: jest.fn().mockReturnThis(),
      first: jest.fn(),
      select: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
      countDistinct: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
      raw: jest.fn((sql) => sql),
      fn: {
        now: jest.fn().mockReturnValue('2024-01-15T10:00:00Z')
      }
    };

    (mockDb as any).mockImplementation(() => mockQueryBuilder);
    (mockDb as any).raw = mockQueryBuilder.raw;
    (mockDb as any).fn = mockQueryBuilder.fn;

    mockCacheService.get = jest.fn().mockResolvedValue(null);
    mockCacheService.set = jest.fn().mockResolvedValue(true);
    mockCacheService.delete = jest.fn().mockResolvedValue(true);

    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('abc123hash')
    };
    mockCrypto.createHash = jest.fn().mockReturnValue(mockHash as any);

    service = new DuplicateDetectorService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('calculateFileHash', () => {
    it('should calculate SHA-256 hash of buffer', async () => {
      // Arrange
      const buffer = Buffer.from('test content');

      // Act
      const result = await service.calculateFileHash(buffer);

      // Assert
      expect(result).toBe('abc123hash');
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should handle empty buffer', async () => {
      // Arrange
      const buffer = Buffer.from('');

      // Act
      const result = await service.calculateFileHash(buffer);

      // Assert
      expect(result).toBe('abc123hash');
    });

    it('should handle large buffers', async () => {
      // Arrange
      const buffer = Buffer.alloc(10 * 1024 * 1024); // 10MB

      // Act
      const result = await service.calculateFileHash(buffer);

      // Assert
      expect(result).toBe('abc123hash');
    });
  });

  describe('findDuplicateByHash', () => {
    it('should return cached duplicate if available', async () => {
      // Arrange
      const hash = 'abc123';
      const cachedDuplicate = {
        id: 'file-1',
        filename: 'test.jpg',
        hash: 'abc123',
        size: 1024,
        uploadedBy: 'user-1',
        createdAt: new Date()
      };
      mockCacheService.get.mockResolvedValue(cachedDuplicate);

      // Act
      const result = await service.findDuplicateByHash(hash);

      // Assert
      expect(result).toEqual(cachedDuplicate);
      expect(mockCacheService.get).toHaveBeenCalled();
    });

    it('should query database and cache result when not cached', async () => {
      // Arrange
      const hash = 'abc123';
      const mockFile = {
        id: 'file-1',
        filename: 'test.jpg',
        hash_sha256: 'abc123',
        size_bytes: 1024,
        uploaded_by: 'user-1',
        created_at: new Date()
      };

      mockCacheService.get.mockResolvedValue(null);
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.findDuplicateByHash(hash);

      // Assert
      expect(result).toMatchObject({
        id: 'file-1',
        filename: 'test.jpg',
        hash: 'abc123'
      });
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return null when no duplicate found', async () => {
      // Arrange
      mockCacheService.get.mockResolvedValue(null);
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.findDuplicateByHash('nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      mockCacheService.get.mockResolvedValue(null);
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('DB error'))
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.findDuplicateByHash('abc123');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findAllDuplicates', () => {
    it('should find all duplicates of a file', async () => {
      // Arrange
      const fileId = 'file-1';
      const mockFile = {
        id: fileId,
        hash_sha256: 'abc123'
      };
      const mockDuplicates = [
        { id: 'file-2', filename: 'dup1.jpg', hash: 'abc123' },
        { id: 'file-3', filename: 'dup2.jpg', hash: 'abc123' }
      ];

      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile),
        select: jest.fn().mockResolvedValue(mockDuplicates)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.findAllDuplicates(fileId);

      // Assert
      expect(result).toEqual(mockDuplicates);
      expect(result.length).toBe(2);
    });

    it('should return empty array when file not found', async () => {
      // Arrange
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.findAllDuplicates('nonexistent');

      // Assert
      expect(result).toEqual([]);
    });

    it('should return empty array when file has no hash', async () => {
      // Arrange
      const mockFile = {
        id: 'file-1',
        hash_sha256: null
      };
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.findAllDuplicates('file-1');

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      // Arrange
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('DB error'))
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.findAllDuplicates('file-1');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getDuplicateStats', () => {
    it('should calculate duplicate statistics', async () => {
      // Arrange
      const mockGroups = [
        { hash_sha256: 'hash1', count: '3', total_size: '3000' },
        { hash_sha256: 'hash2', count: '2', total_size: '2000' }
      ];
      const mockUniqueFiles = { count: '100' };

      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        countDistinct: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockResolvedValue(mockGroups),
        first: jest.fn().mockResolvedValue(mockUniqueFiles)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getDuplicateStats();

      // Assert
      expect(result.totalDuplicates).toBeGreaterThan(0);
      expect(result.duplicateGroups).toBe(2);
      expect(result.uniqueFiles).toBe(100);
    });

    it('should return zero stats on error', async () => {
      // Arrange
      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockRejectedValue(new Error('DB error'))
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getDuplicateStats();

      // Assert
      expect(result).toEqual({
        totalDuplicates: 0,
        wastedSpace: 0,
        uniqueFiles: 0,
        duplicateGroups: 0
      });
    });

    it('should calculate wasted space correctly', async () => {
      // Arrange
      const mockGroups = [
        { hash_sha256: 'hash1', count: '3', total_size: '3000' } // 2 * 1000 = 2000 wasted
      ];
      const mockUniqueFiles = { count: '50' };

      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        countDistinct: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockResolvedValue(mockGroups),
        first: jest.fn().mockResolvedValue(mockUniqueFiles)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getDuplicateStats();

      // Assert
      expect(result.wastedSpace).toBeGreaterThan(0);
    });
  });

  describe('getDuplicateGroups', () => {
    it('should return duplicate file groups', async () => {
      // Arrange
      const mockHashes = [
        { hash_sha256: 'hash1', count: '3', total_size: '3000' }
      ];
      const mockFiles = [
        { id: 'file-1', filename: 'f1.jpg', hash: 'hash1' },
        { id: 'file-2', filename: 'f2.jpg', hash: 'hash1' },
        { id: 'file-3', filename: 'f3.jpg', hash: 'hash1' }
      ];

      let callCount = 0;
      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis()
      };

      (mockDb as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          mockQueryBuilder.limit = jest.fn().mockResolvedValue(mockHashes);
        } else {
          mockQueryBuilder.orderBy = jest.fn().mockResolvedValue(mockFiles);
        }
        return mockQueryBuilder;
      });

      // Act
      const result = await service.getDuplicateGroups(50);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0]!.hash).toBe('hash1');
      expect(result[0]!.count).toBe(3);
      expect(result[0]!.files.length).toBe(3);
    });

    it('should respect limit parameter', async () => {
      // Arrange
      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      await service.getDuplicateGroups(25);

      // Assert
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(25);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockRejectedValue(new Error('DB error'))
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.getDuplicateGroups();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('deduplicateGroup', () => {
    it('should deduplicate files keeping the oldest', async () => {
      // Arrange
      const hash = 'abc123';
      const mockFiles = [
        { id: 'file-1', created_at: '2024-01-01', size_bytes: 1000 },
        { id: 'file-2', created_at: '2024-01-02', size_bytes: 1000 },
        { id: 'file-3', created_at: '2024-01-03', size_bytes: 1000 }
      ];

      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockFiles),
        update: jest.fn().mockResolvedValue(1)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.deduplicateGroup(hash);

      // Assert
      expect(result.kept).toBe('file-1');
      expect(result.removed).toEqual(['file-2', 'file-3']);
      expect(result.spaceSaved).toBe(2000);
      expect(mockCacheService.delete).toHaveBeenCalled();
    });

    it('should return empty result for single file', async () => {
      // Arrange
      const mockFiles = [
        { id: 'file-1', created_at: '2024-01-01', size_bytes: 1000 }
      ];

      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockFiles)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.deduplicateGroup('hash');

      // Assert
      expect(result.kept).toBe('');
      expect(result.removed).toEqual([]);
      expect(result.spaceSaved).toBe(0);
    });

    it('should handle errors', async () => {
      // Arrange
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockRejectedValue(new Error('DB error'))
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act & Assert
      await expect(service.deduplicateGroup('hash')).rejects.toThrow();
    });
  });

  describe('deduplicateAll', () => {
    it('should batch deduplicate all files', async () => {
      // Arrange
      const mockGroups = [
        { hash: 'hash1', count: 3, totalSize: 3000, files: [] }
      ];

      // Mock getDuplicateGroups
      jest.spyOn(service, 'getDuplicateGroups').mockResolvedValue(mockGroups);
      jest.spyOn(service, 'deduplicateGroup').mockResolvedValue({
        kept: 'file-1',
        removed: ['file-2', 'file-3'],
        spaceSaved: 2000
      });

      // Act
      const result = await service.deduplicateAll();

      // Assert
      expect(result.totalGroups).toBe(1);
      expect(result.totalRemoved).toBe(2);
      expect(result.totalSpaceSaved).toBe(2000);
    });

    it('should continue on individual group errors', async () => {
      // Arrange
      const mockGroups = [
        { hash: 'hash1', count: 2, totalSize: 2000, files: [] },
        { hash: 'hash2', count: 2, totalSize: 2000, files: [] }
      ];

      jest.spyOn(service, 'getDuplicateGroups').mockResolvedValue(mockGroups);
      jest.spyOn(service, 'deduplicateGroup')
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce({
          kept: 'file-3',
          removed: ['file-4'],
          spaceSaved: 1000
        });

      // Act
      const result = await service.deduplicateAll();

      // Assert
      expect(result.totalRemoved).toBe(1);
      expect(result.totalSpaceSaved).toBe(1000);
    });
  });

  describe('updateFileHash', () => {
    it('should update file hash', async () => {
      // Arrange
      const fileId = 'file-1';
      const buffer = Buffer.from('content');
      
      const mockQueryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      await service.updateFileHash(fileId, buffer);

      // Assert
      expect(mockQueryBuilder.update).toHaveBeenCalledWith({
        hash_sha256: 'abc123hash'
      });
    });
  });

  describe('scanForMissingHashes', () => {
    it('should find files without hashes', async () => {
      // Arrange
      const mockFiles = [
        { id: 'file-1' },
        { id: 'file-2' }
      ];

      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockFiles)
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.scanForMissingHashes();

      // Assert
      expect(result).toEqual(['file-1', 'file-2']);
      expect(result.length).toBe(2);
    });

    it('should return empty array when all files have hashes', async () => {
      // Arrange
      const mockQueryBuilder: any = {
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await service.scanForMissingHashes();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findSimilarImages', () => {
    it('should return placeholder for similar images', async () => {
      // Act
      const result = await service.findSimilarImages('file-1', 0.9);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle different thresholds', async () => {
      // Act
      const result = await service.findSimilarImages('file-1', 0.5);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(duplicateDetectorService).toBeInstanceOf(DuplicateDetectorService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = duplicateDetectorService;
      const instance2 = duplicateDetectorService;
      expect(instance1).toBe(instance2);
    });
  });
});
