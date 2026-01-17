jest.mock('../../../src/config/database');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/utils/logger');
jest.mock('child_process', () => ({
  exec: jest.fn()
}));
jest.mock('fs');

import { AntivirusService } from '../../../src/services/antivirus.service';
import { db } from '../../../src/config/database';
import { storageService } from '../../../src/storage/storage.service';
import { logger } from '../../../src/utils/logger';
import fs from 'fs';
import { exec } from 'child_process';

describe('AntivirusService', () => {
  let antivirusService: AntivirusService;
  let mockDb: jest.Mocked<typeof db>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = db as jest.Mocked<typeof db>;
    (mockDb as any).mockReturnValue({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(undefined)
    });

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.createReadStream as jest.Mock).mockReturnValue({
      on: jest.fn(function(this: any, event: string, handler: (chunk?: Buffer) => void) {
        if (event === 'data') {
          handler(Buffer.from('test'));
        }
        if (event === 'end') {
          setTimeout(() => handler(), 0);
        }
        return this;
      })
    });
    (fs.renameSync as jest.Mock).mockReturnValue(undefined);
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);

    (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
      callback(null, { stdout: 'file.pdf: OK\n', stderr: '' });
    });

    antivirusService = new AntivirusService();
  });

  describe('constructor', () => {
    it('should initialize with default paths', () => {
      expect(antivirusService).toBeDefined();
    });

    it('should ensure directories exist', () => {
      // Verify it checks if directories exist
      expect(fs.existsSync).toHaveBeenCalled();
    });
  });

  describe('scanFile', () => {
    const testFilePath = '/test/file.pdf';

    it('should scan a clean file successfully', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(null, { stdout: 'file.pdf: OK\n', stderr: '' });
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanFile(testFilePath);
      expect(result.clean).toBe(true);
      expect(result.threats).toEqual([]);
      expect(result.scanEngine).toBe('ClamAV');
      expect(logger.info).toHaveBeenCalled();
    });

    it('should detect infected files', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(null, { stdout: '/test/file.pdf: Eicar-Test-Signature FOUND\n', stderr: '' });
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanFile(testFilePath);
      expect(result.clean).toBe(false);
      expect(result.threats.length).toBeGreaterThan(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should use cached scan result for already scanned clean files', async () => {
      const cachedScan = { clean: true, threats: [], scanned_at: new Date(), scan_engine: 'ClamAV', file_hash: 'abc123' };
      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(cachedScan),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanFile(testFilePath);
      expect(result.clean).toBe(true);
    });

    it('should handle ClamAV not installed', async () => {
      const error: any = new Error('Command not found');
      error.code = 127;
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(error, null);
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanFile(testFilePath);
      expect(result.scanEngine).toBe('MockScanner');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should quarantine infected files', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(null, { stdout: '/test/file.pdf: Win.Test.EICAR_HDB-1 FOUND\n', stderr: '' });
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      await antivirusService.scanFile(testFilePath);
      expect(fs.renameSync).toHaveBeenCalled();
      expect(mockDb).toHaveBeenCalledWith('quarantined_files');
    });

    it('should handle scan errors', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(new Error('Scan failed'), null);
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      await expect(antivirusService.scanFile(testFilePath)).rejects.toThrow('Antivirus scan failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('scanStorageFile', () => {
    it('should download and scan file from storage', async () => {
      const storageKey = 'uploads/test.pdf';
      const mockBuffer = Buffer.from('test file content');
      (storageService.download as jest.Mock).mockResolvedValue(mockBuffer);
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(null, { stdout: 'test.pdf: OK\n', stderr: '' });
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanStorageFile(storageKey);
      expect(storageService.download).toHaveBeenCalledWith(storageKey);
      expect(result.clean).toBe(true);
    });

    it('should clean up temp file after scan', async () => {
      const storageKey = 'uploads/test.pdf';
      const mockBuffer = Buffer.from('test file content');
      (storageService.download as jest.Mock).mockResolvedValue(mockBuffer);
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(null, { stdout: 'test.pdf: OK\n', stderr: '' });
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      await antivirusService.scanStorageFile(storageKey);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle storage download errors', async () => {
      const storageKey = 'uploads/test.pdf';
      (storageService.download as jest.Mock).mockRejectedValue(new Error('Download failed'));
      await expect(antivirusService.scanStorageFile(storageKey)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('mockScan', () => {
    it('should detect test virus files', async () => {
      const virusFilePath = '/test/eicar.com';
      const error: any = new Error('Command not found');
      error.code = 127;
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(error, null);
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanFile(virusFilePath);
      expect(result.clean).toBe(false);
      expect(result.threats).toContain('Test.Virus.EICAR');
      expect(result.scanEngine).toBe('MockScanner');
    });

    it('should mark normal files as clean in mock mode', async () => {
      const normalFilePath = '/test/document.pdf';
      const error: any = new Error('Command not found');
      error.code = 127;
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(error, null);
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanFile(normalFilePath);
      expect(result.clean).toBe(true);
      expect(result.threats).toEqual([]);
    });
  });

  describe('calculateFileHash', () => {
    it('should calculate SHA256 hash of file', async () => {
      const filePath = '/test/file.pdf';
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(null, { stdout: 'file.pdf: OK\n', stderr: '' });
      });

      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined)
      });

      const result = await antivirusService.scanFile(filePath);
      expect(result.fileHash).toBeDefined();
    });
  });

  describe('storeScanResult', () => {
    it('should store scan result in database', async () => {
      const filePath = '/test/file.pdf';
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: (err: any, result: any) => void) => {
        callback(null, { stdout: 'file.pdf: OK\n', stderr: '' });
      });

      const mockInsert = jest.fn().mockResolvedValue(undefined);
      const mockQuery = jest.fn().mockReturnThis();
      (mockDb as any).mockReturnValue({
        where: mockQuery, orderBy: mockQuery,
        first: jest.fn().mockResolvedValue(null),
        insert: mockInsert
      });

      await antivirusService.scanFile(filePath);
      expect(mockDb).toHaveBeenCalledWith('av_scans');
      expect(mockInsert).toHaveBeenCalled();
    });
  });
});
