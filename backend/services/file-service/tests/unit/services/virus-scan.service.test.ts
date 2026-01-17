import { VirusScanService } from '../../../src/services/virus-scan.service';
import { db } from '../../../src/config/database';
import { logger } from '../../../src/utils/logger';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config/database');
jest.mock('fs/promises');
jest.mock('clamscan');

// Mock NodeClam
const mockScanFile = jest.fn();
const mockGetVersion = jest.fn();

jest.mock('clamscan', () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue({
      scanFile: mockScanFile,
      getVersion: mockGetVersion
    })
  }));
});

describe('VirusScanService', () => {
  let virusScanService: VirusScanService;
  let mockDb: jest.Mocked<typeof db>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };

    // Default: scanning disabled
    delete process.env.ENABLE_VIRUS_SCAN;

    // Setup database mock
    mockDb = db as jest.Mocked<typeof db>;
    const mockQuery = jest.fn().mockReturnThis();
    (mockDb as any).mockReturnValue({
      where: mockQuery,
      orderBy: mockQuery,
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockResolvedValue([]),
      limit: mockQuery,
      offset: mockQuery
    });
    (mockDb as any).fn = { now: jest.fn(() => new Date()) };

    virusScanService = new VirusScanService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with scan disabled by default', () => {
      expect(virusScanService).toBeDefined();
    });

    it('should respect ENABLE_VIRUS_SCAN environment variable', () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();
      expect(service).toBeDefined();
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      process.env.CLAMAV_HOST = 'localhost';
      process.env.CLAMAV_PORT = '3310';
    });

    it('should initialize ClamAV successfully', async () => {
      const service = new VirusScanService();
      await service.initialize();

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('ClamAV initialized'));
    });

    it('should skip initialization when scanning is disabled', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'false';
      const service = new VirusScanService();
      await service.initialize();

      expect(logger.info).toHaveBeenCalledWith('Virus scanning is disabled');
    });

    it('should handle initialization errors gracefully', async () => {
      const NodeClam = require('clamscan');
      NodeClam.mockImplementationOnce(() => ({
        init: jest.fn().mockRejectedValue(new Error('Connection failed'))
      }));

      const service = new VirusScanService();
      await service.initialize();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('scanFile', () => {
    const mockOptions = {
      fileId: 'file-123',
      filePath: '/tmp/test-file.pdf',
      fileName: 'test-file.pdf',
      uploadedBy: 'user-456'
    };

    it('should skip scanning when disabled', async () => {
      const result = await virusScanService.scanFile(mockOptions);

      expect(result.isInfected).toBe(false);
      expect(result.viruses).toEqual([]);
      expect(result.scanTime).toBe(0);
    });

    it('should scan file successfully when clean', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();
      await service.initialize();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      mockScanFile.mockResolvedValue({
        isInfected: false,
        viruses: []
      });

      const result = await service.scanFile(mockOptions);

      expect(result.isInfected).toBe(false);
      expect(result.viruses).toEqual([]);
      expect(mockDb).toHaveBeenCalledWith('av_scans');
    });

    it('should detect infected files', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();
      await service.initialize();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      mockScanFile.mockResolvedValue({
        isInfected: true,
        viruses: ['Eicar-Test-Signature']
      });

      const result = await service.scanFile(mockOptions);

      expect(result.isInfected).toBe(true);
      expect(result.viruses).toContain('Eicar-Test-Signature');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw error when file not found', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();
      await service.initialize();

      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(service.scanFile(mockOptions)).rejects.toThrow('File not found');
    });

    it('should quarantine infected files', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();
      await service.initialize();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.rename as jest.Mock).mockResolvedValue(undefined);

      mockScanFile.mockResolvedValue({
        isInfected: true,
        viruses: ['Win.Test.EICAR']
      });

      await service.scanFile(mockOptions);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.rename).toHaveBeenCalled();
      expect(mockDb).toHaveBeenCalledWith('quarantined_files');
    });

    it('should update file status when quarantined', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();
      await service.initialize();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.rename as jest.Mock).mockResolvedValue(undefined);

      mockScanFile.mockResolvedValue({
        isInfected: true,
        viruses: ['Virus.Test']
      });

      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      (mockDb as any).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      }).mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue(undefined)
      }).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: mockUpdate
      });

      await service.scanFile(mockOptions);

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('getScanHistory', () => {
    it('should retrieve scan history for a file', async () => {
      const fileId = 'file-123';
      const mockScans = [
        { id: 1, file_id: fileId, scan_result: 'clean' },
        { id: 2, file_id: fileId, scan_result: 'clean' }
      ];

      const mockSelect = jest.fn().mockResolvedValue(mockScans);
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: mockSelect
      });

      const result = await virusScanService.getScanHistory(fileId);

      expect(result).toEqual(mockScans);
      expect(mockDb).toHaveBeenCalledWith('av_scans');
    });

    it('should return empty array on error', async () => {
      const mockSelect = jest.fn().mockRejectedValue(new Error('DB error'));
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: mockSelect
      });

      const result = await virusScanService.getScanHistory('file-123');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getLatestScan', () => {
    it('should retrieve latest scan for a file', async () => {
      const mockScan = { id: 1, file_id: 'file-123', scan_result: 'clean' };

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockScan)
      });

      const result = await virusScanService.getLatestScan('file-123');

      expect(result).toEqual(mockScan);
    });

    it('should return null when no scan exists', async () => {
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const result = await virusScanService.getLatestScan('file-123');

      expect(result).toBeNull();
    });
  });

  describe('needsScan', () => {
    it('should return false when scanning is disabled', async () => {
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const result = await virusScanService.needsScan('file-123');
      expect(result).toBe(false);
    });

    it('should return true when no previous scan exists', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const result = await service.needsScan('file-123');
      expect(result).toBe(true);
    });

    it('should return true when previous scan failed', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ scan_result: 'failed' })
      });

      const result = await service.needsScan('file-123');
      expect(result).toBe(true);
    });

    it('should return false for recently scanned clean files', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          scan_result: 'clean',
          scanned_at: new Date()
        })
      });

      const result = await service.needsScan('file-123');
      expect(result).toBe(false);
    });

    it('should return true for old scans (>7 days)', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 8);

      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          scan_result: 'clean',
          scanned_at: oldDate
        })
      });

      const result = await service.needsScan('file-123');
      expect(result).toBe(true);
    });
  });

  describe('getQuarantinedFiles', () => {
    it('should retrieve quarantined files', async () => {
      const mockFiles = [
        { id: 1, file_id: 'file-1', reason: 'virus_detected' },
        { id: 2, file_id: 'file-2', reason: 'virus_detected' }
      ];

      const mockSelect = jest.fn().mockResolvedValue(mockFiles);
      (mockDb as any).mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        select: mockSelect
      });

      const result = await virusScanService.getQuarantinedFiles();

      expect(result).toEqual(mockFiles);
      expect(mockDb).toHaveBeenCalledWith('quarantined_files');
    });

    it('should support pagination', async () => {
      const mockLimit = jest.fn().mockReturnThis();
      const mockOffset = jest.fn().mockReturnThis();

      (mockDb as any).mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        limit: mockLimit,
        offset: mockOffset,
        select: jest.fn().mockResolvedValue([])
      });

      await virusScanService.getQuarantinedFiles(50, 100);

      expect(mockLimit).toHaveBeenCalledWith(50);
      expect(mockOffset).toHaveBeenCalledWith(100);
    });
  });

  describe('deleteQuarantinedFile', () => {
    it('should delete quarantined file successfully', async () => {
      const fileId = 'file-123';
      const quarantinedFile = {
        file_id: fileId,
        quarantine_path: '/quarantine/file-123.dat'
      };

      (fs.unlink as jest.Mock).mockResolvedValue(undefined);
      const mockUpdate = jest.fn().mockResolvedValue(undefined);

      (mockDb as any).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(quarantinedFile)
      }).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: mockUpdate
      });

      const result = await virusScanService.deleteQuarantinedFile(fileId, 'admin-user');

      expect(result).toBe(true);
      expect(fs.unlink).toHaveBeenCalledWith(quarantinedFile.quarantine_path);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should return false when file not found', async () => {
      (mockDb as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const result = await virusScanService.deleteQuarantinedFile('file-123', 'admin-user');

      expect(result).toBe(false);
    });

    it('should handle file deletion errors gracefully', async () => {
      const quarantinedFile = {
        file_id: 'file-123',
        quarantine_path: '/quarantine/file-123.dat'
      };

      (fs.unlink as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      const mockUpdate = jest.fn().mockResolvedValue(undefined);

      (mockDb as any).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(quarantinedFile)
      }).mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: mockUpdate
      });

      const result = await virusScanService.deleteQuarantinedFile('file-123', 'admin-user');

      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('should return unhealthy when not initialized', async () => {
      const result = await virusScanService.getHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toMatch(/disabled|not initialized/i);
    });

    it('should return unhealthy when scanning disabled and not initialized', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'false';
      const service = new VirusScanService();

      const result = await service.getHealth();

      expect(result.healthy).toBe(false);
    });

    it('should return healthy with version when working', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();

      mockGetVersion.mockResolvedValue('ClamAV 0.103.6');
      await service.initialize();

      const result = await service.getHealth();

      expect(result.healthy).toBe(true);
      expect(result.version).toBeDefined();
    });

    it('should handle health check errors', async () => {
      process.env.ENABLE_VIRUS_SCAN = 'true';
      const service = new VirusScanService();

      mockGetVersion.mockRejectedValue(new Error('Connection timeout'));
      await service.initialize();

      const result = await service.getHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });
});
