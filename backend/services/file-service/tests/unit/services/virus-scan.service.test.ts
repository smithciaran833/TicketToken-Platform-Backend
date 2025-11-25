import { VirusScanService } from '../../../src/services/virus-scan.service';

jest.mock('clamscan');

describe('VirusScanService', () => {
  let service: VirusScanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VirusScanService();
  });

  describe('scanFile', () => {
    it('should scan file and return clean result', async () => {
      const mockScan = jest.fn().mockResolvedValue({
        isInfected: false,
        viruses: []
      });
      (service as any).clamscan = { scanFile: mockScan };

      const result = await service.scanFile('/path/to/file.pdf');

      expect(result.isClean).toBe(true);
      expect(result.viruses).toEqual([]);
      expect(mockScan).toHaveBeenCalledWith('/path/to/file.pdf');
    });

    it('should detect infected file', async () => {
      const mockScan = jest.fn().mockResolvedValue({
        isInfected: true,
        viruses: ['Trojan.Generic.123']
      });
      (service as any).clamscan = { scanFile: mockScan };

      const result = await service.scanFile('/path/to/malware.exe');

      expect(result.isClean).toBe(false);
      expect(result.viruses).toContain('Trojan.Generic.123');
    });

    it('should handle scan errors', async () => {
      const mockScan = jest.fn().mockRejectedValue(new Error('Scanner unavailable'));
      (service as any).clamscan = { scanFile: mockScan };

      await expect(service.scanFile('/path/to/file')).rejects.toThrow('Scanner unavailable');
    });

    it('should scan buffer data', async () => {
      const buffer = Buffer.from('test data');
      const mockScan = jest.fn().mockResolvedValue({
        isInfected: false,
        viruses: []
      });
      (service as any).clamscan = { scanBuffer: mockScan };

      const result = await service.scanBuffer(buffer);

      expect(result.isClean).toBe(true);
      expect(mockScan).toHaveBeenCalledWith(buffer);
    });
  });

  describe('scanStream', () => {
    it('should scan readable stream', async () => {
      const mockStream = { pipe: jest.fn() } as any;
      const mockScan = jest.fn().mockResolvedValue({
        isInfected: false,
        viruses: []
      });
      (service as any).clamscan = { scanStream: mockScan };

      const result = await service.scanStream(mockStream);

      expect(result.isClean).toBe(true);
      expect(mockScan).toHaveBeenCalledWith(mockStream);
    });

    it('should detect virus in stream', async () => {
      const mockStream = { pipe: jest.fn() } as any;
      const mockScan = jest.fn().mockResolvedValue({
        isInfected: true,
        viruses: ['EICAR-Test-File']
      });
      (service as any).clamscan = { scanStream: mockScan };

      const result = await service.scanStream(mockStream);

      expect(result.isClean).toBe(false);
      expect(result.viruses).toContain('EICAR-Test-File');
    });
  });

  describe('updateDefinitions', () => {
    it('should update virus definitions', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({ updated: true });
      (service as any).clamscan = { updateDefinitions: mockUpdate };

      const result = await service.updateDefinitions();

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should handle update failures', async () => {
      const mockUpdate = jest.fn().mockRejectedValue(new Error('Update failed'));
      (service as any).clamscan = { updateDefinitions: mockUpdate };

      await expect(service.updateDefinitions()).rejects.toThrow('Update failed');
    });
  });

  describe('getVersion', () => {
    it('should return scanner version', async () => {
      const mockVersion = jest.fn().mockResolvedValue('ClamAV 0.103.5');
      (service as any).clamscan = { getVersion: mockVersion };

      const version = await service.getVersion();

      expect(version).toBe('ClamAV 0.103.5');
      expect(mockVersion).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    it('should check if scanner is available', async () => {
      const mockPing = jest.fn().mockResolvedValue(true);
      (service as any).clamscan = { ping: mockPing };

      const available = await service.isAvailable();

      expect(available).toBe(true);
      expect(mockPing).toHaveBeenCalled();
    });

    it('should return false if scanner unavailable', async () => {
      const mockPing = jest.fn().mockRejectedValue(new Error('Not available'));
      (service as any).clamscan = { ping: mockPing };

      const available = await service.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('quarantineFile', () => {
    it('should move infected file to quarantine', async () => {
      const filePath = '/uploads/infected.exe';
      const mockMove = jest.fn().mockResolvedValue(true);
      (service as any).moveToQuarantine = mockMove;

      await service.quarantineFile(filePath);

      expect(mockMove).toHaveBeenCalledWith(filePath);
    });
  });

  describe('getScanStats', () => {
    it('should return scan statistics', () => {
      (service as any).stats = {
        totalScans: 100,
        cleanFiles: 95,
        infectedFiles: 5,
        errors: 2
      };

      const stats = service.getScanStats();

      expect(stats.totalScans).toBe(100);
      expect(stats.cleanFiles).toBe(95);
      expect(stats.infectedFiles).toBe(5);
      expect(stats.infectionRate).toBeCloseTo(0.05);
    });
  });

  describe('validateFileType', () => {
    it('should validate allowed file types', () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      
      expect(service.isAllowedType('image/jpeg', allowedTypes)).toBe(true);
      expect(service.isAllowedType('application/pdf', allowedTypes)).toBe(true);
      expect(service.isAllowedType('application/x-executable', allowedTypes)).toBe(false);
    });

    it('should reject dangerous extensions', () => {
      const dangerousExts = ['.exe', '.bat', '.cmd', '.scr', '.vbs'];
      
      dangerousExts.forEach(ext => {
        expect(service.isDangerousExtension(`file${ext}`)).toBe(true);
      });

      expect(service.isDangerousExtension('document.pdf')).toBe(false);
      expect(service.isDangerousExtension('image.jpg')).toBe(false);
    });
  });

  describe('scanMulti pleFiles', () => {
    it('should scan multiple files concurrently', async () => {
      const files = ['/file1.pdf', '/file2.jpg', '/file3.docx'];
      const mockScan = jest.fn()
        .mockResolvedValueOnce({ isInfected: false, viruses: [] })
        .mockResolvedValueOnce({ isInfected: false, viruses: [] })
        .mockResolvedValueOnce({ isInfected: true, viruses: ['Virus.X'] });
      
      (service as any).clamscan = { scanFile: mockScan };

      const results = await service.scanMultipleFiles(files);

      expect(results).toHaveLength(3);
      expect(results.filter(r => r.isClean)).toHaveLength(2);
      expect(results.filter(r => !r.isClean)).toHaveLength(1);
    });

    it('should handle partial failures', async () => {
      const files = ['/file1.pdf', '/file2.jpg'];
      const mockScan = jest.fn()
        .mockResolvedValueOnce({ isInfected: false, viruses: [] })
        .mockRejectedValueOnce(new Error('Scan failed'));
      
      (service as any).clamscan = { scanFile: mockScan };

      const results = await service.scanMultipleFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].isClean).toBe(true);
      expect(results[1].error).toBeDefined();
    });
  });
});
