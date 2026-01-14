import { StorageQuotaService } from '../../../src/services/storage-quota.service';
import { db } from '../../../src/config/database';
import { cacheService } from '../../../src/services/cache.service';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/cache.service');

describe('StorageQuotaService', () => {
  let quotaService: StorageQuotaService;

  beforeEach(() => {
    jest.clearAllMocks();
    quotaService = new StorageQuotaService();
  });

  describe('setQuota', () => {
    it('should create a new quota for a user', async () => {
      const mockQuotaData = {
        userId: 'user-123',
        maxStorageBytes: 1073741824, // 1GB
        maxFiles: 1000
      };

      // Mock database response
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null), // No existing quota
        insert: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'quota-123' }])
        })
      });

      const quotaId = await quotaService.setQuota(mockQuotaData);

      expect(quotaId).toBe('quota-123');
      expect(db).toHaveBeenCalled();
    });

    it('should update an existing quota', async () => {
      const mockQuotaData = {
        userId: 'user-123',
        maxStorageBytes: 2147483648, // 2GB
      };

      const existingQuota = {
        id: 'quota-123',
        user_id: 'user-123',
        max_storage_bytes: 1073741824
      };

      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(existingQuota),
        update: jest.fn().mockResolvedValue(1)
      });

      const quotaId = await quotaService.setQuota(mockQuotaData);

      expect(quotaId).toBe('quota-123');
    });

    it('should throw error if no entity provided', async () => {
      await expect(
        quotaService.setQuota({
          maxStorageBytes: 1073741824
        })
      ).rejects.toThrow('At least one of userId, tenantId, or venueId must be provided');
    });
  });

  describe('checkQuota', () => {
    it('should allow upload within quota', async () => {
      const mockQuota = {
        id: 'quota-123',
        maxStorageBytes: 1073741824,
        softLimitPercentage: 80
      };

      const mockUsage = {
        totalStorageBytes: 536870912, // 512MB (50% of quota)
        totalFiles: 100
      };

      jest.spyOn(quotaService as any, 'getQuota').mockResolvedValue(mockQuota);
      jest.spyOn(quotaService as any, 'calculateUsage').mockResolvedValue(mockUsage);

      const result = await quotaService.checkQuota(
        104857600, // 100MB file
        'user-123'
      );

      expect(result.allowed).toBe(true);
      expect(result.percentageUsed).toBeLessThan(80);
    });

    it('should reject upload when quota exceeded', async () => {
      const mockQuota = {
        id: 'quota-123',
        maxStorageBytes: 1073741824,
        softLimitPercentage: 80
      };

      const mockUsage = {
        totalStorageBytes: 1000000000, // ~930MB
        totalFiles: 100
      };

      jest.spyOn(quotaService as any, 'getQuota').mockResolvedValue(mockQuota);
      jest.spyOn(quotaService as any, 'calculateUsage').mockResolvedValue(mockUsage);

      const result = await quotaService.checkQuota(
        200000000, // 200MB file (would exceed quota)
        'user-123'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Storage quota exceeded');
    });

    it('should allow upload when no quota is set', async () => {
      jest.spyOn(quotaService as any, 'getQuota').mockResolvedValue(null);

      const result = await quotaService.checkQuota(
        104857600,
        'user-123'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });
  });

  describe('calculateUsage', () => {
    it('should calculate total storage usage for a user', async () => {
      const mockTotals = {
        total_files: '150',
        total_bytes: '524288000' // 500MB
      };

      const mockByType = [
        { content_type: 'image/jpeg', count: '100', bytes: '314572800' },
        { content_type: 'application/pdf', count: '50', bytes: '209715200' }
      ];

      (db as any).mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockTotals),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockResolvedValue(mockByType)
      });

      jest.spyOn(quotaService as any, 'saveUsage').mockResolvedValue(undefined);

      const usage = await quotaService.calculateUsage('user-123');

      expect(usage.totalFiles).toBe(150);
      expect(usage.totalStorageBytes).toBe(524288000);
      expect(usage.usageByType).toHaveProperty('image/jpeg');
      expect(usage.usageByType).toHaveProperty('application/pdf');
    });
  });

  describe('getUsageSummary', () => {
    it('should return complete usage summary', async () => {
      const mockQuota = {
        id: 'quota-123',
        maxStorageBytes: 1073741824,
        userId: 'user-123'
      };

      const mockUsage = {
        totalStorageBytes: 536870912,
        totalFiles: 150
      };

      const mockAlerts = [
        {
          id: 'alert-1',
          alert_type: 'warning',
          usage_percentage: 85,
          created_at: new Date()
        }
      ];

      jest.spyOn(quotaService as any, 'getQuota').mockResolvedValue(mockQuota);
      jest.spyOn(quotaService as any, 'calculateUsage').mockResolvedValue(mockUsage);

      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockAlerts)
      });

      const summary = await quotaService.getUsageSummary('user-123');

      expect(summary.quota).toEqual(mockQuota);
      expect(summary.usage).toEqual(mockUsage);
      expect(summary.percentageUsed).toBe(50);
      expect(summary.remaining).toBeGreaterThan(0);
      expect(summary.alerts).toHaveLength(1);
    });
  });
});
