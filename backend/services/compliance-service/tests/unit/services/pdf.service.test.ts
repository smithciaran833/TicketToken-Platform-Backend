/**
 * Unit Tests for PDF Service
 */
const mockPipe = jest.fn();
const mockFontSize = jest.fn().mockReturnThis();
const mockFont = jest.fn().mockReturnThis();
const mockText = jest.fn().mockReturnThis();
const mockRect = jest.fn().mockReturnThis();
const mockStroke = jest.fn().mockReturnThis();
const mockEnd = jest.fn();

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    pipe: mockPipe,
    fontSize: mockFontSize,
    font: mockFont,
    text: mockText,
    rect: mockRect,
    stroke: mockStroke,
    end: mockEnd
  }));
});

const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockCreateWriteStream = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  createWriteStream: mockCreateWriteStream
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PDFService, pdfService } from '../../../src/services/pdf.service';

describe('PDFService', () => {
  let mockStream: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    
    mockStream = {
      on: jest.fn((event: string, callback: Function) => {
        if (event === 'finish') {
          // Simulate async finish
          setImmediate(() => callback());
        }
        return mockStream;
      })
    };
    mockCreateWriteStream.mockReturnValue(mockStream);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create output directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      
      new PDFService();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });

    it('should not create directory if it exists', () => {
      mockExistsSync.mockReturnValue(true);
      
      new PDFService();

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('should use custom path from environment', () => {
      process.env.PDF_OUTPUT_PATH = '/custom/path';
      mockExistsSync.mockReturnValue(false);
      
      new PDFService();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/custom/path',
        { recursive: true }
      );

      delete process.env.PDF_OUTPUT_PATH;
    });
  });

  describe('generate1099K', () => {
    const mockData = {
      venueId: 'venue-123',
      businessName: 'Test Venue LLC',
      ein: '12-3456789',
      year: 2024,
      grossAmount: 150000.50,
      transactionCount: 5000,
      monthlyAmounts: {
        month_1: 10000,
        month_2: 12000,
        month_3: 11000,
        month_4: 13000,
        month_5: 12500,
        month_6: 14000,
        month_7: 15000,
        month_8: 13500,
        month_9: 12000,
        month_10: 11500,
        month_11: 13000,
        month_12: 13000
      }
    };

    it('should generate PDF with correct filename', async () => {
      const filepath = await pdfService.generate1099K(mockData);

      expect(filepath).toContain('1099K_venue-123_2024.pdf');
    });

    it('should create write stream to correct path', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockCreateWriteStream).toHaveBeenCalledWith(
        expect.stringContaining('1099K_venue-123_2024.pdf')
      );
    });

    it('should pipe PDF document to stream', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockPipe).toHaveBeenCalledWith(mockStream);
    });

    it('should set form header', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockText).toHaveBeenCalledWith('Form 1099-K', 50, 50);
    });

    it('should include tax year', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockText).toHaveBeenCalledWith('Tax Year: 2024', 450, 50);
    });

    it('should include business name', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockText).toHaveBeenCalledWith('Test Venue LLC', 300, 140);
    });

    it('should include EIN', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockText).toHaveBeenCalledWith('EIN: 12-3456789', 300, 155);
    });

    it('should include gross amount formatted', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockText).toHaveBeenCalledWith('$150000.50', 450, 255);
    });

    it('should include transaction count', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockText).toHaveBeenCalledWith('5000', 450, 290);
    });

    it('should end the document', async () => {
      await pdfService.generate1099K(mockData);

      expect(mockEnd).toHaveBeenCalled();
    });

    it('should reject on stream error', async () => {
      mockStream.on = jest.fn((event: string, callback: Function) => {
        if (event === 'error') {
          setImmediate(() => callback(new Error('Write failed')));
        }
        return mockStream;
      });

      await expect(pdfService.generate1099K(mockData)).rejects.toThrow('Write failed');
    });

    it('should handle missing monthly amounts', async () => {
      const dataWithMissingMonths = {
        ...mockData,
        monthlyAmounts: { month_1: 5000 }
      };

      const filepath = await pdfService.generate1099K(dataWithMissingMonths);

      expect(filepath).toContain('.pdf');
    });
  });

  describe('generateW9', () => {
    const mockData = {
      businessName: 'Test Business',
      ein: '98-7654321',
      address: '123 Main St, Nashville, TN 37203'
    };

    it('should generate W9 with EIN in filename', async () => {
      const filepath = await pdfService.generateW9(mockData);

      expect(filepath).toContain('W9_98-7654321_');
      expect(filepath).toContain('.pdf');
    });

    it('should include timestamp in filename', async () => {
      const before = Date.now();
      const filepath = await pdfService.generateW9(mockData);
      const after = Date.now();

      // Extract timestamp from filename
      const match = filepath.match(/W9_98-7654321_(\d+)\.pdf/);
      expect(match).toBeTruthy();
      
      const timestamp = parseInt(match![1]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('exported singleton', () => {
    it('should export pdfService instance', () => {
      expect(pdfService).toBeDefined();
      expect(pdfService.generate1099K).toBeInstanceOf(Function);
      expect(pdfService.generateW9).toBeInstanceOf(Function);
    });
  });
});
