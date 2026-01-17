// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/cache.service');

import { StorageQuotaService, storageQuotaService } from '../../../src/services/storage-quota.service';
import { db } from '../../../src/config/database';
import { cacheService } from '../../../src/services/cache.service';

describe('services/storage-quota.service', () => {
  let service: StorageQuotaService;
  let mockCacheService: jest.Mocked<typeof cacheService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock cache service
    mockCacheService = cacheService as jest.Mocked<typeof cacheService>;
    mockCacheService.get = jest.fn().mockResolvedValue(null);
    mockCacheService.set = jest.fn().mockResolvedValue(true);
    mockCacheService.delete = jest.fn().mockResolvedValue(true);

    // Setup db.fn
    (db as any).fn = { now: jest.fn().mockReturnValue('2024-01-15T10:00:00Z') };

    service = new StorageQuotaService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper to setup db mock with specific responses
  function setupDbMock(responses: any[]) {
    let callIndex = 0;
    (db as any).mockImplementation(() => {
      const response = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      
      const chainable: any = {};
      chainable.where = jest.fn().mockReturnValue(chainable);
      chainable.whereNull = jest.fn().mockReturnValue(chainable);
      chainable.select = jest.fn().mockReturnValue(chainable);
      chainable.count = jest.fn().mockReturnValue(chainable);
      chainable.sum = jest.fn().mockReturnValue(chainable);
      chainable.orderBy = jest.fn().mockReturnValue(chainable);
      chainable.limit = jest.fn().mockReturnValue(chainable);
      chainable.insert = jest.fn().mockReturnValue(chainable);
      chainable.update = jest.fn().mockResolvedValue(response.updateResult ?? 1);
      chainable.returning = jest.fn().mockResolvedValue(response.returning ?? []);
      chainable.first = jest.fn().mockResolvedValue(response.first ?? null);
      chainable.groupBy = jest.fn().mockResolvedValue(response.groupBy ?? []);
      
      return chainable;
    });
  }

  describe('setQuota', () => {
    it('should create new quota for tenant', async () => {
      setupDbMock([
        { first: null, returning: [{ id: 'quota-1' }] }
      ]);

      const params = {
        tenantId: 'tenant-123',
        maxStorageBytes: 1073741824,
        maxFiles: 1000,
        maxFileSizeBytes: 10485760
      };

      const result = await service.setQuota(params);

      expect(result).toBe('quota-1');
    });

    it('should update existing quota', async () => {
      setupDbMock([
        { first: { id: 'quota-1' }, updateResult: 1 }
      ]);

      const params = {
        userId: 'user-123',
        maxStorageBytes: 2147483648
      };

      const result = await service.setQuota(params);

      expect(result).toBe('quota-1');
    });

    it('should throw error when no identifiers provided', async () => {
      const params = {
        maxStorageBytes: 1073741824
      };

      await expect(service.setQuota(params)).rejects.toThrow(
        'At least one of userId, tenantId, or venueId must be provided'
      );
    });

    it('should handle limits by type', async () => {
      setupDbMock([
        { first: null, returning: [{ id: 'quota-1' }] }
      ]);

      const params = {
        tenantId: 'tenant-123',
        maxStorageBytes: 1073741824,
        limitsByType: {
          'image/*': 524288000,
          'video/*': 314572800
        }
      };

      const result = await service.setQuota(params);

      expect(result).toBe('quota-1');
    });

    it('should clear cache after setting quota', async () => {
      setupDbMock([
        { first: null, returning: [{ id: 'quota-1' }] }
      ]);

      const params = {
        tenantId: 'tenant-123',
        maxStorageBytes: 1073741824
      };

      await service.setQuota(params);

      expect(mockCacheService.delete).toHaveBeenCalled();
    });
  });

  describe('getQuota', () => {
    it('should return cached quota if available', async () => {
      const cachedQuota = {
        id: 'quota-1',
        tenantId: 'tenant-123',
        maxStorageBytes: 1073741824,
        softLimitPercentage: 80,
        sendWarnings: true,
        isActive: true
      };
      mockCacheService.get.mockResolvedValue(cachedQuota);

      const result = await service.getQuota(undefined, 'tenant-123');

      expect(result).toEqual(cachedQuota);
      expect(mockCacheService.get).toHaveBeenCalled();
    });

    it('should fetch from database and cache when not cached', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const dbQuota = {
        id: 'quota-1',
        tenant_id: 'tenant-123',
        max_storage_bytes: '1073741824',
        max_files: 1000,
        max_file_size_bytes: '10485760',
        soft_limit_percentage: 80,
        send_warnings: true,
        is_active: true
      };

      setupDbMock([{ first: dbQuota }]);

      const result = await service.getQuota(undefined, 'tenant-123');

      expect(result).toMatchObject({
        id: 'quota-1',
        tenantId: 'tenant-123',
        maxStorageBytes: 1073741824
      });
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return null when no quota found', async () => {
      mockCacheService.get.mockResolvedValue(null);
      setupDbMock([{ first: null }]);

      const result = await service.getQuota('user-123');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockCacheService.get.mockResolvedValue(null);

      (db as any).mockImplementation(() => {
        const chainable: any = {};
        chainable.where = jest.fn().mockReturnValue(chainable);
        chainable.first = jest.fn().mockRejectedValue(new Error('DB error'));
        return chainable;
      });

      const result = await service.getQuota('user-123');

      expect(result).toBeNull();
    });
  });

  describe('calculateUsage', () => {
    it('should calculate usage for tenant', async () => {
      const mockTotals = {
        total_files: '150',
        total_bytes: '524288000'
      };

      const mockByType = [
        { content_type: 'image/jpeg', count: '100', bytes: '314572800' },
        { content_type: 'application/pdf', count: '50', bytes: '209715200' }
      ];

      setupDbMock([
        { first: mockTotals, groupBy: mockByType }
      ]);

      const result = await service.calculateUsage(undefined, 'tenant-123');

      expect(result.totalFiles).toBe(150);
      expect(result.totalStorageBytes).toBe(524288000);
      expect(result.usageByType).toHaveProperty('image/jpeg');
      expect(result.usageByType).toHaveProperty('application/pdf');
    });

    it('should handle zero usage', async () => {
      const mockTotals = {
        total_files: '0',
        total_bytes: '0'
      };

      setupDbMock([{ first: mockTotals, groupBy: [] }]);

      const result = await service.calculateUsage('user-123');

      expect(result.totalFiles).toBe(0);
      expect(result.totalStorageBytes).toBe(0);
    });
  });

  describe('checkQuota', () => {
    it('should allow upload when within quota', async () => {
      const fileSize = 10485760; // 10MB
      const quota = {
        id: 'quota-1',
        maxStorageBytes: 1073741824, // 1GB
        maxFiles: 1000,
        maxFileSizeBytes: 52428800, // 50MB
        softLimitPercentage: 80,
        sendWarnings: true,
        isActive: true
      };

      mockCacheService.get.mockResolvedValue(quota);

      const mockTotals = { total_files: '100', total_bytes: '524288000' };
      setupDbMock([{ first: mockTotals, groupBy: [] }]);

      const result = await service.checkQuota(fileSize, undefined, 'tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(524288000);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should reject when file size exceeds limit', async () => {
      const fileSize = 104857600; // 100MB
      const quota = {
        id: 'quota-1',
        maxStorageBytes: 1073741824,
        maxFileSizeBytes: 52428800, // 50MB max
        softLimitPercentage: 80,
        sendWarnings: true,
        isActive: true
      };

      mockCacheService.get.mockResolvedValue(quota);

      const result = await service.checkQuota(fileSize);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('File size exceeds maximum');
    });

    it('should reject when storage quota would be exceeded', async () => {
      const fileSize = 524288000; // 500MB
      const quota = {
        id: 'quota-1',
        maxStorageBytes: 1073741824, // 1GB
        maxFiles: 1000,
        softLimitPercentage: 80,
        sendWarnings: true,
        isActive: true
      };

      mockCacheService.get.mockResolvedValue(quota);

      // Mock current usage at 900MB
      const mockTotals = { total_files: '500', total_bytes: '943718400' };
      setupDbMock([{ first: mockTotals, groupBy: [] }]);

      const result = await service.checkQuota(fileSize, undefined, 'tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Storage quota exceeded');
    });

    it('should reject when file count limit reached', async () => {
      const fileSize = 1048576; // 1MB
      const quota = {
        id: 'quota-1',
        maxStorageBytes: 1073741824,
        maxFiles: 100, // Max 100 files
        softLimitPercentage: 80,
        sendWarnings: true,
        isActive: true
      };

      mockCacheService.get.mockResolvedValue(quota);

      // Mock current usage at 100 files
      const mockTotals = { total_files: '100', total_bytes: '104857600' };
      setupDbMock([{ first: mockTotals, groupBy: [] }]);

      const result = await service.checkQuota(fileSize, undefined, 'tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Maximum number of files reached');
    });

    it('should allow upload when no quota exists', async () => {
      mockCacheService.get.mockResolvedValue(null);
      setupDbMock([{ first: null }]);

      const result = await service.checkQuota(10485760);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });

    it('should calculate percentage used correctly', async () => {
      const fileSize = 10485760; // 10MB
      const quota = {
        id: 'quota-1',
        maxStorageBytes: 1073741824, // 1GB
        softLimitPercentage: 80,
        sendWarnings: true,
        isActive: true
      };

      mockCacheService.get.mockResolvedValue(quota);

      // Mock usage at 500MB
      const mockTotals = { total_files: '100', total_bytes: '524288000' };
      setupDbMock([{ first: mockTotals, groupBy: [] }]);

      const result = await service.checkQuota(fileSize, undefined, 'tenant-123');

      expect(result.percentageUsed).toBeGreaterThan(0);
      expect(result.percentageUsed).toBeLessThan(100);
    });
  });

  describe('getUsageSummary', () => {
    it('should return complete usage summary', async () => {
      const quota = {
        id: 'quota-1',
        maxStorageBytes: 1073741824,
        softLimitPercentage: 80,
        sendWarnings: true,
        isActive: true
      };

      mockCacheService.get.mockResolvedValue(quota);

      const mockTotals = { total_files: '100', total_bytes: '524288000' };
      setupDbMock([
        { first: mockTotals, groupBy: [] },
        { first: mockTotals, groupBy: [], limit: [] }
      ]);

      const result = await service.getUsageSummary(undefined, 'tenant-123');

      expect(result).toHaveProperty('quota');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('percentageUsed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('alerts');
      expect(result.quota).toEqual(quota);
    });

    it('should handle no quota scenario', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const mockTotals = { total_files: '100', total_bytes: '524288000' };
      setupDbMock([
        { first: null },
        { first: mockTotals, groupBy: [] }
      ]);

      const result = await service.getUsageSummary('user-123');

      expect(result.quota).toBeNull();
      expect(result.percentageUsed).toBe(0);
      expect(result.remaining).toBe(Infinity);
    });
  });

  describe('deleteQuota', () => {
    it('should deactivate quota', async () => {
      setupDbMock([{ updateResult: 1 }]);

      const result = await service.deleteQuota('quota-1');

      expect(result).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      (db as any).mockImplementation(() => {
        const chainable: any = {};
        chainable.where = jest.fn().mockReturnValue(chainable);
        chainable.update = jest.fn().mockRejectedValue(new Error('DB error'));
        return chainable;
      });

      const result = await service.deleteQuota('quota-1');

      expect(result).toBe(false);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(storageQuotaService).toBeInstanceOf(StorageQuotaService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = storageQuotaService;
      const instance2 = storageQuotaService;
      expect(instance1).toBe(instance2);
    });
  });
});
