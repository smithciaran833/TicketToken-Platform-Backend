// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/utils/logger');

import { FileSearchService, fileSearchService } from '../../../src/services/file-search.service';
import { getPool } from '../../../src/config/database.config';

describe('services/file-search.service', () => {
  let service: FileSearchService;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock pool
    mockPool = {
      query: jest.fn()
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
    
    service = new FileSearchService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('search', () => {
    it('should return files with basic filters', async () => {
      // Arrange
      const mockFiles = [
        { id: 'file-1', filename: 'test.jpg', created_at: new Date() },
        { id: 'file-2', filename: 'doc.pdf', created_at: new Date() }
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockFiles }); // Data query

      // Act
      const result = await service.search({}, 100, 0);

      // Assert
      expect(result).toEqual({
        files: mockFiles,
        total: 2,
        limit: 100,
        offset: 0
      });
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should filter by filename with ILIKE', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ filename: 'test' }, 100, 0);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('filename ILIKE $1'),
        expect.arrayContaining(['%test%', 100, 0])
      );
    });

    it('should filter by mime type', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ mimeType: 'image/jpeg' }, 50, 10);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('mime_type LIKE $1'),
        expect.arrayContaining(['image/jpeg%', 50, 10])
      );
    });

    it('should filter by entity type and ID', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ entityType: 'event', entityId: 'event-123' });

      // Assert
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('entity_type = $1');
      expect(firstCall[0]).toContain('entity_id = $2');
      expect(firstCall[1]).toContain('event');
      expect(firstCall[1]).toContain('event-123');
    });

    it('should filter by uploaded by', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ uploadedBy: 'user-456' });

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('uploaded_by = $1'),
        expect.arrayContaining(['user-456'])
      );
    });

    it('should filter by tags array', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ tags: ['important', 'verified'] });

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('tags && $1'),
        expect.arrayContaining([['important', 'verified']])
      );
    });

    it('should filter by size range', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ minSize: 1024, maxSize: 1048576 });

      // Assert
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('size_bytes >= $1');
      expect(firstCall[0]).toContain('size_bytes <= $2');
      expect(firstCall[1]).toContain(1024);
      expect(firstCall[1]).toContain(1048576);
    });

    it('should filter by date range', async () => {
      // Arrange
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ startDate, endDate });

      // Assert
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('created_at >= $1');
      expect(firstCall[0]).toContain('created_at <= $2');
      expect(firstCall[1]).toContain(startDate);
      expect(firstCall[1]).toContain(endDate);
    });

    it('should filter by status', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '8' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ status: 'ready' });

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        expect.arrayContaining(['ready'])
      );
    });

    it('should filter by isPublic boolean', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '4' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({ isPublic: true });

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_public = $1'),
        expect.arrayContaining([true])
      );
    });

    it('should combine multiple filters', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({
        filename: 'report',
        mimeType: 'application/pdf',
        status: 'ready',
        minSize: 1024
      });

      // Assert
      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('filename ILIKE');
      expect(firstCall[0]).toContain('mime_type LIKE');
      expect(firstCall[0]).toContain('status =');
      expect(firstCall[0]).toContain('size_bytes >=');
    });

    it('should apply pagination with limit and offset', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({}, 25, 50);

      // Assert
      const secondCall = mockPool.query.mock.calls[1];
      expect(secondCall[0]).toContain('LIMIT');
      expect(secondCall[0]).toContain('OFFSET');
      expect(secondCall[1]).toContain(25);
      expect(secondCall[1]).toContain(50);
    });

    it('should return total count from count query', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '42' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      const result = await service.search({});

      // Assert
      expect(result.total).toBe(42);
    });

    it('should order by created_at DESC', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({});

      // Assert
      const secondCall = mockPool.query.mock.calls[1];
      expect(secondCall[0]).toContain('ORDER BY created_at DESC');
    });

    it('should handle null pool gracefully', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act
      const result = await service.search({});

      // Assert
      expect(result).toEqual({ files: [], total: 0 });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should exclude deleted files', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.search({});

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('searchByContent', () => {
    it('should search in extracted text', async () => {
      // Arrange
      const mockResults = [
        { id: 'file-1', filename: 'doc.pdf', extracted_text: 'Contract terms...' }
      ];
      mockPool.query.mockResolvedValue({ rows: mockResults });

      // Act
      const result = await service.searchByContent('contract');

      // Assert
      expect(result).toEqual(mockResults);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE $1'),
        ['%contract%', 100]
      );
    });

    it('should join with document_metadata table', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.searchByContent('search term');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN document_metadata dm'),
        expect.any(Array)
      );
    });

    it('should respect limit parameter', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.searchByContent('test', 50);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['%test%', 50]
      );
    });

    it('should return empty array when pool is null', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act
      const result = await service.searchByContent('test');

      // Assert
      expect(result).toEqual([]);
    });

    it('should exclude deleted files', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.searchByContent('test');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('getRecentFiles', () => {
    it('should get recent files with default limit', async () => {
      // Arrange
      const mockFiles = [
        { id: 'file-1', created_at: new Date() },
        { id: 'file-2', created_at: new Date() }
      ];
      mockPool.query.mockResolvedValue({ rows: mockFiles });

      // Act
      const result = await service.getRecentFiles();

      // Assert
      expect(result).toEqual(mockFiles);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [10]
      );
    });

    it('should respect custom limit parameter', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.getRecentFiles(25);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [25]
      );
    });

    it('should exclude deleted files', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.getRecentFiles();

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should return empty array when pool is null', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act
      const result = await service.getRecentFiles();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getMostAccessed', () => {
    it('should aggregate access counts', async () => {
      // Arrange
      const mockFiles = [
        { id: 'file-1', filename: 'popular.jpg', access_count: '150' },
        { id: 'file-2', filename: 'trending.pdf', access_count: '95' }
      ];
      mockPool.query.mockResolvedValue({ rows: mockFiles });

      // Act
      const result = await service.getMostAccessed();

      // Assert
      expect(result).toEqual(mockFiles);
    });

    it('should join with file_access_logs', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.getMostAccessed();

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN file_access_logs fal'),
        expect.any(Array)
      );
    });

    it('should group by file id', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.getMostAccessed();

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY f.id'),
        expect.any(Array)
      );
    });

    it('should order by access count DESC', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.getMostAccessed();

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY access_count DESC'),
        expect.any(Array)
      );
    });

    it('should respect limit parameter', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.getMostAccessed(20);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [20]
      );
    });

    it('should exclude deleted files', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await service.getMostAccessed();

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should return empty array when pool is null', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act
      const result = await service.getMostAccessed();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('singleton instance', () => {
    it('should export fileSearchService instance', () => {
      expect(fileSearchService).toBeInstanceOf(FileSearchService);
    });

    it('should be the same instance across calls', () => {
      const instance1 = fileSearchService;
      const instance2 = fileSearchService;
      expect(instance1).toBe(instance2);
    });
  });
});
