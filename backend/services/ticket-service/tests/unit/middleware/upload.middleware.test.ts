import { FastifyRequest, FastifyReply } from 'fastify';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Mock fetch for virus scanning
global.fetch = jest.fn();

import {
  validateFile,
  scanFileForViruses,
  createUploadMiddleware,
  setUploadConfig,
  getUploadConfig,
  imageUploadMiddleware,
  documentUploadMiddleware,
  UploadedFile,
} from '../../../src/middleware/upload.middleware';

describe('Upload Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset upload config to defaults
    setUploadConfig({
      maxFileSize: 10 * 1024 * 1024,
      maxTotalSize: 50 * 1024 * 1024,
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/json',
      ],
      allowedExtensions: [
        '.jpg', '.jpeg', '.png', '.gif', '.webp',
        '.pdf', '.txt', '.csv', '.json',
      ],
      virusScanEnabled: false,
      maxFiles: 5,
      verifyMagicBytes: true,
    });
  });

  describe('validateFile', () => {
    it('should validate a valid JPEG file', async () => {
      // Minimal valid JPEG: magic bytes only, no embedded content
      // The executable check only looks at first 10000 bytes as latin1 string
      // So we use bytes that won't trigger the pattern checks
      const jpegData = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0,  // JPEG SOI + APP0 marker
        // Fill with printable ASCII (space character) to avoid null byte detection
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
      ]);

      const file: UploadedFile = {
        filename: 'test.jpg',
        mimetype: 'image/jpeg',
        data: jpegData,
      };

      const result = await validateFile(file);

      // Log errors for debugging if test fails
      if (!result.valid) {
        console.log('JPEG validation errors:', result.errors);
      }

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fileInfo).toBeDefined();
      expect(result.fileInfo?.mimeType).toBe('image/jpeg');
    });

    it('should validate a valid PNG file', async () => {
      // PNG magic bytes with safe padding
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
      ]);

      const file: UploadedFile = {
        filename: 'test.png',
        mimetype: 'image/png',
        data: pngData,
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject file exceeding max size', async () => {
      // Create large buffer with safe content (spaces)
      const largeData = Buffer.alloc(15 * 1024 * 1024, 0x20);

      const file: UploadedFile = {
        filename: 'large.txt',
        mimetype: 'text/plain',
        data: largeData,
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
    });

    it('should reject empty file', async () => {
      const file: UploadedFile = {
        filename: 'empty.txt',
        mimetype: 'text/plain',
        data: Buffer.alloc(0),
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject disallowed MIME type', async () => {
      const file: UploadedFile = {
        filename: 'script.exe',
        mimetype: 'application/x-executable',
        data: Buffer.from('MZ test content'),
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not allowed'))).toBe(true);
    });

    it('should reject disallowed extension', async () => {
      const file: UploadedFile = {
        filename: 'script.exe',
        mimetype: 'text/plain',
        data: Buffer.from('some content'),
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('extension'))).toBe(true);
    });

    it('should reject file with mismatched magic bytes', async () => {
      // Claiming JPEG but has PNG magic bytes, with safe padding
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
      ]);

      const file: UploadedFile = {
        filename: 'fake.jpg',
        mimetype: 'image/jpeg',
        data: pngData,
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('does not match'))).toBe(true);
    });

    it('should allow text files without magic byte verification', async () => {
      const file: UploadedFile = {
        filename: 'data.json',
        mimetype: 'application/json',
        data: Buffer.from('{"key": "value"}'),
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(true);
    });

    it('should detect executable content in image', async () => {
      // JPEG header with PHP code embedded
      const maliciousData = Buffer.concat([
        Buffer.from([0xFF, 0xD8, 0xFF]),
        Buffer.from('<?php evil(); ?>')
      ]);

      const file: UploadedFile = {
        filename: 'malicious.jpg',
        mimetype: 'image/jpeg',
        data: maliciousData,
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('executable content'))).toBe(true);
    });

    it('should detect script tags in image', async () => {
      const maliciousData = Buffer.concat([
        Buffer.from([0xFF, 0xD8, 0xFF]),
        Buffer.from('<script>alert(1)</script>')
      ]);

      const file: UploadedFile = {
        filename: 'xss.jpg',
        mimetype: 'image/jpeg',
        data: maliciousData,
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('executable content'))).toBe(true);
    });

    it('should include file hash in validation result for valid file', async () => {
      // Use a simple text file which doesn't have magic byte or executable checks
      const file: UploadedFile = {
        filename: 'test.txt',
        mimetype: 'text/plain',
        data: Buffer.from('Hello, this is a test file content.'),
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.fileInfo).toBeDefined();
      expect(result.fileInfo?.hash).toBeDefined();
      expect(result.fileInfo?.hash).toHaveLength(64); // SHA-256 hex
    });

    it('should return file info with correct properties', async () => {
      const file: UploadedFile = {
        filename: 'data.csv',
        mimetype: 'text/csv',
        data: Buffer.from('name,value\ntest,123'),
      };

      const result = await validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.fileInfo).toEqual({
        size: expect.any(Number),
        mimeType: 'text/csv',
        extension: '.csv',
        hash: expect.any(String),
      });
    });
  });

  describe('scanFileForViruses', () => {
    it('should return clean=true when virus scanning disabled', async () => {
      setUploadConfig({ virusScanEnabled: false });

      const result = await scanFileForViruses(Buffer.from('test'), 'test.txt');

      expect(result.clean).toBe(true);
      expect(result.scanTime).toBe(0);
    });

    it('should call virus scanner when enabled', async () => {
      setUploadConfig({
        virusScanEnabled: true,
        virusScannerUrl: 'http://test-scanner/scan',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ clean: true }),
      });

      const result = await scanFileForViruses(Buffer.from('test'), 'test.txt');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://test-scanner/scan',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.clean).toBe(true);
    });

    it('should return threat info when virus detected', async () => {
      setUploadConfig({
        virusScanEnabled: true,
        virusScannerUrl: 'http://test-scanner/scan',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ clean: false, threat: 'EICAR-Test-Virus' }),
      });

      const result = await scanFileForViruses(Buffer.from('test'), 'test.txt');

      expect(result.clean).toBe(false);
      expect(result.threat).toBe('EICAR-Test-Virus');
    });

    it('should handle scanner errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      setUploadConfig({
        virusScanEnabled: true,
        virusScannerUrl: 'http://test-scanner/scan',
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await scanFileForViruses(Buffer.from('test'), 'test.txt');

      expect(result.clean).toBe(false);
      expect(result.error).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow files when scanner unavailable in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      setUploadConfig({
        virusScanEnabled: true,
        virusScannerUrl: 'http://test-scanner/scan',
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await scanFileForViruses(Buffer.from('test'), 'test.txt');

      expect(result.clean).toBe(true);
      expect(result.error).toContain('Scan skipped');

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle non-OK response from scanner', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      setUploadConfig({
        virusScanEnabled: true,
        virusScannerUrl: 'http://test-scanner/scan',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await scanFileForViruses(Buffer.from('test'), 'test.txt');

      expect(result.clean).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Configuration', () => {
    it('should get current config', () => {
      const config = getUploadConfig();

      expect(config.maxFileSize).toBeDefined();
      expect(config.allowedMimeTypes).toBeDefined();
      expect(config.maxFiles).toBeDefined();
    });

    it('should update config partially', () => {
      setUploadConfig({ maxFileSize: 5 * 1024 * 1024 });

      expect(getUploadConfig().maxFileSize).toBe(5 * 1024 * 1024);
      expect(getUploadConfig().maxFiles).toBe(5); // Unchanged
    });
  });

  describe('createUploadMiddleware', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockStatus: jest.Mock;

    beforeEach(() => {
      mockSend = jest.fn().mockReturnThis();
      mockStatus = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        status: mockStatus,
        send: mockSend,
      };

      mockRequest = {
        isMultipart: jest.fn().mockReturnValue(false),
      } as any;
    });

    it('should skip non-multipart requests', async () => {
      const middleware = createUploadMiddleware();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should return 400 when max files exceeded', async () => {
      (mockRequest as any).isMultipart = jest.fn().mockReturnValue(true);

      const files = [];
      for (let i = 0; i < 10; i++) {
        files.push({
          type: 'file',
          filename: `file${i}.txt`,
          mimetype: 'text/plain',
          encoding: '7bit',
          file: (async function* () {
            yield Buffer.from('test content');
          })(),
        });
      }

      (mockRequest as any).parts = jest.fn().mockReturnValue((async function* () {
        for (const file of files) {
          yield file;
        }
      })());

      const middleware = createUploadMiddleware({ maxFiles: 5 });

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TOO_MANY_FILES',
        })
      );
    });
  });

  describe('Pre-configured middlewares', () => {
    it('should have imageUploadMiddleware', () => {
      expect(typeof imageUploadMiddleware).toBe('function');
    });

    it('should have documentUploadMiddleware', () => {
      expect(typeof documentUploadMiddleware).toBe('function');
    });
  });
});
