/**
 * Unit Tests for DocumentService
 *
 * Tests document storage, retrieval, and W9 validation
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
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

// Mock fs module
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync
}));

// Mock uuid - use literal string to avoid hoisting issues
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234-5678-9012')
}));

// Import fixtures AFTER uuid mock
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// Import module under test AFTER mocks
import { DocumentService, documentService } from '../../../src/services/document.service';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;
const TEST_UUID = 'test-uuid-1234-5678-9012';

// =============================================================================
// TESTS
// =============================================================================

describe('DocumentService', () => {
  let service: DocumentService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true); // Directory exists by default
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockWriteFileSync.mockImplementation(() => {}); // Reset to default no-op implementation
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create upload directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      new DocumentService();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });

    it('should not create directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true);

      new DocumentService();

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // storeDocument Tests
  // ===========================================================================

  describe('storeDocument', () => {
    const TEST_BUFFER = Buffer.from('test document content');
    const TEST_ORIGINAL_NAME = 'tax_form.pdf';
    const TEST_DOCUMENT_TYPE = 'W9';

    beforeEach(() => {
      service = new DocumentService();
    });

    describe('file storage', () => {
      it('should generate unique document ID', async () => {
        const documentId = await service.storeDocument(
          TEST_VENUE_ID,
          TEST_DOCUMENT_TYPE,
          TEST_BUFFER,
          TEST_ORIGINAL_NAME,
          TEST_TENANT_ID
        );

        expect(documentId).toBe(`doc_${TEST_UUID}`);
      });

      it('should write file to disk with correct filename format', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          TEST_DOCUMENT_TYPE,
          TEST_BUFFER,
          TEST_ORIGINAL_NAME,
          TEST_TENANT_ID
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`${TEST_VENUE_ID}_${TEST_DOCUMENT_TYPE}_doc_${TEST_UUID}\\.pdf$`)),
          TEST_BUFFER
        );
      });

      it('should preserve file extension from original name', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          'ID',
          TEST_BUFFER,
          'photo.jpg',
          TEST_TENANT_ID
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('.jpg'),
          TEST_BUFFER
        );
      });

      it('should handle files without extension', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          'OTHER',
          TEST_BUFFER,
          'filename_no_ext',
          TEST_TENANT_ID
        );

        expect(mockWriteFileSync).toHaveBeenCalled();
      });
    });

    describe('database persistence', () => {
      it('should store document reference in compliance_documents table', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          TEST_DOCUMENT_TYPE,
          TEST_BUFFER,
          TEST_ORIGINAL_NAME,
          TEST_TENANT_ID
        );

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_documents'),
          expect.arrayContaining([
            `doc_${TEST_UUID}`,
            TEST_VENUE_ID,
            TEST_DOCUMENT_TYPE,
            expect.stringContaining(`${TEST_VENUE_ID}_${TEST_DOCUMENT_TYPE}`),
            TEST_ORIGINAL_NAME,
            expect.any(String), // filepath
            TEST_TENANT_ID
          ])
        );
      });

      it('should include tenant_id in database record', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          TEST_DOCUMENT_TYPE,
          TEST_BUFFER,
          TEST_ORIGINAL_NAME,
          TEST_TENANT_ID
        );

        const insertCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('INSERT INTO compliance_documents')
        );
        expect(insertCall[1]).toContain(TEST_TENANT_ID);
      });
    });

    describe('W9 document handling', () => {
      it('should update venue_verifications when document type is W9', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          'W9',
          TEST_BUFFER,
          TEST_ORIGINAL_NAME,
          TEST_TENANT_ID
        );

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE venue_verifications'),
          [TEST_VENUE_ID, TEST_TENANT_ID]
        );
      });

      it('should set w9_uploaded to true for W9 documents', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          'W9',
          TEST_BUFFER,
          TEST_ORIGINAL_NAME,
          TEST_TENANT_ID
        );

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('w9_uploaded = true'),
          expect.any(Array)
        );
      });

      it('should NOT update venue_verifications for non-W9 documents', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          'ID',
          TEST_BUFFER,
          'id_card.jpg',
          TEST_TENANT_ID
        );

        const updateCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('UPDATE venue_verifications')
        );
        expect(updateCall).toBeUndefined();
      });
    });

    describe('logging', () => {
      it('should log successful document storage', async () => {
        await service.storeDocument(
          TEST_VENUE_ID,
          TEST_DOCUMENT_TYPE,
          TEST_BUFFER,
          TEST_ORIGINAL_NAME,
          TEST_TENANT_ID
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`Document stored: ${TEST_DOCUMENT_TYPE}`)
        );
      });
    });

    describe('error handling', () => {
      it('should throw and log error when file write fails', async () => {
        const writeError = new Error('Disk full');
        mockWriteFileSync.mockImplementation(() => { throw writeError; });

        await expect(
          service.storeDocument(
            TEST_VENUE_ID,
            TEST_DOCUMENT_TYPE,
            TEST_BUFFER,
            TEST_ORIGINAL_NAME,
            TEST_TENANT_ID
          )
        ).rejects.toThrow('Disk full');

        expect(mockLogger.error).toHaveBeenCalledWith(
          { error: writeError },
          'Error storing document:'
        );
      });

      it('should throw error when database insert fails', async () => {
        mockDbQuery.mockRejectedValue(new Error('DB connection lost'));

        await expect(
          service.storeDocument(
            TEST_VENUE_ID,
            TEST_DOCUMENT_TYPE,
            TEST_BUFFER,
            TEST_ORIGINAL_NAME,
            TEST_TENANT_ID
          )
        ).rejects.toThrow('DB connection lost');
      });
    });
  });

  // ===========================================================================
  // getDocument Tests
  // ===========================================================================

  describe('getDocument', () => {
    const TEST_DOCUMENT_ID = 'doc_test-1234';
    const TEST_FILE_CONTENT = Buffer.from('file content');

    beforeEach(() => {
      service = new DocumentService();
      mockReadFileSync.mockReturnValue(TEST_FILE_CONTENT);
    });

    it('should return document buffer, filename, and content type', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{
          document_id: TEST_DOCUMENT_ID,
          storage_path: '/uploads/test.pdf',
          original_name: 'original.pdf'
        }]
      });

      const result = await service.getDocument(TEST_DOCUMENT_ID, TEST_TENANT_ID);

      expect(result).toEqual({
        buffer: TEST_FILE_CONTENT,
        filename: 'original.pdf',
        contentType: 'application/pdf'
      });
    });

    it('should query with document_id and tenant_id', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{
          storage_path: '/uploads/test.pdf',
          original_name: 'test.pdf'
        }]
      });

      await service.getDocument(TEST_DOCUMENT_ID, TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE document_id = $1 AND tenant_id = $2'),
        [TEST_DOCUMENT_ID, TEST_TENANT_ID]
      );
    });

    it('should throw error when document not found', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await expect(
        service.getDocument(TEST_DOCUMENT_ID, TEST_TENANT_ID)
      ).rejects.toThrow('Document not found');
    });

    it('should throw error when document belongs to different tenant', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] }); // Tenant filter returns nothing

      await expect(
        service.getDocument(TEST_DOCUMENT_ID, TENANT_FIXTURES.secondary.id)
      ).rejects.toThrow('Document not found');
    });

    it('should read file from storage_path', async () => {
      const storagePath = '/var/uploads/document.pdf';
      mockDbQuery.mockResolvedValue({
        rows: [{
          storage_path: storagePath,
          original_name: 'test.pdf'
        }]
      });

      await service.getDocument(TEST_DOCUMENT_ID, TEST_TENANT_ID);

      expect(mockReadFileSync).toHaveBeenCalledWith(storagePath);
    });
  });

  // ===========================================================================
  // getContentType Tests
  // ===========================================================================

  describe('getContentType (via getDocument)', () => {
    beforeEach(() => {
      service = new DocumentService();
      mockReadFileSync.mockReturnValue(Buffer.from('content'));
    });

    const testCases = [
      { filename: 'document.pdf', expected: 'application/pdf' },
      { filename: 'image.jpg', expected: 'image/jpeg' },
      { filename: 'image.jpeg', expected: 'image/jpeg' },
      { filename: 'photo.png', expected: 'image/png' },
      { filename: 'letter.doc', expected: 'application/msword' },
      { filename: 'report.docx', expected: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { filename: 'unknown.xyz', expected: 'application/octet-stream' },
      { filename: 'noextension', expected: 'application/octet-stream' }
    ];

    testCases.forEach(({ filename, expected }) => {
      it(`should return "${expected}" for ${filename}`, async () => {
        mockDbQuery.mockResolvedValue({
          rows: [{
            storage_path: '/uploads/test',
            original_name: filename
          }]
        });

        const result = await service.getDocument('doc_123', TEST_TENANT_ID);

        expect(result.contentType).toBe(expected);
      });
    });

    it('should handle uppercase extensions', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{
          storage_path: '/uploads/test',
          original_name: 'document.PDF'
        }]
      });

      const result = await service.getDocument('doc_123', TEST_TENANT_ID);

      expect(result.contentType).toBe('application/pdf');
    });
  });

  // ===========================================================================
  // validateW9 Tests
  // ===========================================================================

  describe('validateW9', () => {
    beforeEach(() => {
      service = new DocumentService();
    });

    it('should return true (mock implementation)', async () => {
      const result = await service.validateW9(TEST_VENUE_ID, '12-3456789');

      expect(result).toBe(true);
    });

    it('should log validation success', async () => {
      await service.validateW9(TEST_VENUE_ID, '12-3456789');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`W-9 validated for venue ${TEST_VENUE_ID}`)
      );
    });

    it('should accept any EIN format (mock)', async () => {
      const result = await service.validateW9(TEST_VENUE_ID, 'invalid-ein');

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('documentService singleton', () => {
    it('should export a singleton instance', () => {
      expect(documentService).toBeInstanceOf(DocumentService);
    });
  });
});
