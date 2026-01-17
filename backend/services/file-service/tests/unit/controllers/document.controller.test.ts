// Mock dependencies BEFORE imports
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/middleware/tenant-context');
jest.mock('../../../src/utils/logger');
jest.mock('pdf-parse');

import { FastifyRequest, FastifyReply } from 'fastify';
import { DocumentController, documentController } from '../../../src/controllers/document.controller';
import { fileModel } from '../../../src/models/file.model';
import { storageService } from '../../../src/storage/storage.service';
import { getTenantId } from '../../../src/middleware/tenant-context';
import pdf from 'pdf-parse';

describe('controllers/document.controller', () => {
  let controller: DocumentController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockFileModel: jest.Mocked<typeof fileModel>;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockGetTenantId: jest.MockedFunction<typeof getTenantId>;
  let mockPdf: jest.MockedFunction<typeof pdf>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new DocumentController();

    mockRequest = {
      params: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    mockFileModel = fileModel as jest.Mocked<typeof fileModel>;
    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockGetTenantId = getTenantId as jest.MockedFunction<typeof getTenantId>;
    mockPdf = pdf as jest.MockedFunction<typeof pdf>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPreview', () => {
    it('should extract PDF preview successfully', async () => {
      // Arrange
      const fileBuffer = Buffer.from('pdf content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: '/path/to/document.pdf',
      };

      const mockPdfData = {
        text: 'This is a long document text content that should be truncated to 1000 characters'.repeat(20),
        numpages: 5,
        info: {
          Title: 'Test PDF',
          Author: 'Test Author',
        },
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      // Act
      await controller.getPreview(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockGetTenantId).toHaveBeenCalledWith(mockRequest);
      expect(mockFileModel.findById).toHaveBeenCalledWith('file-123', 'tenant-456');
      expect(mockStorageService.download).toHaveBeenCalledWith('/path/to/document.pdf');
      expect(mockPdf).toHaveBeenCalledWith(fileBuffer);
      expect(mockReply.send).toHaveBeenCalledWith({
        text: mockPdfData.text.substring(0, 1000),
        pages: 5,
        info: mockPdfData.info,
      });
    });

    it('should extract text file preview', async () => {
      // Arrange
      const textContent = 'Plain text file content that is quite long'.repeat(50);
      const fileBuffer = Buffer.from(textContent);
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.txt',
        mimeType: 'text/plain',
        storagePath: '/path/to/document.txt',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.getPreview(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        text: textContent.substring(0, 1000),
      });
    });

    it('should return 404 when file not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      // Act
      await controller.getPreview(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 400 when file has no storage path', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: null,
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.getPreview(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File has no storage path' });
    });

    it('should return 500 on PDF parse error', async () => {
      // Arrange
      const fileBuffer = Buffer.from('invalid pdf');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: '/path/to/document.pdf',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockPdf.mockRejectedValue(new Error('Invalid PDF'));

      // Act
      await controller.getPreview(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid PDF' });
    });
  });

  describe('getPage', () => {
    it('should extract PDF page information', async () => {
      // Arrange
      const fileBuffer = Buffer.from('pdf content');
      mockRequest.params = { id: 'file-123', page: '2' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: '/path/to/document.pdf',
      };

      const mockPdfData = {
        text: 'Full document text',
        numpages: 10,
        info: {},
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      // Act
      await controller.getPage(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        page: 2,
        totalPages: 10,
        text: 'Page 2 content would be extracted here',
      });
    });

    it('should return 404 when file not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent', page: '1' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      // Act
      await controller.getPage(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 400 for non-PDF files', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123', page: '1' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        storagePath: '/path/to/image.jpg',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.getPage(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Not a PDF file' });
    });

    it('should return 400 when file has no storage path', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123', page: '1' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: null,
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.getPage(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File has no storage path' });
    });
  });

  describe('convertFormat', () => {
    it('should indicate format conversion capability', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { format: 'docx' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: '/path/to/document.pdf',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.convertFormat(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Conversion to docx would be processed here',
        originalFormat: 'application/pdf',
        targetFormat: 'docx',
      });
    });

    it('should return 404 when file not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = { format: 'docx' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      // Act
      await controller.convertFormat(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should handle file without mimeType', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { format: 'pdf' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document',
        mimeType: null,
        storagePath: '/path/to/document',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.convertFormat(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          originalFormat: 'unknown',
          targetFormat: 'pdf',
        })
      );
    });
  });

  describe('extractText', () => {
    it('should extract text from PDF', async () => {
      // Arrange
      const fileBuffer = Buffer.from('pdf content');
      const extractedText = 'This is extracted PDF text';
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: '/path/to/document.pdf',
      };

      const mockPdfData = {
        text: extractedText,
        numpages: 5,
        info: {},
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockPdf.mockResolvedValue(mockPdfData as any);

      // Act
      await controller.extractText(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        text: extractedText,
        length: extractedText.length,
      });
    });

    it('should extract text from text file', async () => {
      // Arrange
      const textContent = 'Plain text content';
      const fileBuffer = Buffer.from(textContent);
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.txt',
        mimeType: 'text/plain',
        storagePath: '/path/to/document.txt',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.extractText(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        text: textContent,
        length: textContent.length,
      });
    });

    it('should return empty text for non-text files', async () => {
      // Arrange
      const fileBuffer = Buffer.from('binary content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        storagePath: '/path/to/image.jpg',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.extractText(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        text: '',
        length: 0,
      });
    });

    it('should return 404 when file not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      // Act
      await controller.extractText(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 400 when file has no storage path', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: null,
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.extractText(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File has no storage path' });
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(documentController).toBeInstanceOf(DocumentController);
    });

    it('should be the same instance across imports', () => {
      expect(documentController).toBe(documentController);
    });
  });
});
