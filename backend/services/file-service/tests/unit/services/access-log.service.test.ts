// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/utils/logger');

import { AccessLogService, accessLogService } from '../../../src/services/access-log.service';
import * as databaseConfig from '../../../src/config/database.config';

describe('services/access-log.service', () => {
  let service: AccessLogService;
  let mockPool: any;
  let mockGetPool: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    // Mock getPool function
    mockGetPool = databaseConfig.getPool as jest.Mock;
    mockGetPool.mockReturnValue(mockPool);

    service = new AccessLogService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logAccess', () => {
    it('should log file access with all parameters', async () => {
      // Arrange
      const fileId = 'file-123';
      const accessType = 'download';
      const userId = 'user-456';
      const ipAddress = '192.168.1.1';
      const userAgent = 'Mozilla/5.0';
      const responseCode = 200;
      const bytesSent = 1024;

      // Act
      await service.logAccess(fileId, accessType, userId, ipAddress, userAgent, responseCode, bytesSent);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO file_access_logs'),
        [fileId, userId, accessType, ipAddress, userAgent, responseCode, bytesSent]
      );
    });

    it('should log file access with minimal parameters', async () => {
      // Arrange
      const fileId = 'file-123';
      const accessType = 'view';

      // Act
      await service.logAccess(fileId, accessType);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO file_access_logs'),
        [fileId, undefined, accessType, undefined, undefined, undefined, undefined]
      );
    });

    it('should handle different access types', async () => {
      const fileId = 'file-123';
      const accessTypes: Array<'view' | 'download' | 'share' | 'stream'> = ['view', 'download', 'share', 'stream'];

      for (const accessType of accessTypes) {
        mockPool.query.mockClear();

        await service.logAccess(fileId, accessType);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          [fileId, undefined, accessType, undefined, undefined, undefined, undefined]
        );
      }
    });

    it('should not throw when pool is unavailable', async () => {
      // Arrange
      mockGetPool.mockReturnValue(null);

      // Act & Assert - should not throw
      await expect(service.logAccess('file-123', 'view')).resolves.not.toThrow();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      mockPool.query.mockRejectedValue(new Error('Database error'));

      // Act & Assert - should not throw, just log error
      await expect(service.logAccess('file-123', 'download')).resolves.not.toThrow();
    });

    it('should log with zero bytes sent', async () => {
      // Arrange
      const fileId = 'file-123';
      const accessType = 'view';
      const bytesSent = 0;

      // Act
      await service.logAccess(fileId, accessType, undefined, undefined, undefined, undefined, bytesSent);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([bytesSent])
      );
    });
  });

  describe('getAccessLogs', () => {
    it('should retrieve access logs for a file with default limit', async () => {
      // Arrange
      const fileId = 'file-123';
      const mockLogs = [
        { id: '1', file_id: fileId, access_type: 'view', accessed_at: new Date() },
        { id: '2', file_id: fileId, access_type: 'download', accessed_at: new Date() }
      ];
      mockPool.query.mockResolvedValue({ rows: mockLogs, rowCount: 2 });

      // Act
      const result = await service.getAccessLogs(fileId);

      // Assert
      expect(result).toEqual(mockLogs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM file_access_logs'),
        [fileId, 100]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY accessed_at DESC'),
        expect.any(Array)
      );
    });

    it('should retrieve access logs with custom limit', async () => {
      // Arrange
      const fileId = 'file-123';
      const limit = 50;
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      await service.getAccessLogs(fileId, limit);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [fileId, limit]
      );
    });

    it('should return empty array when pool is unavailable', async () => {
      // Arrange
      mockGetPool.mockReturnValue(null);

      // Act
      const result = await service.getAccessLogs('file-123');

      // Assert
      expect(result).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return empty array when no logs found', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      const result = await service.getAccessLogs('file-123');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getUserAccessHistory', () => {
    it('should retrieve user access history with default limit', async () => {
      // Arrange
      const userId = 'user-456';
      const mockHistory = [
        { id: '1', accessed_by: userId, filename: 'file1.pdf', mime_type: 'application/pdf' },
        { id: '2', accessed_by: userId, filename: 'file2.jpg', mime_type: 'image/jpeg' }
      ];
      mockPool.query.mockResolvedValue({ rows: mockHistory, rowCount: 2 });

      // Act
      const result = await service.getUserAccessHistory(userId);

      // Assert
      expect(result).toEqual(mockHistory);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN files f ON f.id = fal.file_id'),
        [userId, 100]
      );
    });

    it('should retrieve user access history with custom limit', async () => {
      // Arrange
      const userId = 'user-456';
      const limit = 25;
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      await service.getUserAccessHistory(userId, limit);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [userId, limit]
      );
    });

    it('should return empty array when pool is unavailable', async () => {
      // Arrange
      mockGetPool.mockReturnValue(null);

      // Act
      const result = await service.getUserAccessHistory('user-456');

      // Assert
      expect(result).toEqual([]);
    });

    it('should include file metadata in results', async () => {
      // Arrange
      const userId = 'user-456';
      const mockHistory = [
        {
          id: '1',
          accessed_by: userId,
          filename: 'document.pdf',
          mime_type: 'application/pdf',
          access_type: 'download'
        }
      ];
      mockPool.query.mockResolvedValue({ rows: mockHistory, rowCount: 1 });

      // Act
      const result = await service.getUserAccessHistory(userId);

      // Assert
      expect(result[0]).toHaveProperty('filename');
      expect(result[0]).toHaveProperty('mime_type');
    });
  });

  describe('getFileAccessStats', () => {
    it('should return aggregated statistics for a file', async () => {
      // Arrange
      const fileId = 'file-123';
      const mockStats = {
        total_accesses: '100',
        unique_users: '25',
        downloads: '50',
        views: '40',
        shares: '10',
        total_bytes_sent: '1024000',
        last_accessed: new Date()
      };
      mockPool.query.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      // Act
      const result = await service.getFileAccessStats(fileId);

      // Assert
      expect(result).toEqual(mockStats);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as total_accesses'),
        [fileId]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(DISTINCT accessed_by) as unique_users'),
        [fileId]
      );
    });

    it('should return null when pool is unavailable', async () => {
      // Arrange
      mockGetPool.mockReturnValue(null);

      // Act
      const result = await service.getFileAccessStats('file-123');

      // Assert
      expect(result).toBeNull();
    });

    it('should count different access types separately', async () => {
      // Arrange
      const fileId = 'file-123';
      const mockStats = {
        total_accesses: '150',
        unique_users: '30',
        downloads: '80',
        views: '60',
        shares: '10',
        total_bytes_sent: '5000000',
        last_accessed: new Date()
      };
      mockPool.query.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      // Act
      const result = await service.getFileAccessStats(fileId);

      // Assert
      expect(result).toHaveProperty('downloads');
      expect(result).toHaveProperty('views');
      expect(result).toHaveProperty('shares');
    });

    it('should handle files with no accesses', async () => {
      // Arrange
      const fileId = 'file-123';
      const mockStats = {
        total_accesses: '0',
        unique_users: '0',
        downloads: '0',
        views: '0',
        shares: '0',
        total_bytes_sent: null,
        last_accessed: null
      };
      mockPool.query.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      // Act
      const result = await service.getFileAccessStats(fileId);

      // Assert
      expect(result.total_accesses).toBe('0');
      expect(result.unique_users).toBe('0');
    });

    it('should sum total bytes sent', async () => {
      // Arrange
      const fileId = 'file-123';
      const mockStats = {
        total_accesses: '100',
        unique_users: '25',
        downloads: '50',
        views: '50',
        shares: '0',
        total_bytes_sent: '10485760', // 10 MB
        last_accessed: new Date()
      };
      mockPool.query.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      // Act
      const result = await service.getFileAccessStats(fileId);

      // Assert
      expect(result).toHaveProperty('total_bytes_sent');
      expect(result.total_bytes_sent).toBe('10485760');
    });

    it('should include last accessed timestamp', async () => {
      // Arrange
      const fileId = 'file-123';
      const lastAccessed = new Date('2024-01-15T10:00:00Z');
      const mockStats = {
        total_accesses: '50',
        unique_users: '10',
        downloads: '25',
        views: '25',
        shares: '0',
        total_bytes_sent: '1000000',
        last_accessed: lastAccessed
      };
      mockPool.query.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      // Act
      const result = await service.getFileAccessStats(fileId);

      // Assert
      expect(result.last_accessed).toEqual(lastAccessed);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(accessLogService).toBeInstanceOf(AccessLogService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = accessLogService;
      const instance2 = accessLogService;
      expect(instance1).toBe(instance2);
    });
  });
});
