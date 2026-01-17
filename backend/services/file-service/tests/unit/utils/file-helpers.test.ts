// Mock dependencies
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

describe('utils/file-helpers', () => {
  let generateFileHash: any;
  let generateStorageKey: any;
  let generateFileId: any;
  let getMimeTypeCategory: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const helpers = require('../../../src/utils/file-helpers');
    generateFileHash = helpers.generateFileHash;
    generateStorageKey = helpers.generateStorageKey;
    generateFileId = helpers.generateFileId;
    getMimeTypeCategory = helpers.getMimeTypeCategory;
  });

  describe('generateFileHash', () => {
    it('should generate SHA256 hash of buffer', () => {
      const buffer = Buffer.from('test content');
      const hash = generateFileHash(buffer);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 produces 64 hex characters
    });

    it('should generate consistent hash for same content', () => {
      const buffer = Buffer.from('same content');
      const hash1 = generateFileHash(buffer);
      const hash2 = generateFileHash(buffer);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const buffer1 = Buffer.from('content 1');
      const buffer2 = Buffer.from('content 2');

      const hash1 = generateFileHash(buffer1);
      const hash2 = generateFileHash(buffer2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from('');
      const hash = generateFileHash(buffer);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should generate valid hex string', () => {
      const buffer = Buffer.from('test');
      const hash = generateFileHash(buffer);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle large buffers', () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const buffer = Buffer.from(largeContent);
      const hash = generateFileHash(buffer);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });

  describe('generateStorageKey', () => {
    beforeEach(() => {
      // Mock current date
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-03-15T10:30:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should generate storage key with entity type and ID', () => {
      const key = generateStorageKey('file-123', 'document.pdf', 'event', 'event-456');

      expect(key).toBe('event/event-456/2024/03/file-123/document.pdf');
    });

    it('should use general path when entity type not provided', () => {
      const key = generateStorageKey('file-123', 'image.jpg');

      expect(key).toBe('general/2024/03/file-123/image.jpg');
    });

    it('should use general path when only entity type provided', () => {
      const key = generateStorageKey('file-123', 'file.txt', 'venue');

      expect(key).toBe('general/2024/03/file-123/file.txt');
    });

    it('should pad month with zero', () => {
      jest.setSystemTime(new Date('2024-01-15T10:30:00Z'));
      const key = generateStorageKey('file-123', 'file.txt', 'user', 'user-789');

      expect(key).toContain('/2024/01/');
    });

    it('should use file ID passed in, not generate new one', () => {
      const fileId = 'specific-file-id-789';
      const key = generateStorageKey(fileId, 'test.pdf');

      expect(key).toContain(`/${fileId}/`);
      expect(key).toBe('general/2024/03/specific-file-id-789/test.pdf');
    });

    it('should preserve filename exactly', () => {
      const filename = 'My Document (v2).pdf';
      const key = generateStorageKey('file-123', filename, 'ticket', 'ticket-001');

      expect(key).toContain(filename);
      expect(key).toBe('ticket/ticket-001/2024/03/file-123/My Document (v2).pdf');
    });

    it('should handle different months', () => {
      jest.setSystemTime(new Date('2024-12-25T10:30:00Z'));
      const key = generateStorageKey('file-123', 'christmas.jpg');

      expect(key).toContain('/2024/12/');
    });

    it('should create hierarchical structure', () => {
      const key = generateStorageKey('abc-123', 'report.xlsx', 'venue', 'venue-999');

      const parts = key.split('/');
      expect(parts).toHaveLength(6);
      expect(parts[0]).toBe('venue');
      expect(parts[1]).toBe('venue-999');
      expect(parts[2]).toBe('2024');
      expect(parts[3]).toBe('03');
      expect(parts[4]).toBe('abc-123');
      expect(parts[5]).toBe('report.xlsx');
    });
  });

  describe('generateFileId', () => {
    it('should generate UUID v4', () => {
      const id = generateFileId();

      expect(id).toBe('mock-uuid-1234');
    });

    it('should call uuid.v4', () => {
      const { v4 } = require('uuid');

      generateFileId();

      expect(v4).toHaveBeenCalled();
    });

    it('should return string', () => {
      const id = generateFileId();

      expect(typeof id).toBe('string');
    });
  });

  describe('getMimeTypeCategory', () => {
    describe('image types', () => {
      it('should categorize image/jpeg as image', () => {
        expect(getMimeTypeCategory('image/jpeg')).toBe('image');
      });

      it('should categorize image/png as image', () => {
        expect(getMimeTypeCategory('image/png')).toBe('image');
      });

      it('should categorize image/gif as image', () => {
        expect(getMimeTypeCategory('image/gif')).toBe('image');
      });

      it('should categorize image/webp as image', () => {
        expect(getMimeTypeCategory('image/webp')).toBe('image');
      });

      it('should categorize image/svg+xml as image', () => {
        expect(getMimeTypeCategory('image/svg+xml')).toBe('image');
      });
    });

    describe('video types', () => {
      it('should categorize video/mp4 as video', () => {
        expect(getMimeTypeCategory('video/mp4')).toBe('video');
      });

      it('should categorize video/webm as video', () => {
        expect(getMimeTypeCategory('video/webm')).toBe('video');
      });

      it('should categorize video/quicktime as video', () => {
        expect(getMimeTypeCategory('video/quicktime')).toBe('video');
      });
    });

    describe('document types', () => {
      it('should categorize application/pdf as document', () => {
        expect(getMimeTypeCategory('application/pdf')).toBe('document');
      });

      it('should categorize application/msword as other (no pdf/document in name)', () => {
        expect(getMimeTypeCategory('application/msword')).toBe('other');
      });

      it('should categorize application/vnd.openxmlformats-officedocument.wordprocessingml.document as document', () => {
        expect(getMimeTypeCategory('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
      });

      it('should categorize types with pdf in name as document', () => {
        expect(getMimeTypeCategory('application/x-pdf')).toBe('document');
      });

      it('should categorize types with document in name as document', () => {
        expect(getMimeTypeCategory('application/vnd.document')).toBe('document');
      });
    });

    describe('other types', () => {
      it('should categorize audio as other', () => {
        expect(getMimeTypeCategory('audio/mpeg')).toBe('other');
      });

      it('should categorize text as other', () => {
        expect(getMimeTypeCategory('text/plain')).toBe('other');
      });

      it('should categorize application/json as other', () => {
        expect(getMimeTypeCategory('application/json')).toBe('other');
      });

      it('should categorize application/zip as other', () => {
        expect(getMimeTypeCategory('application/zip')).toBe('other');
      });

      it('should categorize unknown type as other', () => {
        expect(getMimeTypeCategory('unknown/type')).toBe('other');
      });

      it('should categorize empty string as other', () => {
        expect(getMimeTypeCategory('')).toBe('other');
      });
    });

    describe('edge cases', () => {
      it('should handle case sensitivity for image types', () => {
        expect(getMimeTypeCategory('IMAGE/JPEG')).toBe('other'); // Case matters
      });

      it('should handle whitespace', () => {
        expect(getMimeTypeCategory('  image/jpeg  ')).toBe('other'); // No trimming
      });

      it('should return correct category for complex MIME types', () => {
        expect(getMimeTypeCategory('image/vnd.adobe.photoshop')).toBe('image');
        expect(getMimeTypeCategory('video/x-msvideo')).toBe('video');
      });
    });
  });
});
