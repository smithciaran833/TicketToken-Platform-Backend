import { DuplicateDetectorService } from '../../../src/services/duplicate-detector.service';
import { db } from '../../../src/config/database';
import crypto from 'crypto';

jest.mock('../../../src/config/database');

describe('DuplicateDetectorService', () => {
  let service: DuplicateDetectorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DuplicateDetectorService();
  });

  describe('calculateFileHash', () => {
    it('should calculate SHA-256 hash correctly', async () => {
      const buffer = Buffer.from('test content');
      const hash = await service.calculateFileHash(buffer);
      
      const expected = crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex');
      
      expect(hash).toBe(expected);
      expect(hash).toHaveLength(64); // SHA-256 is 64 hex chars
    });

    it('should produce different hashes for different content', async () => {
      const buffer1 = Buffer.from('content1');
      const buffer2 = Buffer.from('content2');
      
      const hash1 = await service.calculateFileHash(buffer1);
      const hash2 = await service.calculateFileHash(buffer2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash for same content', async () => {
      const buffer = Buffer.from('same content');
      
      const hash1 = await service.calculateFileHash(buffer);
      const hash2 = await service.calculateFileHash(buffer);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('findDuplicateByHash', () => {
    it('should find existing file with same hash', async () => {
      const testHash = 'abc123hash';
      const mockFile = {
        id: 'file-123',
        filename: 'image.jpg',
        hash_sha256: testHash,
        size_bytes: 1024,
        uploaded_by: 'user-1',
        created_at: new Date()
      };

      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      });

      const result = await service.findDuplicateByHash(testHash);

      expect(result).toBeDefined();
      expect(result?.id).toBe('file-123');
      expect(result?.hash).toBe(testHash);
    });

    it('should return null if no duplicate found', async () => {
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const result = await service.findDuplicateByHash('nonexistent-hash');

      expect(result).toBeNull();
    });
  });

  describe('getDuplicateStats', () => {
    it('should calculate duplicate statistics correctly', async () => {
      const mockDuplicates = [
        { hash_sha256: 'hash1', count: '3', total_size: '3000' },
        { hash_sha256: 'hash2', count: '2', total_size: '2000' }
      ];

      const mockUniqueCount = { count: '100' };

      (db as any).mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockResolvedValue(mockDuplicates),
        countDistinct: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUniqueCount)
      });

      const stats = await service.getDuplicateStats();

      expect(stats.totalDuplicates).toBe(3); // (3-1) + (2-1) = 3
      expect(stats.duplicateGroups).toBe(2);
      expect(stats.uniqueFiles).toBe(100);
      expect(stats.wastedSpace).toBeGreaterThan(0);
    });

    it('should handle no duplicates', async () => {
      (db as any).mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockResolvedValue([]),
        countDistinct: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ count: '50' })
      });

      const stats = await service.getDuplicateStats();

      expect(stats.totalDuplicates).toBe(0);
      expect(stats.duplicateGroups).toBe(0);
      expect(stats.wastedSpace).toBe(0);
    });
  });

  describe('getDuplicateGroups', () => {
    it('should return grouped duplicates', async () => {
      const mockHashes = [
        { hash_sha256: 'hash1', count: '3', total_size: '3000000' }
      ];

      const mockFiles = [
        {
          id: 'file-1',
          filename: 'file1.jpg',
          hash_sha256: 'hash1',
          size_bytes: 1000000,
          uploaded_by: 'user-1',
          created_at: new Date('2024-01-01')
        },
        {
          id: 'file-2',
          filename: 'file2.jpg',
          hash_sha256: 'hash1',
          size_bytes: 1000000,
          uploaded_by: 'user-2',
          created_at: new Date('2024-01-02')
        }
      ];

      (db as any).mockReturnValueOnce({
        whereNull: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockHashes)
      });

      (db as any).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockFiles)
      });

      const groups = await service.getDuplicateGroups(50);

      expect(groups).toHaveLength(1);
      expect(groups[0].hash).toBe('hash1');
      expect(groups[0].count).toBe(3);
      expect(groups[0].files).toHaveLength(2);
    });
  });

  describe('deduplicateGroup', () => {
    it('should keep oldest file and mark others as deduplicated', async () => {
      const testHash = 'duplicate-hash';
      const mockFiles = [
        {
          id: 'file-1',
          hash_sha256: testHash,
          size_bytes: 1000,
          created_at: new Date('2024-01-01')
        },
        {
          id: 'file-2',
          hash_sha256: testHash,
          size_bytes: 1000,
          created_at: new Date('2024-01-02')
        },
        {
          id: 'file-3',
          hash_sha256: testHash,
          size_bytes: 1000,
          created_at: new Date('2024-01-03')
        }
      ];

      (db as any).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockFiles)
      });

      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      });

      const result = await service.deduplicateGroup(testHash);

      expect(result.kept).toBe('file-1'); // Oldest
      expect(result.removed).toContain('file-2');
      expect(result.removed).toContain('file-3');
      expect(result.spaceSaved).toBe(2000); // 2 files * 1000 bytes
    });

    it('should not deduplicate if only one file', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          hash_sha256: 'unique-hash',
          size_bytes: 1000,
          created_at: new Date()
        }
      ];

      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockFiles)
      });

      const result = await service.deduplicateGroup('unique-hash');

      expect(result.kept).toBe('');
      expect(result.removed).toHaveLength(0);
      expect(result.spaceSaved).toBe(0);
    });
  });

  describe('updateFileHash', () => {
    it('should update file hash in database', async () => {
      const fileId = 'file-123';
      const buffer = Buffer.from('content');
      const expectedHash = crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      });

      await service.updateFileHash(fileId, buffer);

      expect(db).toHaveBeenCalledWith('files');
    });
  });

  describe('scanForMissingHashes', () => {
    it('should return files without hashes', async () => {
      const mockFiles = [
        { id: 'file-1' },
        { id: 'file-2' },
        { id: 'file-3' }
      ];

      (db as any).mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockFiles)
      });

      const fileIds = await service.scanForMissingHashes();

      expect(fileIds).toHaveLength(3);
      expect(fileIds).toContain('file-1');
      expect(fileIds).toContain('file-2');
      expect(fileIds).toContain('file-3');
    });

    it('should return empty array if all files have hashes', async () => {
      (db as any).mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      });

      const fileIds = await service.scanForMissingHashes();

      expect(fileIds).toHaveLength(0);
    });
  });
});
