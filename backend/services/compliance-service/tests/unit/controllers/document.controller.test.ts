/**
 * Unit Tests for DocumentController
 *
 * Tests document upload and retrieval functionality
 * Validates file validation, tenant isolation, and error handling
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockDocumentService = {
  storeDocument: jest.fn(),
  getDocument: jest.fn()
};
jest.mock('../../../src/services/document.service', () => ({
  documentService: mockDocumentService
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

const mockRequireTenantId = jest.fn();
jest.mock('../../../src/middleware/tenant.middleware', () => ({
  requireTenantId: mockRequireTenantId
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn()
  }
}));

// Import module under test AFTER mocks
import { DocumentController } from '../../../src/controllers/document.controller';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_SECONDARY_TENANT_ID = TENANT_FIXTURES.secondary.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;
const TEST_DOCUMENT_ID = 'doc-123456';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockFile(overrides: {
  mimetype?: string;
  filename?: string;
  buffer?: Buffer;
  fields?: Record<string, any>;
} = {}) {
  const buffer = overrides.buffer || Buffer.from('test file content');
  return {
    mimetype: overrides.mimetype || 'application/pdf',
    filename: overrides.filename !== undefined ? overrides.filename : 'test-document.pdf',
    toBuffer: jest.fn().mockResolvedValue(buffer),
    fields: overrides.fields || {
      venueId: { value: TEST_VENUE_ID },
      documentType: { value: 'tax_form' }
    }
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('DocumentController', () => {
  let controller: DocumentController;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DocumentController();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequireTenantId.mockReturnValue(TEST_TENANT_ID);
  });

  // ===========================================================================
  // uploadDocument Tests
  // ===========================================================================

  describe('uploadDocument', () => {
    beforeEach(() => {
      mockRequest.file = jest.fn().mockResolvedValue(createMockFile());
      mockDocumentService.storeDocument.mockResolvedValue(TEST_DOCUMENT_ID);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful upload', () => {
      it('should return success with document details', async () => {
        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Document uploaded successfully',
          data: {
            documentId: TEST_DOCUMENT_ID,
            venueId: TEST_VENUE_ID,
            documentType: 'tax_form',
            filename: 'test-document.pdf'
          }
        });
      });

      it('should not set error status code on success', async () => {
        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should call documentService.storeDocument with correct args', async () => {
        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          TEST_VENUE_ID,
          'tax_form',
          expect.any(Buffer),
          'test-document.pdf',
          TEST_TENANT_ID
        );
      });

      it('should log upload with tenant, venue, and type', async () => {
        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_VENUE_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('tax_form')
        );
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should pass tenant ID to document service', async () => {
        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(Buffer),
          expect.any(String),
          TEST_TENANT_ID
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(Buffer),
          expect.any(String),
          TEST_SECONDARY_TENANT_ID
        );
      });
    });

    // -------------------------------------------------------------------------
    // File Validation - No File
    // -------------------------------------------------------------------------

    describe('no file uploaded', () => {
      it('should return 400 when no file provided', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(null);

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'No file uploaded'
        });
      });

      it('should not call document service when no file', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(null);

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // File Validation - File Type
    // -------------------------------------------------------------------------

    describe('file type validation', () => {
      const allowedTypes = [
        { mimetype: 'application/pdf', name: 'PDF' },
        { mimetype: 'image/jpeg', name: 'JPEG' },
        { mimetype: 'image/png', name: 'PNG' }
      ];

      allowedTypes.forEach(({ mimetype, name }) => {
        it(`should accept ${name} files`, async () => {
          mockRequest.file = jest.fn().mockResolvedValue(
            createMockFile({ mimetype })
          );

          await controller.uploadDocument(mockRequest as any, mockReply as any);

          expect(mockReply.code).not.toHaveBeenCalledWith(400);
          expect(mockDocumentService.storeDocument).toHaveBeenCalled();
        });
      });

      const disallowedTypes = [
        { mimetype: 'application/zip', name: 'ZIP' },
        { mimetype: 'text/plain', name: 'TXT' },
        { mimetype: 'application/msword', name: 'DOC' },
        { mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'DOCX' },
        { mimetype: 'image/gif', name: 'GIF' },
        { mimetype: 'image/webp', name: 'WEBP' },
        { mimetype: 'application/javascript', name: 'JS' },
        { mimetype: 'text/html', name: 'HTML' }
      ];

      disallowedTypes.forEach(({ mimetype, name }) => {
        it(`should reject ${name} files`, async () => {
          mockRequest.file = jest.fn().mockResolvedValue(
            createMockFile({ mimetype })
          );

          await controller.uploadDocument(mockRequest as any, mockReply as any);

          expect(mockReply.code).toHaveBeenCalledWith(400);
          expect(mockReply.send).toHaveBeenCalledWith({
            success: false,
            error: 'Invalid file type. Only PDF, JPG, and PNG are allowed.'
          });
        });
      });

      it('should not call document service for invalid file type', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ mimetype: 'application/zip' })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // File Validation - File Size
    // -------------------------------------------------------------------------

    describe('file size validation', () => {
      it('should accept files under 10MB', async () => {
        const buffer = Buffer.alloc(9 * 1024 * 1024); // 9MB
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ buffer })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalledWith(400);
        expect(mockDocumentService.storeDocument).toHaveBeenCalled();
      });

      it('should accept files exactly 10MB', async () => {
        const buffer = Buffer.alloc(10 * 1024 * 1024); // 10MB exactly
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ buffer })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalledWith(400);
        expect(mockDocumentService.storeDocument).toHaveBeenCalled();
      });

      it('should reject files over 10MB', async () => {
        const buffer = Buffer.alloc(10 * 1024 * 1024 + 1); // 10MB + 1 byte
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ buffer })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'File size exceeds 10MB limit'
        });
      });

      it('should reject very large files', async () => {
        const buffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ buffer })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'File size exceeds 10MB limit'
        });
      });

      it('should not call document service for oversized files', async () => {
        const buffer = Buffer.alloc(15 * 1024 * 1024);
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ buffer })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------
    // Field Extraction
    // -------------------------------------------------------------------------

    describe('field extraction', () => {
      it('should extract venueId from fields', async () => {
        const customVenueId = 'custom-venue-123';
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({
            fields: {
              venueId: { value: customVenueId },
              documentType: { value: 'tax_form' }
            }
          })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          customVenueId,
          expect.any(String),
          expect.any(Buffer),
          expect.any(String),
          expect.any(String)
        );
      });

      it('should extract documentType from fields', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({
            fields: {
              venueId: { value: TEST_VENUE_ID },
              documentType: { value: 'w9_form' }
            }
          })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          expect.any(String),
          'w9_form',
          expect.any(Buffer),
          expect.any(String),
          expect.any(String)
        );
      });

      it('should handle missing venueId field', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({
            fields: {
              documentType: { value: 'tax_form' }
            }
          })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          undefined,
          'tax_form',
          expect.any(Buffer),
          expect.any(String),
          expect.any(String)
        );
      });

      it('should handle missing documentType field', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({
            fields: {
              venueId: { value: TEST_VENUE_ID }
            }
          })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          TEST_VENUE_ID,
          undefined,
          expect.any(Buffer),
          expect.any(String),
          expect.any(String)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 500 on document service error', async () => {
        mockDocumentService.storeDocument.mockRejectedValue(
          new Error('Storage service unavailable')
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Storage service unavailable'
        });
      });

      it('should return 500 on file read error', async () => {
        const mockFile = createMockFile();
        mockFile.toBuffer = jest.fn().mockRejectedValue(
          new Error('File read failed')
        );
        mockRequest.file = jest.fn().mockResolvedValue(mockFile);

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'File read failed'
        });
      });

      it('should log error on failure', async () => {
        mockDocumentService.storeDocument.mockRejectedValue(
          new Error('Test error')
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Test error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Tenant ID required');
        });

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Tenant ID required'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle empty filename', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ filename: '' })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(Buffer),
          '',
          expect.any(String)
        );
      });

      it('should handle special characters in filename', async () => {
        const filename = "document (1) [final]'s copy.pdf";
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ filename })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(Buffer),
          filename,
          expect.any(String)
        );
      });

      it('should handle unicode filename', async () => {
        const filename = 'документ_日本語.pdf';
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ filename })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(Buffer),
          filename,
          expect.any(String)
        );
      });

      it('should handle zero-byte file', async () => {
        mockRequest.file = jest.fn().mockResolvedValue(
          createMockFile({ buffer: Buffer.alloc(0) })
        );

        await controller.uploadDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.storeDocument).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // getDocument Tests
  // ===========================================================================

  describe('getDocument', () => {
    const mockDocResult = {
      buffer: Buffer.from('PDF content here'),
      contentType: 'application/pdf',
      filename: 'retrieved-document.pdf'
    };

    beforeEach(() => {
      mockRequest.params = { documentId: TEST_DOCUMENT_ID };
      mockDocumentService.getDocument.mockResolvedValue(mockDocResult);
    });

    // -------------------------------------------------------------------------
    // Success Cases
    // -------------------------------------------------------------------------

    describe('successful retrieval', () => {
      it('should return document buffer', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith(mockDocResult.buffer);
      });

      it('should set Content-Type header', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Content-Type',
          'application/pdf'
        );
      });

      it('should set Content-Disposition header with filename', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Content-Disposition',
          'attachment; filename="retrieved-document.pdf"'
        );
      });

      it('should not set error status code on success', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should log retrieval with tenant and document ID', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_TENANT_ID)
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(TEST_DOCUMENT_ID)
        );
      });
    });

    // -------------------------------------------------------------------------
    // Tenant Isolation
    // -------------------------------------------------------------------------

    describe('tenant isolation', () => {
      it('should require tenant ID from request', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockRequireTenantId).toHaveBeenCalledWith(mockRequest);
        expect(mockRequireTenantId).toHaveBeenCalledTimes(1);
      });

      it('should pass tenant ID to document service', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(
          TEST_DOCUMENT_ID,
          TEST_TENANT_ID
        );
      });

      it('should use correct tenant when multiple tenants exist', async () => {
        mockRequireTenantId.mockReturnValue(TEST_SECONDARY_TENANT_ID);

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(
          TEST_DOCUMENT_ID,
          TEST_SECONDARY_TENANT_ID
        );
      });
    });

    // -------------------------------------------------------------------------
    // Document Service Integration
    // -------------------------------------------------------------------------

    describe('document service integration', () => {
      it('should call getDocument with documentId', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(
          TEST_DOCUMENT_ID,
          expect.any(String)
        );
      });

      it('should be called exactly once per request', async () => {
        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.getDocument).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // Different Content Types
    // -------------------------------------------------------------------------

    describe('content type handling', () => {
      it('should handle JPEG content type', async () => {
        mockDocumentService.getDocument.mockResolvedValue({
          buffer: Buffer.from('JPEG data'),
          contentType: 'image/jpeg',
          filename: 'image.jpg'
        });

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Content-Type',
          'image/jpeg'
        );
      });

      it('should handle PNG content type', async () => {
        mockDocumentService.getDocument.mockResolvedValue({
          buffer: Buffer.from('PNG data'),
          contentType: 'image/png',
          filename: 'image.png'
        });

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Content-Type',
          'image/png'
        );
      });
    });

    // -------------------------------------------------------------------------
    // Error Handling
    // -------------------------------------------------------------------------

    describe('error handling', () => {
      it('should return 404 when document not found', async () => {
        mockDocumentService.getDocument.mockRejectedValue(
          new Error('Document not found')
        );

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Document not found'
        });
      });

      it('should return 404 on access denied (different tenant)', async () => {
        mockDocumentService.getDocument.mockRejectedValue(
          new Error('Access denied')
        );

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Access denied'
        });
      });

      it('should log error on failure', async () => {
        mockDocumentService.getDocument.mockRejectedValue(
          new Error('Storage error')
        );

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Storage error')
        );
      });

      it('should propagate tenant middleware errors', async () => {
        mockRequireTenantId.mockImplementation(() => {
          throw new Error('Invalid tenant');
        });

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid tenant'
        });
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('should handle missing documentId in params', async () => {
        mockRequest.params = {};

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(
          undefined,
          TEST_TENANT_ID
        );
      });

      it('should handle UUID documentId', async () => {
        const uuidDocId = '550e8400-e29b-41d4-a716-446655440000';
        mockRequest.params = { documentId: uuidDocId };

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockDocumentService.getDocument).toHaveBeenCalledWith(
          uuidDocId,
          TEST_TENANT_ID
        );
      });

      it('should handle special characters in filename for Content-Disposition', async () => {
        mockDocumentService.getDocument.mockResolvedValue({
          buffer: Buffer.from('data'),
          contentType: 'application/pdf',
          filename: 'file with spaces & "quotes".pdf'
        });

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.header).toHaveBeenCalledWith(
          'Content-Disposition',
          'attachment; filename="file with spaces & "quotes".pdf"'
        );
      });

      it('should handle large document buffer', async () => {
        const largeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
        mockDocumentService.getDocument.mockResolvedValue({
          buffer: largeBuffer,
          contentType: 'application/pdf',
          filename: 'large-document.pdf'
        });

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith(largeBuffer);
      });

      it('should handle empty buffer', async () => {
        mockDocumentService.getDocument.mockResolvedValue({
          buffer: Buffer.alloc(0),
          contentType: 'application/pdf',
          filename: 'empty.pdf'
        });

        await controller.getDocument(mockRequest as any, mockReply as any);

        expect(mockReply.send).toHaveBeenCalledWith(Buffer.alloc(0));
      });
    });
  });
});
