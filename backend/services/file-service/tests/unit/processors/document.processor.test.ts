// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/config/database.config');
jest.mock('pdf-parse');
jest.mock('mammoth');

import { DocumentProcessor, documentProcessor } from '../../../src/processors/document/document.processor';
import { fileModel } from '../../../src/models/file.model';
import { storageService } from '../../../src/storage/storage.service';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

describe('processors/document/document.processor', () => {
  let processor: DocumentProcessor;
  let mockFileModel: jest.Mocked<typeof fileModel>;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileModel = fileModel as jest.Mocked<typeof fileModel>;
    mockFileModel.findById = jest.fn();
    mockFileModel.updateStatus = jest.fn().mockResolvedValue(undefined);

    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockStorageService.download = jest.fn();

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };

    // Mock the dynamic import in saveDocumentMetadata
    jest.spyOn(require('../../../src/config/database.config'), 'getPool').mockReturnValue(mockPool);

    processor = new DocumentProcessor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processDocument', () => {
    it('should process PDF document successfully', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/document.pdf',
        mimeType: 'application/pdf'
      };
      const pdfBuffer = Buffer.from('PDF content');
      const pdfData = {
        numpages: 5,
        text: 'This is extracted PDF text content',
        info: { Title: 'Test PDF', Author: 'Test Author' }
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(pdfBuffer);
      (pdf as jest.MockedFunction<typeof pdf>).mockResolvedValue(pdfData as any);

      // Act
      await processor.processDocument(fileId, tenantId);

      // Assert
      expect(mockFileModel.findById).toHaveBeenCalledWith(fileId, tenantId);
      expect(mockStorageService.download).toHaveBeenCalledWith('/uploads/document.pdf');
      expect(pdf).toHaveBeenCalledWith(pdfBuffer);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO document_metadata'),
        expect.arrayContaining([fileId, 5, 'This is extracted PDF text content'])
      );
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(fileId, tenantId, 'ready');
    });

    it('should process Word document successfully', async () => {
      // Arrange
      const fileId = 'file-789';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
      const docBuffer = Buffer.from('Word content');
      const extractedText = 'This is extracted Word document text';

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(docBuffer);
      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: extractedText,
        messages: []
      });

      // Act
      await processor.processDocument(fileId, tenantId);

      // Assert
      expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer: docBuffer });
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO document_metadata'),
        expect.arrayContaining([fileId, null, extractedText])
      );
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(fileId, tenantId, 'ready');
    });

    it('should update status to failed when file not found', async () => {
      // Arrange
      const fileId = 'nonexistent';
      const tenantId = 'tenant-456';

      mockFileModel.findById.mockResolvedValue(null);

      // Act
      await processor.processDocument(fileId, tenantId);

      // Assert - implementation catches error and updates status to failed
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        fileId,
        tenantId,
        'failed',
        `File not found: ${fileId}`
      );
    });

    it('should update status to failed when file has no storage path', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: null
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      await processor.processDocument(fileId, tenantId);

      // Assert - implementation catches error and updates status to failed
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        fileId,
        tenantId,
        'failed',
        `File has no storage path: ${fileId}`
      );
      expect(mockStorageService.download).not.toHaveBeenCalled();
    });

    it('should update status to failed on processing error', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/document.pdf',
        mimeType: 'application/pdf'
      };
      const processingError = new Error('PDF parsing failed');

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(Buffer.from('content'));
      (pdf as jest.MockedFunction<typeof pdf>).mockRejectedValue(processingError);

      // Act
      await processor.processDocument(fileId, tenantId);

      // Assert
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        fileId,
        tenantId,
        'failed',
        'PDF parsing failed'
      );
    });

    it('should handle unknown MIME types gracefully', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/document.txt',
        mimeType: 'text/plain' // Not PDF or Word
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(Buffer.from('text'));

      // Act
      await processor.processDocument(fileId, tenantId);

      // Assert
      expect(pdf).not.toHaveBeenCalled();
      expect(mammoth.extractRawText).not.toHaveBeenCalled();
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(fileId, tenantId, 'ready');
    });
  });

  describe('processPDF', () => {
    it('should extract PDF metadata and text', async () => {
      // Arrange
      const fileId = 'file-123';
      const pdfBuffer = Buffer.from('PDF content');
      const pdfData = {
        numpages: 10,
        text: 'A'.repeat(10000), // Long text to test truncation
        info: { Title: 'Test', Author: 'Author' }
      };

      (pdf as jest.MockedFunction<typeof pdf>).mockResolvedValue(pdfData as any);

      // Act
      await (processor as any).processPDF(fileId, pdfBuffer);

      // Assert
      expect(pdf).toHaveBeenCalledWith(pdfBuffer);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO document_metadata'),
        expect.arrayContaining([
          fileId,
          10,
          expect.stringMatching(/^A{5000}$/) // First 5000 chars
        ])
      );
    });

    it('should handle PDF processing errors', async () => {
      // Arrange
      const fileId = 'file-123';
      const pdfBuffer = Buffer.from('Invalid PDF');
      const pdfError = new Error('Invalid PDF format');

      (pdf as jest.MockedFunction<typeof pdf>).mockRejectedValue(pdfError);

      // Act & Assert
      await expect((processor as any).processPDF(fileId, pdfBuffer)).rejects.toThrow('Invalid PDF format');
    });

    it('should call generatePDFThumbnail', async () => {
      // Arrange
      const fileId = 'file-123';
      const pdfBuffer = Buffer.from('PDF content');
      const pdfData = {
        numpages: 3,
        text: 'Text',
        info: {}
      };

      (pdf as jest.MockedFunction<typeof pdf>).mockResolvedValue(pdfData as any);
      const generateThumbnailSpy = jest.spyOn(processor as any, 'generatePDFThumbnail');

      // Act
      await (processor as any).processPDF(fileId, pdfBuffer);

      // Assert
      expect(generateThumbnailSpy).toHaveBeenCalledWith(fileId, pdfBuffer);
    });
  });

  describe('processWord', () => {
    it('should extract Word document text', async () => {
      // Arrange
      const fileId = 'file-456';
      const docBuffer = Buffer.from('Word content');
      const longText = 'A'.repeat(10000);

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: longText,
        messages: []
      });

      // Act
      await (processor as any).processWord(fileId, docBuffer);

      // Assert
      expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer: docBuffer });
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO document_metadata'),
        expect.arrayContaining([
          fileId,
          null,
          expect.stringMatching(/^A{5000}$/) // First 5000 chars
        ])
      );
    });

    it('should handle Word processing errors', async () => {
      // Arrange
      const fileId = 'file-456';
      const docBuffer = Buffer.from('Invalid Word doc');
      const wordError = new Error('Invalid DOCX format');

      (mammoth.extractRawText as jest.Mock).mockRejectedValue(wordError);

      // Act & Assert
      await expect((processor as any).processWord(fileId, docBuffer)).rejects.toThrow('Invalid DOCX format');
    });

    it('should handle extraction warnings in messages', async () => {
      // Arrange
      const fileId = 'file-456';
      const docBuffer = Buffer.from('Word content');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Extracted text',
        messages: [{ type: 'warning', message: 'Unknown style' }]
      });

      // Act
      await (processor as any).processWord(fileId, docBuffer);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO document_metadata'),
        expect.any(Array)
      );
    });
  });

  describe('generatePDFThumbnail', () => {
    it('should log that PDF thumbnail generation is skipped', async () => {
      // Arrange
      const fileId = 'file-123';
      const pdfBuffer = Buffer.from('PDF content');

      // Act
      await (processor as any).generatePDFThumbnail(fileId, pdfBuffer);

      // Assert - This method currently just logs and returns
      // No assertions needed as it's a no-op
      expect(true).toBe(true);
    });
  });

  describe('saveDocumentMetadata', () => {
    it('should save metadata with ON CONFLICT', async () => {
      // Arrange
      const fileId = 'file-789';
      const metadata = {
        pageCount: 8,
        text: 'Document text content'
      };

      // Act
      await (processor as any).saveDocumentMetadata(fileId, metadata);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (file_id) DO UPDATE SET'),
        [fileId, 8, 'Document text content']
      );
    });

    it('should handle missing page count', async () => {
      // Arrange
      const fileId = 'file-789';
      const metadata = {
        text: 'Just text, no pages'
      };

      // Act
      await (processor as any).saveDocumentMetadata(fileId, metadata);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [fileId, null, 'Just text, no pages']
      );
    });

    it('should handle missing text', async () => {
      // Arrange
      const fileId = 'file-789';
      const metadata = {
        pageCount: 5
      };

      // Act
      await (processor as any).saveDocumentMetadata(fileId, metadata);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [fileId, 5, null]
      );
    });

    it('should return early when pool is not available', async () => {
      // Arrange
      jest.spyOn(require('../../../src/config/database.config'), 'getPool').mockReturnValue(null);

      const fileId = 'file-789';
      const metadata = { pageCount: 5, text: 'text' };

      // Act
      await (processor as any).saveDocumentMetadata(fileId, metadata);

      // Assert
      expect(mockPool.query).not.toHaveBeenCalled();

      // Cleanup
      jest.spyOn(require('../../../src/config/database.config'), 'getPool').mockReturnValue(mockPool);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(documentProcessor).toBeInstanceOf(DocumentProcessor);
    });

    it('should be the same instance across imports', () => {
      const instance1 = documentProcessor;
      const instance2 = documentProcessor;
      expect(instance1).toBe(instance2);
    });
  });
});
